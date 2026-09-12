import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { RequirementStatus, ListingStatus, Prisma } from '@prisma/client';

export const pricingQuerySchema = z
  .object({
    purityPercentage: z.coerce.number().min(50).max(100),
    batchQuantity: z.coerce.number().positive().optional(),
    quantityTons: z.coerce.number().positive().optional(),
    quantity: z.coerce.number().positive().optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    clusterCity: z.string().optional(),
  })
  .transform((data) => ({
    ...data,
    batchQuantity: data.batchQuantity ?? data.quantityTons ?? data.quantity ?? 100,
  }));

export type PricingQueryInput = z.infer<typeof pricingQuerySchema>;

export interface AdvisoryPricingConfig {
  baseMin: number;
  baseMax: number;
  purityStandardThreshold: number;
  purityPremiumPerPoint: number;
  purityDiscountPerPoint: number;
  bulkVolumeTier1Tons: number;
  bulkVolumeTier1DiscountPct: number;
  bulkVolumeTier2Tons: number;
  bulkVolumeTier2DiscountPct: number;
  tightSupplyPremiumPerTon: number;
  surplusSupplyDiscountPerTon: number;
}

export const DEFAULT_PRICING_CONFIG: AdvisoryPricingConfig = {
  baseMin: 2200,
  baseMax: 2500,
  purityStandardThreshold: 80,
  purityPremiumPerPoint: 30,
  purityDiscountPerPoint: 20,
  bulkVolumeTier1Tons: 200,
  bulkVolumeTier1DiscountPct: 4,
  bulkVolumeTier2Tons: 500,
  bulkVolumeTier2DiscountPct: 8,
  tightSupplyPremiumPerTon: 75,
  surplusSupplyDiscountPerTon: 50,
};

export interface PricingFactorBreakdown {
  baseBenchmark: { min: number; max: number; label: string };
  purityAdjustment: { amount: number; label: string };
  volumeAdjustment: { percentage: number; label: string };
  supplyDemandAdjustment: { amount: number; condition: string; label: string };
}

export interface AdvisoryPricingResult {
  purityPercentage: number;
  batchQuantity: number;
  recommendedLowerPrice: number;
  recommendedUpperPrice: number;
  medianPrice: number;
  methodologyLabel: 'Rule-Based Advisory — Not AI/ML';
  advisoryNote: string;
  breakdown: PricingFactorBreakdown;
  deterministicFactors: {
    baseFlueGasBenchmark: { min: number; max: number };
    purityPremiumPerTon: number;
    volumeScaleAdjustmentPercentage: number;
    marketSupplyDemandAdjustmentPerTon: number;
  };
}

export class PricingService {
  /**
   * Deterministic, rule-based advisory price calculation.
   * Strictly non-ML rule-based formula grounding prices in market purity and lot scale.
   */
  public static calculateAdvisoryPrice(
    input: PricingQueryInput,
    customConfig: Partial<AdvisoryPricingConfig> = {},
    marketAdjustment: number = 0,
    marketCondition: string = 'Standard Regional Industrial Baseline'
  ): AdvisoryPricingResult {
    const cfg: AdvisoryPricingConfig = { ...DEFAULT_PRICING_CONFIG, ...customConfig };
    const { purityPercentage, batchQuantity } = input;

    // 1. Standard industrial flue gas baseline (70-80% purity) in INR/T
    let baseMin = cfg.baseMin;
    let baseMax = cfg.baseMax;

    // 2. Deterministic Purity Adjustment:
    let purityPremium = 0;
    if (purityPercentage > cfg.purityStandardThreshold) {
      purityPremium = Math.round((purityPercentage - cfg.purityStandardThreshold) * cfg.purityPremiumPerPoint * 100) / 100;
    } else if (purityPercentage < 70) {
      purityPremium = -Math.round((70 - purityPercentage) * cfg.purityDiscountPerPoint * 100) / 100;
    }

    baseMin += purityPremium;
    baseMax += purityPremium;

    // 3. Deterministic Volume Scale Adjustment:
    let volumeDiscountPct = 0;
    if (batchQuantity >= cfg.bulkVolumeTier2Tons) {
      volumeDiscountPct = cfg.bulkVolumeTier2DiscountPct;
    } else if (batchQuantity >= cfg.bulkVolumeTier1Tons) {
      volumeDiscountPct = cfg.bulkVolumeTier1DiscountPct;
    }

    const discountMultiplier = 1 - volumeDiscountPct / 100;
    const discountedBaseMin = baseMin * discountMultiplier;
    const discountedBaseMax = baseMax * discountMultiplier;

    const lowerPrice = Math.round((discountedBaseMin + marketAdjustment) * 100) / 100;
    const upperPrice = Math.round((discountedBaseMax + marketAdjustment) * 100) / 100;
    const medianPrice = Math.round(((lowerPrice + upperPrice) / 2) * 100) / 100;

    return {
      purityPercentage,
      batchQuantity,
      recommendedLowerPrice: lowerPrice,
      recommendedUpperPrice: upperPrice,
      medianPrice,
      methodologyLabel: 'Rule-Based Advisory — Not AI/ML',
      advisoryNote:
        'Advisory benchmark only. Rule-Based Advisory — Not AI/ML. Sellers retain full commercial autonomy to set fixed listing prices or auction reserves higher or lower based on their specific operating economics.',
      breakdown: {
        baseBenchmark: {
          min: cfg.baseMin,
          max: cfg.baseMax,
          label: `Industrial Flue Gas Baseline (${cfg.baseMin}–${cfg.baseMax} ₹/T)`,
        },
        purityAdjustment: {
          amount: purityPremium,
          label: `Purity adjustment (${purityPercentage}% CO₂ vs ${cfg.purityStandardThreshold}% standard)`,
        },
        volumeAdjustment: {
          percentage: -volumeDiscountPct,
          label: `Volume scale efficiency (${batchQuantity} T lot size)`,
        },
        supplyDemandAdjustment: {
          amount: marketAdjustment,
          condition: marketCondition,
          label: `Market supply-demand liquidity (${marketCondition})`,
        },
      },
      deterministicFactors: {
        baseFlueGasBenchmark: { min: cfg.baseMin, max: cfg.baseMax },
        purityPremiumPerTon: purityPremium,
        volumeScaleAdjustmentPercentage: volumeDiscountPct === 0 ? 0 : -volumeDiscountPct,
        marketSupplyDemandAdjustmentPerTon: marketAdjustment,
      },
    };
  }

  /**
   * Async helper that queries active marketplace demand vs supply liquidity
   * and feeds it into the deterministic calculation.
   */
  public static async calculateAdvisoryPriceWithMarketLiquidity(
    input: PricingQueryInput,
    customConfig: Partial<AdvisoryPricingConfig> = {}
  ): Promise<AdvisoryPricingResult> {
    const cfg: AdvisoryPricingConfig = { ...DEFAULT_PRICING_CONFIG, ...customConfig };
    const { purityPercentage } = input;

    let supplyDemandAdj = 0;
    let marketCondition = 'Standard Regional Industrial Baseline';

    try {
      const [activeDemand, activeSupply] = await Promise.all([
        prisma.requirement.aggregate({
          where: {
            status: { in: [RequirementStatus.OPEN, RequirementStatus.PARTIALLY_FULFILLED] },
            minPurity: { lte: new Prisma.Decimal(purityPercentage + 5) },
          },
          _sum: { targetQuantity: true },
        }),
        prisma.batch.aggregate({
          where: {
            status: 'ACTIVE',
            availableQuantity: { gt: new Prisma.Decimal(0) },
            purityPercentage: { gte: new Prisma.Decimal(Math.max(50, purityPercentage - 5)) },
          },
          _sum: { availableQuantity: true },
        }),
      ]);

      const totalDemand = activeDemand._sum.targetQuantity?.toNumber() || 0;
      const totalSupply = activeSupply._sum.availableQuantity?.toNumber() || 0;

      if (totalDemand > 0 && totalSupply > 0) {
        const ratio = totalDemand / totalSupply;
        if (ratio >= 1.25) {
          supplyDemandAdj = cfg.tightSupplyPremiumPerTon;
          marketCondition = `Tight Supply (Demand ${totalDemand}T exceeds active supply ${totalSupply}T)`;
        } else if (ratio <= 0.6) {
          supplyDemandAdj = -cfg.surplusSupplyDiscountPerTon;
          marketCondition = `Surplus Supply (Supply ${totalSupply}T exceeds active demand ${totalDemand}T)`;
        } else {
          marketCondition = `Balanced Supply & Demand (${totalDemand}T demand vs ${totalSupply}T supply)`;
        }
      } else if (totalDemand > 0 && totalSupply === 0) {
        supplyDemandAdj = cfg.tightSupplyPremiumPerTon;
        marketCondition = `High Buyer Demand (${totalDemand}T active requirement with limited local supply)`;
      }
    } catch {
      marketCondition = 'Standard Regional Industrial Baseline';
    }

    return this.calculateAdvisoryPrice(input, customConfig, supplyDemandAdj, marketCondition);
  }
}
