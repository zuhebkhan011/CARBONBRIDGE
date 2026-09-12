import fs from 'fs';
import { prisma } from '../../database/prisma.js';
import { DocumentsService } from '../documents/documents.service.js';
import { CoaExtractionService } from './coa-extraction.service.js';
import { CoaCrossCheckService } from './coa-crosscheck.service.js';
import { CoaAnalysisResponse } from './types.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../common/errors/AppError.js';
import { config } from '../../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import { logger } from '../../common/logging/logger.js';
import { CoaExtractionStatus } from '@prisma/client';

export class CoaService {
  /**
   * Analyzes an uploaded Certificate of Analysis PDF for a batch.
   * Extracts chemical quality parameters via Gemini, cross-checks against registered batch data,
   * stores results in PostgreSQL, prevents duplicate concurrent executions, and allows retrying failed extractions.
   */
  public static async analyzeBatchCoA(
    batchId: string,
    sellerCompanyId: string,
    actorUserId: string,
    isAdmin = false,
    forceRetry = false
  ): Promise<CoaAnalysisResponse> {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        certificate: {
          include: { extraction: true },
        },
      },
    });

    if (!batch) {
      throw new NotFoundError(`Batch '${batchId}' not found.`);
    }

    if (!isAdmin && batch.sellerId !== sellerCompanyId) {
      throw new ForbiddenError('You can only analyze Certificates of Analysis for your own batches.');
    }

    if (!batch.certificate) {
      throw new BadRequestError(`Batch '${batch.batchNumber}' does not have an uploaded Certificate of Analysis.`);
    }

    // Step 6: Verify actual uploaded CoA file exists on disk
    let fileInfo: { filePath: string; originalName: string };
    try {
      fileInfo = await DocumentsService.getCoAFilePath(batch.id);
    } catch {
      throw new NotFoundError('Original CoA file could not be found.');
    }

    const { filePath } = fileInfo;
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('Original CoA file could not be found.');
    }

    const fileStats = fs.statSync(filePath);
    if (fileStats.size === 0) {
      throw new BadRequestError('Uploaded CoA file is empty.');
    }

    const existing = batch.certificate.extraction;

    // Step 4: Prevent duplicate concurrent analysis
    if (existing && existing.status === CoaExtractionStatus.PROCESSING) {
      const msSinceUpdate = Date.now() - existing.updatedAt.getTime();
      // If processing started within last 45 seconds, prevent duplicate concurrent invocation
      if (msSinceUpdate < 45000) {
        logger.info({ batchId, msSinceUpdate }, 'CoA analysis already in progress. Returning PROCESSING state.');
        return {
          batchId: batch.id,
          certificateId: batch.certificate.id,
          status: 'PROCESSING',
          extraction: null,
          crossCheck: null,
          modelName: existing.modelName || 'Gemini Flash',
          modelVersion: existing.modelVersion || config.GEMINI_MODEL || 'gemini-3.5-flash',
          disclaimer: 'CoA analysis is currently processing. Please wait a moment.',
          extractedAt: existing.updatedAt.toISOString(),
        };
      }
    }

    // Step 3 & 7: If already successfully extracted and document has not changed, reuse cached result unless forced
    if (
      !forceRetry &&
      existing &&
      (existing.status === CoaExtractionStatus.EXTRACTED ||
        existing.status === CoaExtractionStatus.REVIEW_REQUIRED ||
        existing.status === CoaExtractionStatus.PARTIAL) &&
      batch.certificate.uploadedAt <= existing.updatedAt
    ) {
      logger.info({ batchId }, 'Reusing existing completed CoA extraction result.');
      const cached = await this.getBatchCoAExtraction(batch.id);
      if (cached) return cached;
    }

    const defaultModel = config.GEMINI_MODEL || 'gemini-3.5-flash';

    // Step 9: Transition to PROCESSING state in DB before starting extraction
    await prisma.coaExtraction.upsert({
      where: { batchId: batch.id },
      create: {
        batchId: batch.id,
        certificateId: batch.certificate.id,
        status: CoaExtractionStatus.PROCESSING,
        crossCheckSummary: 'AI CoA analysis is currently processing...',
        modelName: 'Gemini Flash',
        modelVersion: defaultModel,
      },
      update: {
        status: CoaExtractionStatus.PROCESSING,
        crossCheckSummary: 'AI CoA analysis is currently processing...',
        modelName: 'Gemini Flash',
        modelVersion: defaultModel,
        updatedAt: new Date(),
      },
    });

    // Step 7: Call extraction service on the real PDF
    const extractionResult = await CoaExtractionService.extractFromPdf(filePath);
    const modelName = 'Gemini Flash';
    const modelVersion = extractionResult.model || defaultModel;

    // Step 8 & 11: Handle failure without fabricating data
    if (!extractionResult.success || !extractionResult.data) {
      const errorMsg = extractionResult.errorMessage || 'AI CoA analysis could not be completed.';
      const errorCat = extractionResult.errorCategory || 'other API error';

      const failedRecord = await prisma.coaExtraction.upsert({
        where: { batchId: batch.id },
        create: {
          batchId: batch.id,
          certificateId: batch.certificate.id,
          status: CoaExtractionStatus.FAILED,
          crossCheckSummary: `AI CoA analysis could not be completed (${errorCat}). The original certificate is still available.`,
          warnings: [errorMsg],
          modelName,
          modelVersion,
        },
        update: {
          status: CoaExtractionStatus.FAILED,
          crossCheckSummary: `AI CoA analysis could not be completed (${errorCat}). The original certificate is still available.`,
          warnings: [errorMsg],
          modelName,
          modelVersion,
          updatedAt: new Date(),
        },
      });

      return {
        batchId: batch.id,
        certificateId: batch.certificate.id,
        status: 'FAILED',
        extraction: null,
        crossCheck: null,
        modelName,
        modelVersion,
        disclaimer: `AI CoA analysis could not be completed (${errorCat}). The original certificate is still available.`,
        extractedAt: failedRecord.updatedAt.toISOString(),
      };
    }

    const { data: extracted, latencyMs } = extractionResult;

    // Cross-check extracted data against database batch values
    const { crossCheck, status } = CoaCrossCheckService.crossCheck(extracted, {
      batchNumber: batch.batchNumber,
      purityPercentage: batch.purityPercentage.toNumber(),
    });

    const prismaStatus: CoaExtractionStatus =
      status === 'REVIEW_REQUIRED'
        ? CoaExtractionStatus.REVIEW_REQUIRED
        : status === 'PARTIAL'
        ? CoaExtractionStatus.PARTIAL
        : CoaExtractionStatus.EXTRACTED;

    // Persist extraction record in PostgreSQL
    const saved = await prisma.coaExtraction.upsert({
      where: { batchId: batch.id },
      create: {
        batchId: batch.id,
        certificateId: batch.certificate.id,
        status: prismaStatus,
        documentType: extracted.documentType,
        co2PurityPercent: extracted.co2PurityPercent != null ? extracted.co2PurityPercent : null,
        moisturePercent: extracted.moisturePercent != null ? extracted.moisturePercent : null,
        testDate: extracted.testDate ? new Date(extracted.testDate) : null,
        batchReference: extracted.batchReference,
        laboratoryName: extracted.laboratoryName,
        batchReferenceMatch: crossCheck.batchReferenceMatch,
        purityMatch: crossCheck.purityMatch,
        purityDifference: crossCheck.purityDifference != null ? crossCheck.purityDifference : null,
        crossCheckSummary: crossCheck.summary,
        hasDiscrepancy: crossCheck.hasDiscrepancy,
        qualityParameters: extracted.qualityParameters as any,
        contaminants: extracted.contaminants as any,
        provenance: extracted.provenance as any,
        warnings: extracted.warnings as any,
        missingFields: extracted.missingFields as any,
        modelName,
        modelVersion,
        latencyMs,
      },
      update: {
        status: prismaStatus,
        documentType: extracted.documentType,
        co2PurityPercent: extracted.co2PurityPercent != null ? extracted.co2PurityPercent : null,
        moisturePercent: extracted.moisturePercent != null ? extracted.moisturePercent : null,
        testDate: extracted.testDate ? new Date(extracted.testDate) : null,
        batchReference: extracted.batchReference,
        laboratoryName: extracted.laboratoryName,
        batchReferenceMatch: crossCheck.batchReferenceMatch,
        purityMatch: crossCheck.purityMatch,
        purityDifference: crossCheck.purityDifference != null ? crossCheck.purityDifference : null,
        crossCheckSummary: crossCheck.summary,
        hasDiscrepancy: crossCheck.hasDiscrepancy,
        qualityParameters: extracted.qualityParameters as any,
        contaminants: extracted.contaminants as any,
        provenance: extracted.provenance as any,
        warnings: extracted.warnings as any,
        missingFields: extracted.missingFields as any,
        modelName,
        modelVersion,
        latencyMs,
        updatedAt: new Date(),
      },
    });

    await AuditService.recordEvent({
      entityType: 'CERTIFICATE_OF_ANALYSIS',
      entityId: batch.certificate.id,
      action: 'COA_AI_ANALYZED',
      actorId: actorUserId,
      metadata: {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        status: saved.status,
        hasDiscrepancy: saved.hasDiscrepancy,
        purityExtracted: extracted.co2PurityPercent,
        purityListed: batch.purityPercentage.toNumber(),
      },
    });

    logger.info(
      {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        status: saved.status,
        hasDiscrepancy: saved.hasDiscrepancy,
      },
      'CoA extraction and cross-check successfully persisted.'
    );

    return {
      batchId: batch.id,
      certificateId: batch.certificate.id,
      status: status,
      extraction: extracted,
      crossCheck,
      modelName,
      modelVersion,
      disclaimer:
        'AI Extracted from CoA. This summary extracts structured parameters from the document and does not constitute independent laboratory verification.',
      latencyMs,
      extractedAt: saved.updatedAt.toISOString(),
      co2PurityPercent: extracted.co2PurityPercent != null ? extracted.co2PurityPercent : null,
      moisturePercent: extracted.moisturePercent != null ? extracted.moisturePercent : null,
      testDate: extracted.testDate,
      batchReference: extracted.batchReference,
      laboratoryName: extracted.laboratoryName,
      qualityParameters: extracted.qualityParameters || [],
      contaminants: extracted.contaminants || [],
      hasDiscrepancy: crossCheck.hasDiscrepancy,
      batchReferenceMatch: crossCheck.batchReferenceMatch,
      purityMatch: crossCheck.purityMatch,
      purityDifference: crossCheck.purityDifference,
      crossCheckSummary: crossCheck.summary,
    };
  }

  /**
   * Retrieves stored CoA extraction and cross-check summary for a batch.
   */
  public static async getBatchCoAExtraction(batchId: string): Promise<CoaAnalysisResponse | null> {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        certificate: {
          include: { extraction: true },
        },
      },
    });

    if (!batch || !batch.certificate) {
      return null;
    }

    const extraction = batch.certificate.extraction;
    if (!extraction) {
      return null;
    }

    // Format stored extraction into CoaAnalysisResponse
    const isFailed = extraction.status === CoaExtractionStatus.FAILED;
    const isProcessing = extraction.status === CoaExtractionStatus.PROCESSING;

    const extractionData =
      isFailed || isProcessing
        ? null
        : {
            documentType: extraction.documentType || 'COA',
            co2PurityPercent: extraction.co2PurityPercent ? extraction.co2PurityPercent.toNumber() : null,
            moisturePercent: extraction.moisturePercent ? extraction.moisturePercent.toNumber() : null,
            testDate: extraction.testDate ? extraction.testDate.toISOString().split('T')[0] : null,
            batchReference: extraction.batchReference,
            laboratoryName: extraction.laboratoryName,
            contaminants: (extraction.contaminants as any) || [],
            qualityParameters: (extraction.qualityParameters as any) || [],
            extractionNotes: [],
            missingFields: (extraction.missingFields as any) || [],
            warnings: (extraction.warnings as any) || [],
            provenance: (extraction.provenance as any) || {},
          };

    const crossCheck =
      isFailed || isProcessing
        ? null
        : {
            batchReferenceMatch: extraction.batchReferenceMatch,
            batchReferenceNote: extraction.batchReferenceMatch
              ? `✓ Batch reference matches registered batch (${batch.batchNumber}).`
              : extraction.batchReferenceMatch === false
              ? `⚠ Batch reference mismatch: Document specifies '${extraction.batchReference}', registered batch is '${batch.batchNumber}'.`
              : 'Batch reference not found in CoA document.',
            purityMatch: extraction.purityMatch,
            purityDifference: extraction.purityDifference ? extraction.purityDifference.toNumber() : null,
            purityDifferencePoints: extraction.purityDifference
              ? `${extraction.purityDifference.toNumber() > 0 ? '+' : ''}${extraction.purityDifference.toNumber().toFixed(2)} percentage points`
              : null,
            purityNote: extraction.crossCheckSummary || '',
            hasDiscrepancy: extraction.hasDiscrepancy,
            summary: extraction.crossCheckSummary || 'CoA analysis complete.',
          };

    return {
      batchId: batch.id,
      certificateId: batch.certificate.id,
      status: extraction.status as any,
      extraction: extractionData,
      crossCheck,
      modelName: extraction.modelName || 'Gemini Flash',
      modelVersion: extraction.modelVersion || config.GEMINI_MODEL || 'gemini-3.5-flash',
      disclaimer: isFailed
        ? extraction.crossCheckSummary || 'AI CoA analysis could not be completed. The original certificate is still available.'
        : isProcessing
        ? 'CoA analysis is currently processing. Please wait a moment.'
        : 'AI Extracted from CoA. This summary extracts structured parameters from the document and does not constitute independent laboratory verification.',
      latencyMs: extraction.latencyMs ?? undefined,
      extractedAt: extraction.updatedAt.toISOString(),
      co2PurityPercent: extraction.co2PurityPercent ? extraction.co2PurityPercent.toNumber() : null,
      moisturePercent: extraction.moisturePercent ? extraction.moisturePercent.toNumber() : null,
      testDate: extraction.testDate ? extraction.testDate.toISOString().split('T')[0] : null,
      batchReference: extraction.batchReference,
      laboratoryName: extraction.laboratoryName,
      qualityParameters: (extraction.qualityParameters as any) || [],
      contaminants: (extraction.contaminants as any) || [],
      hasDiscrepancy: extraction.hasDiscrepancy,
      batchReferenceMatch: extraction.batchReferenceMatch,
      purityMatch: extraction.purityMatch,
      purityDifference: extraction.purityDifference ? extraction.purityDifference.toNumber() : null,
      crossCheckSummary: extraction.crossCheckSummary,
    };
  }
}
