import { CoaExtractionData, CoaCrossCheckResult } from './types.js';

export interface BatchCrossCheckTarget {
  batchNumber: string;
  purityPercentage: number;
}

export class CoaCrossCheckService {
  /**
   * Configurable threshold for purity discrepancy detection (in percentage points).
   * If CoA purity is lower than listed purity by more than this threshold, a discrepancy is flagged.
   */
  public static PURITY_DISCREPANCY_THRESHOLD = 0.5;

  /**
   * Cross-checks AI-extracted CoA parameters against the database batch record.
   * Grounded in exact values. Never automatically modifies batch data or rejects listings.
   */
  public static crossCheck(
    extracted: CoaExtractionData,
    batch: BatchCrossCheckTarget
  ): { crossCheck: CoaCrossCheckResult; status: 'EXTRACTED' | 'PARTIAL' | 'REVIEW_REQUIRED' } {
    let hasDiscrepancy = false;
    const summaries: string[] = [];

    // --- 1. Batch Reference Comparison ---
    let batchReferenceMatch: boolean | null = null;
    let batchReferenceNote = '';

    if (extracted.batchReference) {
      const cleanExtracted = extracted.batchReference.replace(/[\s-_]/g, '').toLowerCase();
      const cleanListed = batch.batchNumber.replace(/[\s-_]/g, '').toLowerCase();

      if (cleanExtracted === cleanListed || cleanExtracted.includes(cleanListed) || cleanListed.includes(cleanExtracted)) {
        batchReferenceMatch = true;
        batchReferenceNote = `✓ Batch reference matches registered batch (${batch.batchNumber}).`;
        summaries.push('Batch reference matches.');
      } else {
        batchReferenceMatch = false;
        hasDiscrepancy = true;
        batchReferenceNote = `⚠ Batch reference mismatch: Document specifies '${extracted.batchReference}', registered batch is '${batch.batchNumber}'.`;
        summaries.push('Batch reference mismatch detected.');
      }
    } else {
      batchReferenceMatch = null;
      batchReferenceNote = 'Batch reference not found in CoA document.';
    }

    // --- 2. CO2 Purity Comparison ---
    let purityMatch: boolean | null = null;
    let purityDifference: number | null = null;
    let purityDifferencePoints: string | null = null;
    let purityNote = '';

    const listedPurity = Math.round(batch.purityPercentage * 100) / 100;

    if (extracted.co2PurityPercent != null) {
      const coaPurity = Math.round(extracted.co2PurityPercent * 100) / 100;
      purityDifference = Math.round((coaPurity - listedPurity) * 100) / 100;
      const sign = purityDifference > 0 ? '+' : '';
      purityDifferencePoints = `${sign}${purityDifference.toFixed(2)} percentage points`;

      if (coaPurity < listedPurity - this.PURITY_DISCREPANCY_THRESHOLD) {
        purityMatch = false;
        hasDiscrepancy = true;
        purityNote = `⚠ QUALITY DATA MISMATCH: Listed CO₂ purity is ${listedPurity}%, but CoA reports ${coaPurity}% (${purityDifferencePoints}). Please review before transacting.`;
        summaries.push(`Purity mismatch: listed ${listedPurity}% vs CoA ${coaPurity}%.`);
      } else if (coaPurity >= listedPurity) {
        purityMatch = true;
        purityNote = `✓ CoA purity (${coaPurity}%) meets or exceeds listed batch purity (${listedPurity}%).`;
        summaries.push('Purity is consistent with listed batch.');
      } else {
        purityMatch = true;
        purityNote = `CoA purity (${coaPurity}%) is within acceptable tolerance of listed purity (${listedPurity}%).`;
        summaries.push('Purity is within acceptable tolerance.');
      }
    } else {
      purityMatch = null;
      purityNote = 'CO₂ purity percentage was not specified in the uploaded CoA.';
      summaries.push('CO₂ purity not reported in document.');
    }

    const overallSummary = summaries.length > 0 ? summaries.join(' • ') : 'CoA analysis complete.';

    const crossCheckResult: CoaCrossCheckResult = {
      batchReferenceMatch,
      batchReferenceNote,
      purityMatch,
      purityDifference,
      purityDifferencePoints,
      purityNote,
      hasDiscrepancy,
      summary: overallSummary,
    };

    let status: 'EXTRACTED' | 'PARTIAL' | 'REVIEW_REQUIRED' = 'EXTRACTED';
    if (hasDiscrepancy) {
      status = 'REVIEW_REQUIRED';
    } else if (extracted.co2PurityPercent == null || extracted.batchReference == null) {
      status = 'PARTIAL';
    }

    return { crossCheck: crossCheckResult, status };
  }
}
