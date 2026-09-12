import { z } from 'zod';
import fs from 'fs';
import { GeminiService } from './gemini.service.js';
import { CoaExtractionData } from './types.js';
import { logger } from '../../common/logging/logger.js';

export const coaExtractionSchema = z.object({
  documentType: z.string().default('COA'),
  co2PurityPercent: z.number().min(0).max(100).nullable(),
  moisturePercent: z.number().min(0).max(100).nullable(),
  testDate: z.string().nullable(),
  batchReference: z.string().nullable(),
  laboratoryName: z.string().nullable(),
  contaminants: z
    .array(
      z.object({
        name: z.string(),
        value: z.union([z.string(), z.number()]),
        unit: z.string().nullable().optional(),
        sourceText: z.string().nullable().optional(),
      })
    )
    .default([]),
  qualityParameters: z
    .array(
      z.object({
        name: z.string(),
        value: z.union([z.string(), z.number()]),
        unit: z.string().nullable().optional(),
        sourceText: z.string().nullable().optional(),
        sourcePage: z.number().nullable().optional(),
      })
    )
    .default([]),
  extractionNotes: z.array(z.string()).default([]),
  missingFields: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  provenance: z.record(z.any()).optional(),
});

export class CoaExtractionService {
  /**
   * Reads a CoA PDF document from disk and extracts structured quality parameters via Gemini multimodal API.
   * Enforces non-fabrication: missing fields are strictly returned as null.
   * Returns null if Gemini is unconfigured or if processing fails.
   */
  public static async extractFromPdf(filePath: string): Promise<{ data: CoaExtractionData; latencyMs: number } | null> {
    if (!fs.existsSync(filePath)) {
      logger.warn({ filePath }, 'CoA file does not exist on disk.');
      return null;
    }

    if (!GeminiService.isConfigured()) {
      logger.info('Gemini is not configured. CoA AI extraction unavailable; original PDF is preserved.');
      return null;
    }

    const startTime = Date.now();
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const base64Pdf = fileBuffer.toString('base64');

      const systemPrompt = `You are an expert industrial gas quality assurance specialist for CarbonBridge, analyzing commercial CO2 Certificate of Analysis (CoA) PDF documents.
Extract structured chemical quality data from the provided document into strict JSON.

CRITICAL INTEGRITY RULES:
1. Extract ONLY information explicitly visible and stated in the document.
2. DO NOT invent, fabricate, estimate, or guess values.
3. If a field is not present in the document, you MUST return null.
   - For example: if moisture is not tested, moisturePercent: null (NEVER 0).
   - If lab name is missing, laboratoryName: null.
   - If batch/lot reference is missing, batchReference: null.
   - If test date is missing, testDate: null.
4. co2PurityPercent: float percentage between 50.0 and 100.0 (e.g. 99.2).
5. moisturePercent: float percentage (e.g. 0.08) or null.
6. testDate: YYYY-MM-DD string if explicitly stated, or null.
7. batchReference: exact lot/batch ID as written on document, or null.
8. laboratoryName: analytical laboratory or issuing entity name, or null.
9. contaminants: array of detected or measured impurities (e.g., CO, NOx, SOx, Hydrocarbons, Benzene, etc.).
10. qualityParameters: array of all analytical parameters listed with { name, value, unit, sourceText, sourcePage }.
11. missingFields: list of standard CoA parameters not found in this document (e.g., ["moisture", "testDate"]).
12. warnings: list of any document discrepancies, ambiguities, or abnormal readings.`;

      const userPrompt = `Analyze this Certificate of Analysis (CoA) PDF document and extract all quality parameters, purity, moisture, batch reference, test date, and laboratory details according to the schema. Output JSON only.`;

      const parsed = await GeminiService.generateJson<CoaExtractionData>({
        systemPrompt,
        userPrompt,
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Pdf,
        },
        temperature: 0.0,
        timeoutMs: 12000,
      });

      const latencyMs = Date.now() - startTime;

      if (!parsed) {
        logger.warn({ latencyMs }, 'Gemini returned empty or invalid response for CoA PDF extraction.');
        return null;
      }

      // Validate with strict Zod schema
      const validation = coaExtractionSchema.safeParse(parsed);
      if (!validation.success) {
        logger.warn({ errors: validation.error.format() }, 'CoA extraction failed Zod schema validation.');
        return null;
      }

      const validatedData = validation.data;

      // Date normalization: ensure YYYY-MM-DD format if valid
      let normalizedDate: string | null = null;
      if (validatedData.testDate) {
        const match = validatedData.testDate.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
        if (match) {
          normalizedDate = match[0];
        }
      }

      // Explicitly mark missing fields if null
      const missingList = [...(validatedData.missingFields || [])];
      if (validatedData.co2PurityPercent == null && !missingList.includes('co2PurityPercent')) {
        missingList.push('co2PurityPercent');
      }
      if (validatedData.moisturePercent == null && !missingList.includes('moisturePercent')) {
        missingList.push('moisturePercent');
      }
      if (validatedData.batchReference == null && !missingList.includes('batchReference')) {
        missingList.push('batchReference');
      }
      if (validatedData.testDate == null && !missingList.includes('testDate')) {
        missingList.push('testDate');
      }
      if (validatedData.laboratoryName == null && !missingList.includes('laboratoryName')) {
        missingList.push('laboratoryName');
      }

      const finalData: CoaExtractionData = {
        documentType: validatedData.documentType || 'COA',
        co2PurityPercent: validatedData.co2PurityPercent ?? null,
        moisturePercent: validatedData.moisturePercent ?? null,
        testDate: normalizedDate,
        batchReference: validatedData.batchReference ? validatedData.batchReference.trim() : null,
        laboratoryName: validatedData.laboratoryName ? validatedData.laboratoryName.trim() : null,
        contaminants: validatedData.contaminants || [],
        qualityParameters: validatedData.qualityParameters || [],
        extractionNotes: validatedData.extractionNotes || [],
        missingFields: missingList,
        warnings: validatedData.warnings || [],
        provenance: validatedData.provenance || {},
      };

      logger.info(
        {
          latencyMs,
          hasPurity: finalData.co2PurityPercent != null,
          hasBatchRef: finalData.batchReference != null,
          qualityParamsCount: finalData.qualityParameters.length,
        },
        'CoA document extraction completed successfully.'
      );

      return { data: finalData, latencyMs };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      logger.warn({ latencyMs, error: err.message }, 'Failed to extract CoA parameters from PDF.');
      return null;
    }
  }
}
