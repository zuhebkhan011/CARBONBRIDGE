import { prisma } from '../../database/prisma.js';
import { config } from '../../config/env.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import { calculateDistanceKm } from '../../common/utils/geo.js';
import { PricingService } from './pricing.service.js';
import { logger } from '../../common/logging/logger.js';

export interface MlPredictionFeatures {
  purity: number;
  quantityTonnes: number;
  distanceKm: number;
  demandIndex: number;
  supplyIndex: number;
  auctionAveragePrice: number;
  intendedUse: string;
}

export interface MlPricePredictionResult {
  methodology: 'ML_PREDICTION' | 'RULE_BASED_FALLBACK';
  modelAvailable: boolean;
  predictedPricePerTonne: number | null;
  confidence: number | null;
  mae: number | null;
  r2: number | null;
  modelVersion: string | null;
  reason?: string | null;
  featuresUsed?: MlPredictionFeatures;
  ruleBasedComparison: {
    recommendedLowerPrice: number;
    recommendedUpperPrice: number;
    medianPrice: number;
    breakdown?: any;
  };
  advisoryNotice: string;
}

export class MlPricePredictionService {
  /**
   * Predict price for an existing listing using XGBoost ML service with automatic rule-based fallback.
   */
  public static async predictPriceForListing(
    listingId: string,
    actorCompanyId?: string,
    options?: { intendedUse?: string; distanceKm?: number }
  ): Promise<MlPricePredictionResult> {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        batch: {
          include: {
            seller: true,
          },
        },
        auction: true,
      },
    });

    if (!listing) {
      throw new NotFoundError(`Listing '${listingId}' not found.`);
    }

    const purity = listing.batch.purityPercentage.toNumber();
    const quantityTonnes = listing.quantity?.toNumber() || listing.batch.availableQuantity?.toNumber() || 100;

    // Logistics distance estimation
    let distanceKm = options?.distanceKm ?? 50; // default 50km
    if (options?.distanceKm === undefined && actorCompanyId && actorCompanyId !== listing.sellerId) {
      const buyer = await prisma.company.findUnique({ where: { id: actorCompanyId } });
      if (buyer) {
        distanceKm = Math.round(
          calculateDistanceKm(
            { latitude: listing.batch.locationLat.toNumber(), longitude: listing.batch.locationLng.toNumber() },
            { latitude: buyer.latitude.toNumber(), longitude: buyer.longitude.toNumber() }
          )
        );
      }
    }

    const intendedUse = options?.intendedUse || 'OTHER';

    return this.predictParameters({
      purityPercentage: purity,
      batchQuantity: quantityTonnes,
      distanceKm,
      intendedUse,
      sellerLat: listing.batch.locationLat.toNumber(),
      sellerLng: listing.batch.locationLng.toNumber(),
    });
  }

  /**
   * Generic parameter-based prediction.
   * Calls internal Python FastAPI ML microservice with strict timeout and seamless fallback.
   */
  public static async predictParameters(input: {
    purityPercentage: number;
    batchQuantity: number;
    distanceKm?: number;
    intendedUse?: string;
    sellerLat?: number;
    sellerLng?: number;
  }): Promise<MlPricePredictionResult> {
    const purity = Math.max(50, Math.min(100, input.purityPercentage));
    const quantityTonnes = Math.max(1, input.batchQuantity);
    const distanceKm = Math.max(0, input.distanceKm ?? 50);
    const intendedUse = input.intendedUse || 'OTHER';

    // 1. Calculate deterministic rule-based benchmark (always computed as baseline & comparison)
    const ruleBased = await PricingService.calculateAdvisoryPriceWithMarketLiquidity({
      purityPercentage: purity,
      batchQuantity: quantityTonnes,
    });

    // 2. Derive market liquidity metrics (demand index, supply index, auction average price)
    const { demandIndex, supplyIndex, auctionAveragePrice } = await this.deriveMarketMetrics(purity);

    const mlPayload: MlPredictionFeatures = {
      purity,
      quantityTonnes,
      distanceKm,
      demandIndex,
      supplyIndex,
      auctionAveragePrice,
      intendedUse,
    };

    // 3. Attempt calling internal Python FastAPI ML microservice
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s timeout

      const response = await fetch(`${config.ML_SERVICE_URL}/predict-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mlPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`ML service responded with HTTP status ${response.status}`);
      }

      const mlData = (await response.json()) as {
        predictedPricePerTonne: number | null;
        modelAvailable: boolean;
        confidence: number | null;
        mae: number | null;
        r2: number | null;
        modelVersion: string | null;
        reason: string | null;
      };

      if (mlData.modelAvailable && mlData.predictedPricePerTonne != null) {
        return {
          methodology: 'ML_PREDICTION',
          modelAvailable: true,
          predictedPricePerTonne: mlData.predictedPricePerTonne,
          confidence: mlData.confidence ?? null, // Not statistically invented
          mae: mlData.mae ?? null,
          r2: mlData.r2 ?? null,
          modelVersion: mlData.modelVersion ?? '1.0.0',
          reason: null,
          featuresUsed: mlPayload,
          ruleBasedComparison: {
            recommendedLowerPrice: ruleBased.recommendedLowerPrice,
            recommendedUpperPrice: ruleBased.recommendedUpperPrice,
            medianPrice: ruleBased.medianPrice,
            breakdown: ruleBased.breakdown,
          },
          advisoryNotice:
            'XGBoost ML Price Prediction. Strictly advisory. Sellers and buyers retain full autonomy to agree upon final terms.',
        };
      }

      // If model is reported as unavailable or returned null price, fall back gracefully
      return {
        methodology: 'RULE_BASED_FALLBACK',
        modelAvailable: false,
        predictedPricePerTonne: ruleBased.medianPrice,
        confidence: null,
        mae: null,
        r2: null,
        modelVersion: null,
        reason: mlData.reason || 'ML prediction unavailable — insufficient historical transaction data.',
        featuresUsed: mlPayload,
        ruleBasedComparison: {
          recommendedLowerPrice: ruleBased.recommendedLowerPrice,
          recommendedUpperPrice: ruleBased.recommendedUpperPrice,
          medianPrice: ruleBased.medianPrice,
          breakdown: ruleBased.breakdown,
        },
        advisoryNotice:
          'ML prediction unavailable — insufficient historical data. Displaying rule-based advisory price.',
      };
    } catch (err: any) {
      logger.warn({ error: err.message }, 'ML Price Prediction service unreachable; utilizing rule-based fallback.');

      return {
        methodology: 'RULE_BASED_FALLBACK',
        modelAvailable: false,
        predictedPricePerTonne: ruleBased.medianPrice,
        confidence: null,
        mae: null,
        r2: null,
        modelVersion: null,
        reason: 'ML prediction service temporarily unreachable — fallen back to deterministic rule-based pricing.',
        featuresUsed: mlPayload,
        ruleBasedComparison: {
          recommendedLowerPrice: ruleBased.recommendedLowerPrice,
          recommendedUpperPrice: ruleBased.recommendedUpperPrice,
          medianPrice: ruleBased.medianPrice,
          breakdown: ruleBased.breakdown,
        },
        advisoryNotice:
          'ML service unavailable. Displaying deterministic rule-based industrial benchmark.',
      };
    }
  }

  /**
   * Helper to derive live regional demand, supply, and auction averages from Prisma.
   */
  private static async deriveMarketMetrics(purity: number): Promise<{
    demandIndex: number;
    supplyIndex: number;
    auctionAveragePrice: number;
  }> {
    try {
      const [reqAggregate, batchAggregate, recentAuctions] = await Promise.all([
        prisma.requirement.aggregate({
          where: { status: { in: ['OPEN', 'PARTIALLY_FULFILLED'] } },
          _sum: { targetQuantity: true },
        }),
        prisma.batch.aggregate({
          where: { status: 'ACTIVE' },
          _sum: { availableQuantity: true },
        }),
        prisma.auction.findMany({
          where: { status: { in: ['SETTLED', 'OPEN'] } },
          select: { currentHighestBid: true, baseReservePrice: true },
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      const totalDemand = reqAggregate._sum.targetQuantity?.toNumber() || 0;
      const totalSupply = batchAggregate._sum.availableQuantity?.toNumber() || 0;

      // Normalize index between 10 and 99
      const demandIndex = Math.round(Math.min(99, Math.max(10, (totalDemand / 1000) * 80 + 20)));
      const supplyIndex = Math.round(Math.min(99, Math.max(10, (totalSupply / 1000) * 80 + 20)));

      let auctionSum = 0;
      let auctionCount = 0;
      for (const auc of recentAuctions) {
        const val = auc.currentHighestBid?.toNumber() || auc.baseReservePrice?.toNumber();
        if (val && val > 0) {
          auctionSum += val;
          auctionCount++;
        }
      }

      const auctionAveragePrice =
        auctionCount > 0 ? Math.round(auctionSum / auctionCount) : 2500;

      return { demandIndex, supplyIndex, auctionAveragePrice };
    } catch {
      return { demandIndex: 50, supplyIndex: 50, auctionAveragePrice: 2500 };
    }
  }
}
