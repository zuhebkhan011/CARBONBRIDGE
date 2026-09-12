import { Prisma, ListingStatus, SellingMethod } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import { calculateDistanceKm, GeoCoordinate } from '../../common/utils/geo.js';
import { config } from '../../config/env.js';
import { v4 as uuidv4 } from 'uuid';
import {
  AIMatchCandidate,
  AIMatchResponse,
  AIMatchScoreBreakdown,
  AISupplyPlan,
  AISupplierContribution,
  MatchingWeightsConfig,
  DEFAULT_MATCHING_WEIGHTS,
} from './types.js';
import { MatchExplanationService } from './match-explanation.service.js';
import { calculateDeliveryFeasibility } from '../matching/matching.service.js';
import { logger } from '../../common/logging/logger.js';

export class AiService {
  /**
   * Evaluates buyer requirements against active seller CO2 listings.
   * Performs 7-factor transparent weighted scoring and multi-supplier combinatorial pooling.
   * Purely advisory; does NOT allocate or modify database inventory.
   */
  public static async matchRequirement(
    requirementId: string,
    limit: number = 10,
    customWeights?: Partial<MatchingWeightsConfig>
  ): Promise<AIMatchResponse> {
    const weights: MatchingWeightsConfig = {
      ...DEFAULT_MATCHING_WEIGHTS,
      ...customWeights,
    };

    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId },
      include: { buyer: true },
    });

    if (!requirement) {
      throw new NotFoundError(`Buyer requirement '${requirementId}' not found.`);
    }

    const targetQty = requirement.targetQuantity.toNumber();
    const minPurity = requirement.minPurity.toNumber();
    const budgetCeiling = requirement.budgetCeilingPerTon?.toNumber() ?? null;
    const buyerCoord: GeoCoordinate = {
      latitude: requirement.deliveryLat.toNumber(),
      longitude: requirement.deliveryLng.toNumber(),
    };

    // 1. Fetch active compatible candidate listings from database
    const candidateListings = await prisma.listing.findMany({
      where: {
        status: ListingStatus.ACTIVE,
        sellingMethod: SellingMethod.FIXED_PRICE,
        quantity: { gt: new Prisma.Decimal(0) },
        batch: {
          availableQuantity: { gt: new Prisma.Decimal(0) },
          purityPercentage: { gte: new Prisma.Decimal(minPurity.toFixed(2)) },
        },
      },
      include: {
        batch: {
          include: {
            certificate: {
              include: { extraction: true },
            },
          },
        },
        seller: true,
      },
    });

    // 2. Score each candidate listing across the 7 weighted dimensions
    const evaluatedLots: {
      listing: typeof candidateListings[0];
      availableQty: number;
      purity: number;
      basePrice: number;
      distanceKm: number;
      freightPerTon: number;
      landedCostPerTon: number;
      hasCertificate: boolean;
      totalScore: number;
      rating: 'Excellent' | 'Good' | 'Moderate' | 'Fair';
      breakdown: AIMatchScoreBreakdown;
      feasibility: ReturnType<typeof calculateDeliveryFeasibility>;
    }[] = [];

    for (const listing of candidateListings) {
      const sellerCoord: GeoCoordinate = {
        latitude: listing.batch.locationLat.toNumber(),
        longitude: listing.batch.locationLng.toNumber(),
      };

      const distanceKm = calculateDistanceKm(sellerCoord, buyerCoord);
      const freightPerTon = distanceKm * config.CRYO_FREIGHT_BASE_RATE_PER_KM;
      const basePrice = listing.pricePerTon ? listing.pricePerTon.toNumber() : 2500;
      const landedCostPerTon = Math.round((basePrice + freightPerTon) * 100) / 100;
      const listingOfferedQty = listing.quantity ? listing.quantity.toNumber() : listing.batch.availableQuantity.toNumber();
      const availableQty = Math.min(listingOfferedQty, listing.batch.availableQuantity.toNumber());
      const purity = listing.batch.purityPercentage.toNumber();
      const hasCertificate = Boolean(listing.batch.certificate);

      const feasibility = calculateDeliveryFeasibility(distanceKm, requirement.requiredDeliveryDate);

      // --- 7-Factor Weighted Scoring ---
      // (1) Quantity Fit (weight: 20%)
      const qtyRatio = targetQty > 0 ? Math.min(1, availableQty / targetQty) : 0;
      const quantityScore = Math.round(qtyRatio * 20);

      // (2) Purity Fit (weight: 25%)
      const purityDelta = Math.max(0, purity - minPurity);
      const purityScore = Math.min(25, Math.round(20 + Math.min(5, purityDelta * 0.5)));

      // (3) Price Fit (weight: 20%)
      let priceScore = 14;
      if (budgetCeiling && landedCostPerTon <= budgetCeiling) {
        const savingsRatio = Math.min(1, (budgetCeiling - landedCostPerTon) / budgetCeiling);
        priceScore = Math.round(16 + savingsRatio * 4);
      } else if (landedCostPerTon <= 2400) {
        priceScore = 20;
      } else if (landedCostPerTon <= 2600) {
        priceScore = 17;
      } else if (landedCostPerTon <= 2900) {
        priceScore = 13;
      } else {
        priceScore = 8;
      }

      // (4) Distance / Logistics Fit (weight: 15%)
      let distanceScore = 8;
      if (distanceKm <= 80) distanceScore = 15;
      else if (distanceKm <= 200) distanceScore = 12;
      else if (distanceKm <= 450) distanceScore = 9;
      else distanceScore = 5;

      // (5) Availability / Delivery Feasibility (weight: 10%)
      let availabilityScore = 7;
      if (feasibility.status === 'FEASIBLE') availabilityScore = 10;
      else if (feasibility.status === 'TIGHT') availabilityScore = 6;
      else availabilityScore = 2;

      // (6) Certificate / Quality Documentation (weight: 5%)
      const coaExtraction = listing.batch.certificate?.extraction;
      let certificateScore = 2;
      if (hasCertificate) {
        if (coaExtraction && coaExtraction.hasDiscrepancy) {
          certificateScore = 3; // Discrepancy flagged for review
        } else if (coaExtraction && coaExtraction.status === 'EXTRACTED') {
          certificateScore = 5; // CoA available and AI extraction completed
        } else {
          certificateScore = 4; // CoA uploaded and available
        }
      }

      // (7) Intended Use Compatibility (weight: 5%)
      let useCompatibilityScore = 4;
      if (requirement.intendedApplication) {
        const reqApp = requirement.intendedApplication.toUpperCase();
        if (reqApp.includes('FOOD') || reqApp.includes('BEVERAGE')) {
          useCompatibilityScore = purity >= 99.5 ? 5 : 2;
        } else if (reqApp.includes('CONSTRUCTION') || reqApp.includes('CONCRETE')) {
          useCompatibilityScore = 5;
        } else {
          useCompatibilityScore = purity >= minPurity ? 5 : 3;
        }
      } else {
        useCompatibilityScore = 5;
      }

      const totalScore = Math.min(
        100,
        quantityScore +
          purityScore +
          priceScore +
          distanceScore +
          availabilityScore +
          certificateScore +
          useCompatibilityScore
      );

      const rating: 'Excellent' | 'Good' | 'Moderate' | 'Fair' =
        totalScore >= 85 ? 'Excellent' : totalScore >= 70 ? 'Good' : totalScore >= 55 ? 'Moderate' : 'Fair';

      evaluatedLots.push({
        listing,
        availableQty,
        purity,
        basePrice,
        distanceKm,
        freightPerTon: Math.round(freightPerTon * 100) / 100,
        landedCostPerTon,
        hasCertificate,
        totalScore,
        rating,
        breakdown: {
          quantity: quantityScore,
          purity: purityScore,
          price: priceScore,
          distance: distanceScore,
          availability: availabilityScore,
          certificate: certificateScore,
          useCompatibility: useCompatibilityScore,
        },
        feasibility,
      });
    }

    // Sort evaluated lots by highest score descending
    evaluatedLots.sort((a, b) => b.totalScore - a.totalScore);

    // 3. Generate Candidate Explanations (top candidates get Gemini or rule-based explanations)
    const topCandidates = evaluatedLots.slice(0, limit);
    let geminiUsedOverall = false;

    const matches: AIMatchCandidate[] = await Promise.all(
      topCandidates.map(async (lot) => {
        const candidateCoaExtraction = lot.listing.batch.certificate?.extraction;
        const explanation = await MatchExplanationService.generateExplanation({
          targetQuantity: targetQty,
          availableQuantity: lot.availableQty,
          minPurity,
          offeredPurity: lot.purity,
          pricePerTon: lot.basePrice,
          budgetCeiling,
          distanceKm: lot.distanceKm,
          hasCertificate: lot.hasCertificate,
          coaExtraction: candidateCoaExtraction
            ? {
                co2PurityPercent: candidateCoaExtraction.co2PurityPercent ? candidateCoaExtraction.co2PurityPercent.toNumber() : null,
                hasDiscrepancy: candidateCoaExtraction.hasDiscrepancy,
                status: candidateCoaExtraction.status,
              }
            : null,
          feasibilityLabel: lot.feasibility.label,
          scoreBreakdown: lot.breakdown,
          matchScore: lot.totalScore,
        });

        if (explanation.source === 'GEMINI_AI') {
          geminiUsedOverall = true;
        }

        return {
          listingId: lot.listing.id,
          batchId: lot.listing.batch.id,
          batchNumber: lot.listing.batch.batchNumber,
          sellerId: lot.listing.seller.id,
          sellerName: lot.listing.seller.name,
          availableQuantity: lot.availableQty,
          offeredQuantity: Math.min(lot.availableQty, targetQty),
          purityPercentage: lot.purity,
          pricePerTon: lot.basePrice,
          freightCostPerTon: lot.freightPerTon,
          landedCostPerTon: lot.landedCostPerTon,
          distanceKm: lot.distanceKm,
          hasCertificate: lot.hasCertificate,
          matchScore: lot.totalScore,
          rating: lot.rating,
          scoreBreakdown: lot.breakdown,
          reasons: explanation.reasons,
          concerns: explanation.concerns,
          recommendation: explanation.recommendation,
          deliveryFeasibility: lot.feasibility,
        };
      })
    );

    // 4. Multi-Supplier Combinatorial Volume Pooling
    // If buyer requires e.g. 500T, find subset of suppliers A + B + C = 500T
    const multiSupplierPlans: AISupplyPlan[] = [];
    const poolCandidates = evaluatedLots.slice(0, 15);

    if (poolCandidates.length > 0) {
      let accumulatedQty = 0;
      let accumulatedProductCost = 0;
      let accumulatedFreightCost = 0;
      let weightedPuritySum = 0;
      const pooledSuppliers: AISupplierContribution[] = [];

      for (const lot of poolCandidates) {
        if (accumulatedQty >= targetQty) break;

        const needed = targetQty - accumulatedQty;
        const takeQty = Math.min(lot.availableQty, needed);

        if (takeQty > 0) {
          const lotProductCost = Math.round(lot.basePrice * takeQty * 100) / 100;
          const lotFreightCost = Math.round(lot.freightPerTon * takeQty * 100) / 100;
          const lotTotalCost = Math.round((lotProductCost + lotFreightCost) * 100) / 100;

          pooledSuppliers.push({
            listingId: lot.listing.id,
            batchId: lot.listing.batch.id,
            batchNumber: lot.listing.batch.batchNumber,
            sellerId: lot.listing.seller.id,
            sellerName: lot.listing.seller.name,
            contributingQuantity: takeQty,
            availableQuantity: lot.availableQty,
            purityPercentage: lot.purity,
            pricePerTon: lot.basePrice,
            freightCostPerTon: lot.freightPerTon,
            landedCostPerTon: lot.landedCostPerTon,
            totalLotCost: lotTotalCost,
            distanceKm: lot.distanceKm,
            hasCertificate: lot.hasCertificate,
          });

          accumulatedQty += takeQty;
          accumulatedProductCost += lotProductCost;
          accumulatedFreightCost += lotFreightCost;
          weightedPuritySum += lot.purity * takeQty;
        }
      }

      if (pooledSuppliers.length > 0) {
        const totalLandedCost = Math.round((accumulatedProductCost + accumulatedFreightCost) * 100) / 100;
        const avgLandedCost = accumulatedQty > 0 ? Math.round((totalLandedCost / accumulatedQty) * 100) / 100 : 0;
        const avgPurity = accumulatedQty > 0 ? Math.round((weightedPuritySum / accumulatedQty) * 10) / 10 : minPurity;
        const fulfillmentPct = targetQty > 0 ? Math.round((accumulatedQty / targetQty) * 100) : 100;

        // Composite Feasibility
        const anyUnlikely = poolCandidates.some((p) => p.feasibility.status === 'UNLIKELY');
        const anyTight = poolCandidates.some((p) => p.feasibility.status === 'TIGHT');
        const deliveryFeasibility: 'FEASIBLE' | 'TIGHT' | 'UNLIKELY' = anyUnlikely
          ? 'UNLIKELY'
          : anyTight
          ? 'TIGHT'
          : 'FEASIBLE';

        const planTitle =
          pooledSuppliers.length === 1
            ? `Single Supplier Fulfillment Plan (${accumulatedQty}T)`
            : `Multi-Supplier Composite Plan (${pooledSuppliers.length} Producers • ${accumulatedQty}T)`;

        const explanation =
          pooledSuppliers.length === 1
            ? `Single supplier can fulfill ${fulfillmentPct}% (${accumulatedQty}T) at average landed cost ₹${avgLandedCost.toLocaleString()}/T.`
            : `Combines ${pooledSuppliers.length} distinct producers (${pooledSuppliers.map((s) => s.sellerName + ': ' + s.contributingQuantity + 'T').join(', ')}) to achieve ${fulfillmentPct}% demand fulfillment at average purity ${avgPurity}%.`;

        multiSupplierPlans.push({
          planId: uuidv4(),
          title: planTitle,
          totalQuantity: accumulatedQty,
          targetQuantity: targetQty,
          fulfillmentPercentage: fulfillmentPct,
          averagePurity: avgPurity,
          totalProductCost: accumulatedProductCost,
          totalFreightCost: accumulatedFreightCost,
          totalCost: totalLandedCost,
          averageLandedCostPerTon: avgLandedCost,
          overallScore: Math.round(
            pooledSuppliers.reduce((acc, s) => {
              const lotScore = evaluatedLots.find((l) => l.listing.id === s.listingId)?.totalScore || 75;
              return acc + (lotScore * s.contributingQuantity) / accumulatedQty;
            }, 0)
          ),
          suppliers: pooledSuppliers,
          explanation,
          deliveryFeasibility,
        });
      }
    }

    logger.info(
      {
        requirementId,
        candidatesEvaluated: candidateListings.length,
        matchesReturned: matches.length,
        plansCount: multiSupplierPlans.length,
        geminiUsed: geminiUsedOverall,
      },
      'AI matchmaker evaluation completed.'
    );

    return {
      requirement: {
        id: requirement.id,
        targetQuantity: targetQty,
        minPurity,
        deliveryAddress: requirement.deliveryAddress,
        requiredDeliveryDate: requirement.requiredDeliveryDate ? requirement.requiredDeliveryDate.toISOString() : null,
        budgetCeilingPerTon: budgetCeiling,
        intendedApplication: requirement.intendedApplication,
      },
      matches,
      multiSupplierPlans,
      evaluatedSupplyCount: candidateListings.length,
      geminiExplanationUsed: geminiUsedOverall,
      scoringWeights: weights,
    };
  }
}
