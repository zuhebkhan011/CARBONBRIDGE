import { GeminiService } from './gemini.service.js';
import { AIMatchScoreBreakdown } from './types.js';
import { logger } from '../../common/logging/logger.js';

export interface ExplanationContext {
  targetQuantity: number;
  availableQuantity: number;
  minPurity: number;
  offeredPurity: number;
  pricePerTon: number;
  budgetCeiling?: number | null;
  distanceKm: number;
  hasCertificate: boolean;
  coaExtraction?: {
    co2PurityPercent?: number | null;
    hasDiscrepancy?: boolean;
    status?: string;
  } | null;
  feasibilityLabel: string;
  scoreBreakdown: AIMatchScoreBreakdown;
  matchScore: number;
}

export interface ExplanationResult {
  reasons: string[];
  concerns: string[];
  recommendation?: string;
  source: 'GEMINI_AI' | 'DETERMINISTIC_RULES';
}

export class MatchExplanationService {
  /**
   * Generates explainable reasons, potential concerns, and recommended actions
   * for a buyer-supplier match. Uses Gemini when available, or deterministic rules.
   */
  public static async generateExplanation(context: ExplanationContext): Promise<ExplanationResult> {
    if (GeminiService.isConfigured()) {
      const geminiExplanation = await this.generateWithGemini(context);
      if (geminiExplanation) {
        return geminiExplanation;
      }
    }

    return this.generateDeterministic(context);
  }

  private static async generateWithGemini(context: ExplanationContext): Promise<ExplanationResult | null> {
    const systemPrompt = `You are a matchmaker analyst for CarbonBridge, an industrial B2B CO2 platform.
Analyze this buyer requirement vs supplier listing match.
Rules:
1. Provide 2-3 specific 'reasons' (strengths).
2. Provide 1-2 specific 'concerns' (risks or trade-offs), or an empty array if virtually perfect.
3. Provide 1 practical 'recommendation'.
4. Ground all statements strictly in the numeric data provided.
5. NEVER use the words 'verified', 'authenticity verified', 'lab verified', or 'AI verified'. Refer to documents as 'Certificate of Analysis available' or 'CoA AI Analyzed'.
Output strict JSON: {"reasons": string[], "concerns": string[], "recommendation": string}`;

    const userPrompt = `Match Metrics:
- Buyer Required Quantity: ${context.targetQuantity} T
- Supplier Available Quantity: ${context.availableQuantity} T
- Buyer Minimum Purity: ${context.minPurity}%
- Supplier Purity: ${context.offeredPurity}%
- Listing Price: ₹${context.pricePerTon}/T (Buyer Budget: ${context.budgetCeiling ? '₹' + context.budgetCeiling + '/T' : 'Not specified'})
- Distance: ${Math.round(context.distanceKm)} km
- Delivery Feasibility: ${context.feasibilityLabel}
- Certificate of Analysis (CoA): ${context.hasCertificate ? 'Available' : 'Pending'}
- Match Score: ${context.matchScore}/100`;

    try {
      const parsed = await GeminiService.generateJson<{
        reasons?: string[];
        concerns?: string[];
        recommendation?: string;
      }>({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
      });

      if (parsed && Array.isArray(parsed.reasons) && parsed.reasons.length > 0) {
        return {
          reasons: parsed.reasons,
          concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
          recommendation: parsed.recommendation || undefined,
          source: 'GEMINI_AI',
        };
      }
      return null;
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Gemini match explanation failed; falling back to deterministic.');
      return null;
    }
  }

  /**
   * Deterministic rule-based explanation generator.
   */
  public static generateDeterministic(context: ExplanationContext): ExplanationResult {
    const reasons: string[] = [];
    const concerns: string[] = [];
    let recommendation: string | undefined;

    // 1. Purity fit
    const purityDiff = context.offeredPurity - context.minPurity;
    if (purityDiff >= 5) {
      reasons.push(`✓ Exceeds required purity (${context.offeredPurity}% vs ${context.minPurity}% minimum required)`);
    } else if (purityDiff >= 0) {
      reasons.push(`✓ Meets required purity standard (${context.offeredPurity}% CO₂)`);
    } else {
      concerns.push(`⚠ Off-spec purity (${context.offeredPurity}% is below ${context.minPurity}% requirement)`);
    }

    // 2. Quantity fit
    if (context.availableQuantity >= context.targetQuantity) {
      reasons.push(`✓ 100% quantity can be fulfilled from this single supplier lot (${context.availableQuantity} T available)`);
    } else {
      const pct = Math.round((context.availableQuantity / context.targetQuantity) * 100);
      concerns.push(`⚠ Buyer requires ${context.targetQuantity}T but this listing contains only ${context.availableQuantity}T (${pct}% fulfillment)`);
      const deficit = context.targetQuantity - context.availableQuantity;
      recommendation = `Combine with additional suppliers to fulfill the remaining ${deficit}T deficit.`;
    }

    // 3. Price fit
    if (context.budgetCeiling && context.pricePerTon <= context.budgetCeiling) {
      const savings = context.budgetCeiling - context.pricePerTon;
      if (savings > 0) {
        reasons.push(`✓ Within target price ceiling (₹${context.pricePerTon.toLocaleString()}/T vs ₹${context.budgetCeiling.toLocaleString()}/T budget, saving ₹${savings}/T)`);
      } else {
        reasons.push(`✓ Within target price ceiling (₹${context.pricePerTon.toLocaleString()}/T)`);
      }
    } else if (context.budgetCeiling && context.pricePerTon > context.budgetCeiling) {
      concerns.push(`⚠ Exceeds budget ceiling (₹${context.pricePerTon.toLocaleString()}/T vs ₹${context.budgetCeiling.toLocaleString()}/T budget)`);
    } else {
      reasons.push(`✓ Competitive commercial lot pricing (₹${context.pricePerTon.toLocaleString()}/T)`);
    }

    // 4. Distance / Logistics
    if (context.distanceKm <= 100) {
      reasons.push(`✓ Supplier is in close geographic proximity (~${Math.round(context.distanceKm)} km road transit)`);
    } else if (context.distanceKm <= 350) {
      reasons.push(`✓ Feasible regional logistics corridor (~${Math.round(context.distanceKm)} km)`);
    } else {
      concerns.push(`⚠ Extended transit distance (~${Math.round(context.distanceKm)} km) will incur higher cryogenic freight`);
    }

    // 5. Delivery timeline feasibility
    if (context.feasibilityLabel.includes('Feasible')) {
      reasons.push(`✓ Delivery turnaround window is feasible`);
    } else if (context.feasibilityLabel.includes('Tight')) {
      concerns.push(`⚠ Delivery timeline is tight against cryogenic tanker dispatch buffer`);
    }

    // 6. Certificate of Analysis & CoA Intelligence
    if (context.coaExtraction && context.coaExtraction.hasDiscrepancy) {
      concerns.push(
        `⚠ Quality Data Mismatch: CoA extracted purity (${context.coaExtraction.co2PurityPercent}%) differs from listed batch purity (${context.offeredPurity}%)`
      );
    } else if (context.coaExtraction && context.coaExtraction.status === 'EXTRACTED') {
      reasons.push(
        `✓ CoA AI Analyzed: Quality parameters extracted from document (${context.coaExtraction.co2PurityPercent ?? context.offeredPurity}% CO₂)`
      );
    } else if (context.hasCertificate) {
      reasons.push(`✓ Certificate of Analysis (CoA) documentation available`);
    } else {
      concerns.push(`⚠ Quality Certificate of Analysis (CoA) is pending upload by producer`);
    }

    return {
      reasons,
      concerns,
      recommendation,
      source: 'DETERMINISTIC_RULES',
    };
  }
}
