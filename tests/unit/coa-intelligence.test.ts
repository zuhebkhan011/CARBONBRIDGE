import { describe, it, expect } from 'vitest';
import { coaExtractionSchema } from '../../src/modules/ai/coa-extraction.service.js';
import { CoaCrossCheckService } from '../../src/modules/ai/coa-crosscheck.service.js';

describe('CoA Intelligence Unit Test Suite', () => {
  describe('Zod Schema Validation & Zero-Fabrication Mandate', () => {
    it('successfully validates a complete CoA extraction payload', () => {
      const validPayload = {
        co2PurityPercent: 99.85,
        moisturePercent: 0.04,
        testDate: '2026-08-15',
        batchReference: 'BATCH-GJT-001',
        laboratoryName: 'SGS India Testing Labs',
        qualityParameters: [
          {
            name: 'Carbon Dioxide Purity',
            value: 99.85,
            unit: '%',
            sourceText: 'Tested Purity: 99.85%',
          },
        ],
        contaminants: [
          {
            name: 'Moisture (H2O)',
            value: 0.04,
            unit: '%',
            sourceText: 'Moisture Content: 0.04%',
          },
        ],
        provenance: {
          pageNumber: 1,
          extractedSnippet: 'CO2 Purity: 99.85%',
        },
        warnings: [],
        missingFields: [],
      };

      const result = coaExtractionSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.co2PurityPercent).toBe(99.85);
        expect(result.data.moisturePercent).toBe(0.04);
        expect(result.data.batchReference).toBe('BATCH-GJT-001');
      }
    });

    it('mandates null for missing values — never fabricates fallback numbers or mock strings', () => {
      const payloadWithMissingValues = {
        co2PurityPercent: null,
        moisturePercent: null,
        testDate: null,
        batchReference: null,
        laboratoryName: null,
        qualityParameters: [],
        contaminants: [],
        warnings: ['Moisture content was not reported in document'],
        missingFields: ['moisturePercent', 'co2PurityPercent'],
      };

      const result = coaExtractionSchema.safeParse(payloadWithMissingValues);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.co2PurityPercent).toBeNull();
        expect(result.data.moisturePercent).toBeNull();
        expect(result.data.laboratoryName).toBeNull();
        expect(result.data.missingFields).toContain('moisturePercent');
      }
    });

    it('rejects invalid purity values outside 0-100% boundary', () => {
      const invalidHighPurity = {
        co2PurityPercent: 105.0, // Invalid: exceeds 100%
        moisturePercent: null,
        testDate: null,
        batchReference: null,
        laboratoryName: null,
      };
      const result = coaExtractionSchema.safeParse(invalidHighPurity);
      expect(result.success).toBe(false);

      const invalidNegativePurity = {
        co2PurityPercent: -5.0, // Invalid: negative
        moisturePercent: null,
        testDate: null,
        batchReference: null,
        laboratoryName: null,
      };
      const negResult = coaExtractionSchema.safeParse(invalidNegativePurity);
      expect(negResult.success).toBe(false);
    });
  });

  describe('CoaCrossCheckService & Discrepancy Detection', () => {
    const mockBatch = {
      batchNumber: 'CB-2026-091',
      purityPercentage: 99.5,
    };

    it('flags consistency when batch ref and purity match within 0.5% tolerance', () => {
      const extracted = {
        documentType: 'COA',
        batchReference: 'CB-2026-091',
        co2PurityPercent: 99.4, // diff = -0.1% (< 0.5%)
        moisturePercent: 0.05,
        testDate: '2026-08-10',
        laboratoryName: 'Bureau Veritas',
        qualityParameters: [],
        contaminants: [],
        extractionNotes: [],
        warnings: [],
        missingFields: [],
      };

      const { crossCheck, status } = CoaCrossCheckService.crossCheck(extracted, mockBatch);

      expect(crossCheck.batchReferenceMatch).toBe(true);
      expect(crossCheck.purityMatch).toBe(true);
      expect(crossCheck.purityDifference).toBeCloseTo(-0.1, 2);
      expect(crossCheck.hasDiscrepancy).toBe(false);
      expect(status).toBe('EXTRACTED');
    });

    it('flags discrepancy when certificate purity differs by more than 0.5%', () => {
      const extracted = {
        documentType: 'COA',
        batchReference: 'CB-2026-091',
        co2PurityPercent: 98.2, // diff = -1.3% (> 0.5%)
        moisturePercent: 0.08,
        testDate: '2026-08-10',
        laboratoryName: 'Bureau Veritas',
        qualityParameters: [],
        contaminants: [],
        extractionNotes: [],
        warnings: [],
        missingFields: [],
      };

      const { crossCheck, status } = CoaCrossCheckService.crossCheck(extracted, mockBatch);

      expect(crossCheck.purityMatch).toBe(false);
      expect(crossCheck.hasDiscrepancy).toBe(true);
      expect(status).toBe('REVIEW_REQUIRED');
      expect(crossCheck.purityNote).toContain('MISMATCH');
    });

    it('flags discrepancy when batch reference in certificate mismatches registered batch', () => {
      const extracted = {
        documentType: 'COA',
        batchReference: 'BATCH-DIFFERENT-999',
        co2PurityPercent: 99.5,
        moisturePercent: 0.05,
        testDate: '2026-08-10',
        laboratoryName: 'Bureau Veritas',
        qualityParameters: [],
        contaminants: [],
        extractionNotes: [],
        warnings: [],
        missingFields: [],
      };

      const { crossCheck, status } = CoaCrossCheckService.crossCheck(extracted, mockBatch);

      expect(crossCheck.batchReferenceMatch).toBe(false);
      expect(crossCheck.hasDiscrepancy).toBe(true);
      expect(status).toBe('REVIEW_REQUIRED');
      expect(crossCheck.batchReferenceNote).toContain('mismatch');
    });

    it('handles null values in extracted data without throwing or fabricating', () => {
      const extracted = {
        documentType: 'COA',
        batchReference: null,
        co2PurityPercent: null,
        moisturePercent: null,
        testDate: null,
        laboratoryName: null,
        qualityParameters: [],
        contaminants: [],
        extractionNotes: [],
        warnings: [],
        missingFields: ['co2PurityPercent', 'batchReference'],
      };

      const { crossCheck, status } = CoaCrossCheckService.crossCheck(extracted, mockBatch);

      expect(crossCheck.batchReferenceMatch).toBeNull();
      expect(crossCheck.purityMatch).toBeNull();
      expect(crossCheck.purityDifference).toBeNull();
      expect(crossCheck.hasDiscrepancy).toBe(false);
      expect(status).toBe('PARTIAL');
    });
  });

  describe('Wording Compliance — Never uses "verified"', () => {
    it('ensures cross-check summaries and notes NEVER include forbidden verified labels', () => {
      const extracted = {
        documentType: 'COA',
        batchReference: 'CB-2026-091',
        co2PurityPercent: 99.5,
        moisturePercent: 0.02,
        testDate: '2026-08-10',
        laboratoryName: 'Bureau Veritas',
        qualityParameters: [],
        contaminants: [],
        extractionNotes: [],
        warnings: [],
        missingFields: [],
      };

      const { crossCheck } = CoaCrossCheckService.crossCheck(
        extracted,
        { batchNumber: 'CB-2026-091', purityPercentage: 99.5 }
      );

      const allText = [
        crossCheck.summary,
        crossCheck.batchReferenceNote,
        crossCheck.purityNote,
      ].join(' ').toLowerCase();

      // Check strictly against forbidden phrases
      expect(allText).not.toContain('certificate verified');
      expect(allText).not.toContain('lab verified');
      expect(allText).not.toContain('authenticity verified');
      expect(allText).not.toContain('ai verified');
    });
  });
});
