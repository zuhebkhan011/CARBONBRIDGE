import { z } from 'zod';
import fs from 'fs';
import { GeminiService, GeminiErrorCategory } from './gemini.service.js';
import { CoaExtractionData } from './types.js';
import { logger } from '../../common/logging/logger.js';
import { config } from '../../config/env.js';

const contaminantItemSchema = z.union([
  z.string().transform((str) => {
    const parts = str.split(':');
    if (parts.length > 1) {
      return {
        name: parts[0].trim(),
        value: parts.slice(1).join(':').trim(),
      };
    }
    return { name: str.trim(), value: 'detected' };
  }),
  z.object({
    name: z.string(),
    value: z.union([z.string(), z.number()]).default(''),
    unit: z.string().nullable().optional(),
    sourceText: z.string().nullable().optional(),
  }),
]);

const qualityParameterItemSchema = z.union([
  z.string().transform((str) => {
    const parts = str.split(':');
    if (parts.length > 1) {
      return {
        name: parts[0].trim(),
        value: parts.slice(1).join(':').trim(),
      };
    }
    return { name: str.trim(), value: str.trim() };
  }),
  z.object({
    name: z.string(),
    value: z.union([z.string(), z.number(), z.null()]).transform((v) => (v == null ? 'N/A' : v)),
    unit: z.string().nullable().optional(),
    sourceText: z.string().nullable().optional(),
    sourcePage: z.union([z.number(), z.string()]).transform((v) => (typeof v === 'string' ? parseInt(v, 10) || null : v)).nullable().optional(),
    status: z.string().nullable().optional(),
    specification: z.string().nullable().optional(),
  }),
]);

export const coaExtractionSchema = z.object({
  documentType: z.string().default('COA'),
  co2PurityPercent: z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((val) => {
      if (val == null) return null;
      if (typeof val === 'number') return val;
      const cleaned = parseFloat(String(val).replace(/[^0-9.]/g, ''));
      return isNaN(cleaned) ? null : cleaned;
    })
    .pipe(z.number().min(0).max(100).nullable()),
  moisturePercent: z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((val) => {
      if (val == null) return null;
      if (typeof val === 'number') return val;
      const cleaned = parseFloat(String(val).replace(/[^0-9.]/g, ''));
      return isNaN(cleaned) ? null : cleaned;
    })
    .pipe(z.number().min(0).max(100).nullable()),
  testDate: z.string().nullable().optional(),
  batchReference: z.union([z.string(), z.number()]).transform((v) => (v == null ? null : String(v))).nullable().optional(),
  laboratoryName: z.string().nullable().optional(),
  contaminants: z
    .union([z.array(contaminantItemSchema), z.null(), z.undefined()])
    .transform((val) => val || [])
    .default([]),
  qualityParameters: z
    .union([z.array(qualityParameterItemSchema), z.null(), z.undefined()])
    .transform((val) => val || [])
    .default([]),
  extractionNotes: z
    .union([z.array(z.string()), z.null(), z.undefined()])
    .transform((val) => val || [])
    .default([]),
  missingFields: z
    .union([z.array(z.string()), z.null(), z.undefined()])
    .transform((val) => val || [])
    .default([]),
  warnings: z
    .union([z.array(z.string()), z.null(), z.undefined()])
    .transform((val) => val || [])
    .default([]),
  provenance: z.record(z.any()).optional(),
});

export interface CoaExtractionResult {
  success: boolean;
  data: CoaExtractionData | null;
  latencyMs: number;
  model: string;
  errorCategory?: GeminiErrorCategory;
  errorMessage?: string;
}

export class CoaExtractionService {
  /**
   * Reads a CoA PDF document from disk and extracts structured quality parameters via Gemini multimodal API.
   * Enforces non-fabrication: missing fields are strictly returned as null.
   * Provides detailed error categorization and performance telemetry.
   */
  public static async extractFromPdf(filePath: string): Promise<CoaExtractionResult> {
    const configuredModel = config.GEMINI_MODEL || 'gemini-3.5-flash';

    if (!fs.existsSync(filePath)) {
      logger.warn({ filePath }, 'CoA file does not exist on disk.');
      return {
        success: false,
        data: null,
        latencyMs: 0,
        model: configuredModel,
        errorCategory: 'PDF processing error',
        errorMessage: 'Original CoA file could not be found on disk.',
      };
    }

    if (!GeminiService.isConfigured()) {
      logger.info('Gemini is not configured. CoA AI extraction unavailable; original PDF is preserved.');
      return {
        success: false,
        data: null,
        latencyMs: 0,
        model: configuredModel,
        errorCategory: 'missing API key',
        errorMessage: 'Gemini API key is not configured in environment.',
      };
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
9. contaminants: array of objects with { name: string, value: string | number, unit?: string } (e.g., [{"name": "Moisture", "value": "8.5 ppm", "unit": "ppm"}]).
10. qualityParameters: array of all analytical parameters listed with { name: string, value: string | number, unit?: string, sourceText?: string }.
11. missingFields: list of standard CoA parameters not found in this document (e.g., ["moisture", "testDate"]).
12. warnings: list of any document discrepancies, ambiguities, or abnormal readings.`;

      const userPrompt = `Analyze this Certificate of Analysis (CoA) PDF document and extract all quality parameters, purity, moisture, batch reference, test date, and laboratory details according to the schema. Output JSON only.`;

      const geminiResult = await GeminiService.generateJsonDetailed<CoaExtractionData>({
        systemPrompt,
        userPrompt,
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Pdf,
        },
        temperature: 0.0,
        timeoutMs: 25000,
      });

      const latencyMs = Date.now() - startTime;

      if (!geminiResult.success || !geminiResult.data) {
        logger.warn(
          { latencyMs, errorCategory: geminiResult.errorCategory, model: geminiResult.model },
          'Gemini returned empty or error response for CoA PDF extraction.'
        );
        return {
          success: false,
          data: null,
          latencyMs,
          model: geminiResult.model,
          errorCategory: geminiResult.errorCategory || 'other API error',
          errorMessage: geminiResult.errorMessage || 'AI CoA extraction could not be completed.',
        };
      }

      // Validate with strict Zod schema
      const validation = coaExtractionSchema.safeParse(geminiResult.data);
      if (!validation.success) {
        logger.warn({ errors: validation.error.format() }, 'CoA extraction failed Zod schema validation.');
        return {
          success: false,
          data: null,
          latencyMs,
          model: geminiResult.model,
          errorCategory: 'invalid structured response',
          errorMessage: 'Extracted certificate data failed schema validation.',
        };
      }

      const validatedData = validation.data;

      // Date normalization: ensure YYYY-MM-DD format if valid
      let normalizedDate: string | null = null;
      if (validatedData.testDate) {
        const match = validatedData.testDate.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
        if (match) {
          normalizedDate = match[0];
        } else {
          // If in DD-Mon-YYYY format (e.g. 12-Sep-2026), parse to ISO
          const d = new Date(validatedData.testDate);
          if (!isNaN(d.getTime())) {
            normalizedDate = d.toISOString().split('T')[0];
          }
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
        testDate: normalizedDate || validatedData.testDate || null,
        batchReference: validatedData.batchReference || null,
        laboratoryName: validatedData.laboratoryName || null,
        contaminants: validatedData.contaminants as any,
        qualityParameters: validatedData.qualityParameters as any,
        extractionNotes: validatedData.extractionNotes || [],
        missingFields: missingList,
        warnings: validatedData.warnings || [],
        provenance: {
          extractedAt: new Date().toISOString(),
          model: geminiResult.model,
          latencyMs,
          ...validatedData.provenance,
        },
      };

      logger.info(
        {
          latencyMs,
          hasPurity: finalData.co2PurityPercent != null,
          hasBatchRef: finalData.batchReference != null,
          qualityParamsCount: finalData.qualityParameters.length,
          model: geminiResult.model,
        },
        'CoA document extraction completed successfully.'
      );

      return {
        success: true,
        data: finalData,
        latencyMs,
        model: geminiResult.model,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      logger.error({ err: err.message, latencyMs }, 'Unexpected error extracting CoA from PDF.');
      return {
        success: false,
        data: null,
        latencyMs,
        model: configuredModel,
        errorCategory: 'other API error',
        errorMessage: err.message,
      };
    }
  }
}
