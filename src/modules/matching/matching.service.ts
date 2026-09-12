import { Prisma, ListingStatus, SellingMethod } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import { calculateDistanceKm, GeoCoordinate } from '../../common/utils/geo.js';
import { config } from '../../config/env.js';
import { v4 as uuidv4 } from 'uuid';

export type DeliveryFeasibilityStatus = 'FEASIBLE' | 'TIGHT' | 'UNLIKELY';

export interface DeliveryFeasibility {
  status: DeliveryFeasibilityStatus;
  label: string;
  estimatedTransitHours: number;
  explanation: string;
}

export interface ScoreFactor {
  score: number;
  maxScore: number;
  rating: 'Excellent' | 'Good' | 'Moderate' | 'Fair';
  explanation: string;
}

export interface ScoreBreakdown {
  quantityFit: ScoreFactor;
  purityFit: ScoreFactor;
  priceCompetitiveness: ScoreFactor;
  distanceEfficiency: ScoreFactor;
  availability: ScoreFactor;
  deliveryFeasibility: ScoreFactor;
}

export interface ContributingLot {
  listingId: string;
  batchId: string;
  batchNumber: string;
  sellerId: string;
  sellerName: string;
  contributingQuantity: number;
  availableBatchQuantity: number;
  purityPercentage: number;
  pricePerTon: number;
  distanceKm: number;
  freightCostPerTon: number;
  landedCostPerTon: number;
  totalLotCost: number;
  hasCertificate: boolean;
}

export interface SingleSupplierMatch {
  matchType: 'SINGLE_SUPPLIER';
  listingId: string;
  batchId: string;
  batchNumber: string;
  sellerId: string;
  sellerName: string;
  availableQuantity: number;
  offeredQuantity: number;
  purityPercentage: number;
  pricePerTon: number;
  distanceKm: number;
  estimatedFreightPerTon: number;
  landedUnitCost: number;
  totalProductCost: number;
  totalFreightCost: number;
  totalLandedCost: number;
  score: number;
  rating: 'Excellent' | 'Good' | 'Moderate' | 'Fair';
  scoreBreakdown: ScoreBreakdown;
  deliveryFeasibility: DeliveryFeasibility;
  whyThisMatch: string[];
  hasCertificate: boolean;
}

export interface MultiSupplierCompositeMatch {
  matchType: 'MULTI_SUPPLIER_COMPOSITE';
  proposalId: string;
  proposalTitle: string;
  totalFulfilledQuantity: number;
  targetQuantity: number;
  fulfillmentPercentage: number;
  weightedAveragePurity: number;
  contributingLots: ContributingLot[];
  totalProductCost: number;
  totalFreightCost: number;
  totalLandedCost: number;
  averageLandedCostPerTon: number;
  score: number;
  rating: 'Excellent' | 'Good' | 'Moderate' | 'Fair';
  scoreBreakdown: ScoreBreakdown;
  deliveryFeasibility: DeliveryFeasibility;
  whyThisMatch: string[];
}

export interface MatchingResult {
  requirementId: string;
  targetQuantity: number;
  minPurity: number;
  deliveryCoordinates: GeoCoordinate;
  singleSupplierMatches: SingleSupplierMatch[];
  multiSupplierMatches: MultiSupplierCompositeMatch[];
  evaluatedCandidatesCount: number;
  bestMatchScore: number;
  summaryNote: string;
}

/**
 * Evaluates cryogenic tanker delivery feasibility based on distance,
 * configurable transit speed estimate, loading buffer, and requested timeline.
 */
export function calculateDeliveryFeasibility(
  distanceKm: number,
  targetDeliveryDate?: Date | string | null,
  transitSpeedKmH: number = config.CRYO_TRANSIT_ESTIMATE_KM_PER_HOUR || 45
): DeliveryFeasibility {
  const loadingInspectionBufferHours = 4; // Standard cryogenic purge & weighbridge time
  const transitHours = Math.max(1, Math.round((distanceKm / transitSpeedKmH) * 10) / 10);
  const totalEstimatedHours = Math.round((transitHours + loadingInspectionBufferHours) * 10) / 10;

  if (targetDeliveryDate) {
    const targetDate = new Date(targetDeliveryDate);
    const msUntilTarget = targetDate.getTime() - Date.now();
    const hoursUntilTarget = Math.round((msUntilTarget / (1000 * 60 * 60)) * 10) / 10;

    if (hoursUntilTarget <= 0 || hoursUntilTarget < totalEstimatedHours) {
      return {
        status: 'UNLIKELY',
        label: '✕ Delivery date unlikely',
        estimatedTransitHours: totalEstimatedHours,
        explanation: `Distance (${distanceKm} km) requires approx. ${totalEstimatedHours}h total dispatch window (transit + loading), which exceeds the requested delivery timeline (${Math.max(0, hoursUntilTarget)}h remaining).`,
      };
    }

    if (hoursUntilTarget < totalEstimatedHours * 1.5) {
      return {
        status: 'TIGHT',
        label: '⚠ Tight delivery window',
        estimatedTransitHours: totalEstimatedHours,
        explanation: `Estimated dispatch window (~${totalEstimatedHours}h) is tight against the requested delivery deadline (~${hoursUntilTarget}h turnaround).`,
      };
    }

    return {
      status: 'FEASIBLE',
      label: '✓ Feasible',
      estimatedTransitHours: totalEstimatedHours,
      explanation: `Estimated transit ~${transitHours}h (${distanceKm} km at ~${transitSpeedKmH} km/h cryogenic tanker estimate + loading buffer) comfortably meets delivery requirements.`,
    };
  }

  // Fallback if no specific deadline specified: evaluate standard operational radiuses
  if (distanceKm <= 350) {
    return {
      status: 'FEASIBLE',
      label: '✓ Feasible',
      estimatedTransitHours: totalEstimatedHours,
      explanation: `Regional road transit (~${transitHours}h for ${distanceKm} km at ~${transitSpeedKmH} km/h) is well within standard single-shift cryogenic dispatch SLA.`,
    };
  }

  if (distanceKm <= 750) {
    return {
      status: 'TIGHT',
      label: '⚠ Tight delivery window',
      estimatedTransitHours: totalEstimatedHours,
      explanation: `Medium-haul distance (${distanceKm} km) requires ~${transitHours}h road transit; multi-driver rotation recommended for cryogenic thermal integrity.`,
    };
  }

  return {
    status: 'UNLIKELY',
    label: '✕ Delivery date unlikely',
    estimatedTransitHours: totalEstimatedHours,
    explanation: `Long-distance route (${distanceKm} km) exceeds standard cryogenic direct road trucking limits without intermodal transfer.`,
  };
}

/**
 * Transparent, explainable 0–100 match scoring engine.
 * Weights:
 * - Quantity Fit (25 pts)
 * - Purity Fit (20 pts)
 * - Price Competitiveness (20 pts)
 * - Distance Efficiency (15 pts)
 * - Availability & Readiness (10 pts)
 * - Delivery Feasibility (10 pts)
 */
export function calculateMatchScore(params: {
  fulfilledQuantity: number;
  targetQuantity: number;
  purityPercentage: number;
  minPurity: number;
  landedCostPerTon: number;
  distanceKm: number;
  hasCertificate: boolean;
  feasibility: DeliveryFeasibility;
}): { totalScore: number; rating: 'Excellent' | 'Good' | 'Moderate' | 'Fair'; breakdown: ScoreBreakdown } {
  const {
    fulfilledQuantity,
    targetQuantity,
    purityPercentage,
    minPurity,
    landedCostPerTon,
    distanceKm,
    hasCertificate,
    feasibility,
  } = params;

  // 1. Quantity Fit (max 25 pts)
  const qtyRatio = targetQuantity > 0 ? Math.min(1, fulfilledQuantity / targetQuantity) : 0;
  const qtyScore = Math.round(qtyRatio * 25);
  const qtyRating: 'Excellent' | 'Good' | 'Moderate' | 'Fair' =
    qtyRatio >= 1 ? 'Excellent' : qtyRatio >= 0.75 ? 'Good' : qtyRatio >= 0.5 ? 'Moderate' : 'Fair';

  // 2. Purity Fit (max 20 pts)
  const purityDelta = Math.max(0, purityPercentage - minPurity);
  const purityScore = Math.min(20, Math.round(15 + Math.min(5, purityDelta * 0.5)));
  const purityRating: 'Excellent' | 'Good' | 'Moderate' | 'Fair' =
    purityDelta >= 5 ? 'Excellent' : purityDelta >= 1 ? 'Good' : 'Moderate';

  // 3. Price Competitiveness (max 20 pts) vs standard industrial baseline ~₹2,500/T
  let priceScore = 14;
  let priceRating: 'Excellent' | 'Good' | 'Moderate' | 'Fair' = 'Good';
  if (landedCostPerTon <= 2400) {
    priceScore = 20;
    priceRating = 'Excellent';
  } else if (landedCostPerTon <= 2600) {
    priceScore = 17;
    priceRating = 'Good';
  } else if (landedCostPerTon <= 2900) {
    priceScore = 14;
    priceRating = 'Moderate';
  } else {
    priceScore = 10;
    priceRating = 'Fair';
  }

  // 4. Distance Efficiency (max 15 pts)
  let distScore = 8;
  let distRating: 'Excellent' | 'Good' | 'Moderate' | 'Fair' = 'Moderate';
  if (distanceKm <= 80) {
    distScore = 15;
    distRating = 'Excellent';
  } else if (distanceKm <= 200) {
    distScore = 12;
    distRating = 'Good';
  } else if (distanceKm <= 450) {
    distScore = 9;
    distRating = 'Moderate';
  } else {
    distScore = 5;
    distRating = 'Fair';
  }

  // 5. Availability & Readiness (max 10 pts)
  const availScore = hasCertificate ? 10 : 7;
  const availRating: 'Excellent' | 'Good' | 'Moderate' | 'Fair' = hasCertificate ? 'Excellent' : 'Good';

  // 6. Delivery Feasibility (max 10 pts)
  let feasScore = 10;
  let feasRating: 'Excellent' | 'Good' | 'Moderate' | 'Fair' = 'Excellent';
  if (feasibility.status === 'FEASIBLE') {
    feasScore = 10;
    feasRating = 'Excellent';
  } else if (feasibility.status === 'TIGHT') {
    feasScore = 6;
    feasRating = 'Moderate';
  } else {
    feasScore = 2;
    feasRating = 'Fair';
  }

  const totalScore = Math.min(100, Math.max(0, qtyScore + purityScore + priceScore + distScore + availScore + feasScore));
  const overallRating: 'Excellent' | 'Good' | 'Moderate' | 'Fair' =
    totalScore >= 90 ? 'Excellent' : totalScore >= 75 ? 'Good' : totalScore >= 60 ? 'Moderate' : 'Fair';

  const breakdown: ScoreBreakdown = {
    quantityFit: {
      score: qtyScore,
      maxScore: 25,
      rating: qtyRating,
      explanation: `${fulfilledQuantity} T / ${targetQuantity} T (${Math.round(qtyRatio * 100)}% fulfillment)`,
    },
    purityFit: {
      score: purityScore,
      maxScore: 20,
      rating: purityRating,
      explanation: `${purityPercentage}% vs required min ${minPurity}% (+${purityDelta.toFixed(1)}% buffer)`,
    },
    priceCompetitiveness: {
      score: priceScore,
      maxScore: 20,
      rating: priceRating,
      explanation: `Landed cost ₹${landedCostPerTon.toLocaleString()}/T (incl. freight)`,
    },
    distanceEfficiency: {
      score: distScore,
      maxScore: 15,
      rating: distRating,
      explanation: `${Math.round(distanceKm)} km from delivery location`,
    },
    availability: {
      score: availScore,
      maxScore: 10,
      rating: availRating,
      explanation: hasCertificate ? 'Active batch with Certificate of Analysis available' : 'Active inventory batch available',
    },
    deliveryFeasibility: {
      score: feasScore,
      maxScore: 10,
      rating: feasRating,
      explanation: feasibility.explanation,
    },
  };

  return { totalScore, rating: overallRating, breakdown };
}

/**
 * Generates transparent, factual "Why this match?" bullet points.
 */
export function generateWhyThisMatch(params: {
  isSingle: boolean;
  fulfilledQuantity: number;
  targetQuantity: number;
  purityPercentage: number;
  minPurity: number;
  landedCostPerTon: number;
  distanceKm: number;
  hasCertificate: boolean;
  feasibility: DeliveryFeasibility;
}): string[] {
  const {
    isSingle,
    fulfilledQuantity,
    targetQuantity,
    purityPercentage,
    minPurity,
    landedCostPerTon,
    distanceKm,
    hasCertificate,
    feasibility,
  } = params;

  const reasons: string[] = [];

  // Purity
  reasons.push(`✓ Meets required purity (${purityPercentage}% vs min ${minPurity}%)`);

  // Quantity
  if (isSingle && fulfilledQuantity >= targetQuantity) {
    reasons.push(`✓ 100% quantity available from single supplier`);
  } else if (fulfilledQuantity >= targetQuantity) {
    reasons.push(`✓ Pooled multi-supplier fulfillment achieves 100% of required quantity`);
  } else {
    const pct = Math.round((fulfilledQuantity / targetQuantity) * 100);
    reasons.push(`✓ Fulfills ${pct}% of demand (${fulfilledQuantity} T of ${targetQuantity} T)`);
  }

  // Cost
  reasons.push(`✓ Competitive landed cost (₹${landedCostPerTon.toLocaleString()}/T incl. cryogenic freight)`);

  // Distance
  reasons.push(`✓ Nearby supplier logistics (${Math.round(distanceKm)} km to delivery site)`);

  // Feasibility
  if (feasibility.status === 'FEASIBLE') {
    reasons.push(`✓ Delivery window feasible (~${feasibility.estimatedTransitHours}h total dispatch turnaround)`);
  } else if (feasibility.status === 'TIGHT') {
    reasons.push(`⚠ Delivery turnaround tight (~${feasibility.estimatedTransitHours}h dispatch window)`);
  }

  // Certificate
  if (hasCertificate) {
    reasons.push(`✓ Certificate of Analysis (CoA) available`);
  }

  return reasons;
}

export class MatchingService {
  /**
   * Main Smart CO2 Matching engine.
   * Ranks single-supplier matches and generates multi-supplier volume pooling proposals.
   * Does NOT reserve inventory during matching.
   */
  public static async matchRequirement(requirementId: string): Promise<MatchingResult> {
    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId },
      include: { buyer: true },
    });

    if (!requirement) {
      throw new NotFoundError(`Requirement '${requirementId}' not found.`);
    }

    const targetQty = requirement.targetQuantity.toNumber();
    const minPurity = requirement.minPurity.toNumber();
    const buyerCoord: GeoCoordinate = {
      latitude: requirement.deliveryLat.toNumber(),
      longitude: requirement.deliveryLng.toNumber(),
    };

    // Query active candidate listings with strict hard filters:
    // 1. status = ACTIVE
    // 2. sellingMethod = FIXED_PRICE (deterministic catalog lots)
    // 3. batch.availableQuantity > 0
    // 4. batch.purityPercentage >= minPurity
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
          include: { certificate: true },
        },
        seller: true,
      },
    });

    // Evaluate each candidate lot
    const evaluatedLots: (ContributingLot & {
      singleScore: number;
      singleRating: 'Excellent' | 'Good' | 'Moderate' | 'Fair';
      singleBreakdown: ScoreBreakdown;
      feasibility: DeliveryFeasibility;
      whyThisMatch: string[];
    })[] = [];

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

      // Delivery feasibility calculation
      const feasibility = calculateDeliveryFeasibility(distanceKm, requirement.requiredDeliveryDate);

      // Match scoring
      const scoreResult = calculateMatchScore({
        fulfilledQuantity: Math.min(availableQty, targetQty),
        targetQuantity: targetQty,
        purityPercentage: purity,
        minPurity,
        landedCostPerTon,
        distanceKm,
        hasCertificate,
        feasibility,
      });

      const whyThisMatch = generateWhyThisMatch({
        isSingle: availableQty >= targetQty,
        fulfilledQuantity: Math.min(availableQty, targetQty),
        targetQuantity: targetQty,
        purityPercentage: purity,
        minPurity,
        landedCostPerTon,
        distanceKm,
        hasCertificate,
        feasibility,
      });

      evaluatedLots.push({
        listingId: listing.id,
        batchId: listing.batch.id,
        batchNumber: listing.batch.batchNumber,
        sellerId: listing.seller.id,
        sellerName: listing.seller.name,
        contributingQuantity: availableQty,
        availableBatchQuantity: availableQty,
        purityPercentage: purity,
        pricePerTon: basePrice,
        distanceKm,
        freightCostPerTon: Math.round(freightPerTon * 100) / 100,
        landedCostPerTon,
        totalLotCost: Math.round(landedCostPerTon * availableQty * 100) / 100,
        hasCertificate,
        singleScore: scoreResult.totalScore,
        singleRating: scoreResult.rating,
        singleBreakdown: scoreResult.breakdown,
        feasibility,
        whyThisMatch,
      });
    }

    // Sort lots by score descending (highest quality & economic value first)
    evaluatedLots.sort((a, b) => b.singleScore - a.singleScore);

    // 1. Single-Supplier Matches (Lots with availableQuantity >= targetQty)
    const singleMatches: SingleSupplierMatch[] = [];
    for (const lot of evaluatedLots) {
      if (lot.availableBatchQuantity >= targetQty) {
        const productCost = Math.round(lot.pricePerTon * targetQty * 100) / 100;
        const freightCost = Math.round(lot.freightCostPerTon * targetQty * 100) / 100;
        const totalLandedCost = Math.round((productCost + freightCost) * 100) / 100;

        singleMatches.push({
          matchType: 'SINGLE_SUPPLIER',
          listingId: lot.listingId,
          batchId: lot.batchId,
          batchNumber: lot.batchNumber,
          sellerId: lot.sellerId,
          sellerName: lot.sellerName,
          availableQuantity: lot.availableBatchQuantity,
          offeredQuantity: targetQty,
          purityPercentage: lot.purityPercentage,
          pricePerTon: lot.pricePerTon,
          distanceKm: lot.distanceKm,
          estimatedFreightPerTon: lot.freightCostPerTon,
          landedUnitCost: lot.landedCostPerTon,
          totalProductCost: productCost,
          totalFreightCost: freightCost,
          totalLandedCost,
          score: lot.singleScore,
          rating: lot.singleRating,
          scoreBreakdown: lot.singleBreakdown,
          deliveryFeasibility: lot.feasibility,
          whyThisMatch: lot.whyThisMatch,
          hasCertificate: lot.hasCertificate,
        });
      }
    }

    // 2. Multi-Supplier Combinatorial Volume Pooling
    // Limit candidate suppliers to top 15 sorted candidates to prevent combinatorial explosion
    const candidatePool = evaluatedLots.slice(0, 15);
    const multiMatches: MultiSupplierCompositeMatch[] = [];

    // Helper to build a composite proposal from an ordered subset of lots
    const buildCompositeProposal = (
      lots: typeof candidatePool,
      title: string
    ): MultiSupplierCompositeMatch | null => {
      let accumulatedQty = 0;
      const pooledLots: ContributingLot[] = [];

      for (const lot of lots) {
        if (accumulatedQty >= targetQty) break;

        const needed = targetQty - accumulatedQty;
        const takeQty = Math.min(lot.availableBatchQuantity, needed);

        if (takeQty > 0) {
          const lotProductCost = Math.round(lot.pricePerTon * takeQty * 100) / 100;
          const lotFreightCost = Math.round(lot.freightCostPerTon * takeQty * 100) / 100;
          const lotTotalCost = Math.round((lotProductCost + lotFreightCost) * 100) / 100;

          pooledLots.push({
            listingId: lot.listingId,
            batchId: lot.batchId,
            batchNumber: lot.batchNumber,
            sellerId: lot.sellerId,
            sellerName: lot.sellerName,
            contributingQuantity: takeQty,
            availableBatchQuantity: lot.availableBatchQuantity,
            purityPercentage: lot.purityPercentage,
            pricePerTon: lot.pricePerTon,
            distanceKm: lot.distanceKm,
            freightCostPerTon: lot.freightCostPerTon,
            landedCostPerTon: lot.landedCostPerTon,
            totalLotCost: lotTotalCost,
            hasCertificate: lot.hasCertificate,
          });
          accumulatedQty += takeQty;
        }
      }

      // We only form multi-supplier composite proposals when more than 1 supplier participates
      if (pooledLots.length < 2) return null;

      let totalProdCost = 0;
      let totalFreightCost = 0;
      let purityWeightSum = 0;
      let distanceWeightSum = 0;
      let allCertificates = true;

      for (const p of pooledLots) {
        totalProdCost += p.pricePerTon * p.contributingQuantity;
        totalFreightCost += p.freightCostPerTon * p.contributingQuantity;
        purityWeightSum += p.purityPercentage * p.contributingQuantity;
        distanceWeightSum += p.distanceKm * p.contributingQuantity;
        if (!p.hasCertificate) allCertificates = false;
      }

      const totalLandedCost = Math.round((totalProdCost + totalFreightCost) * 100) / 100;
      const avgPurity = Math.round((purityWeightSum / accumulatedQty) * 100) / 100;
      const avgDistance = Math.round((distanceWeightSum / accumulatedQty) * 100) / 100;
      const avgLandedPerTon = Math.round((totalLandedCost / accumulatedQty) * 100) / 100;
      const maxDistance = Math.max(...pooledLots.map((p) => p.distanceKm));

      // Composite delivery feasibility is governed by the farthest constituent supplier
      const compositeFeasibility = calculateDeliveryFeasibility(maxDistance, requirement.requiredDeliveryDate);

      const compositeScoreResult = calculateMatchScore({
        fulfilledQuantity: accumulatedQty,
        targetQuantity: targetQty,
        purityPercentage: avgPurity,
        minPurity,
        landedCostPerTon: avgLandedPerTon,
        distanceKm: avgDistance,
        hasCertificate: allCertificates,
        feasibility: compositeFeasibility,
      });

      const whyThisMatch = generateWhyThisMatch({
        isSingle: false,
        fulfilledQuantity: accumulatedQty,
        targetQuantity: targetQty,
        purityPercentage: avgPurity,
        minPurity,
        landedCostPerTon: avgLandedPerTon,
        distanceKm: avgDistance,
        hasCertificate: allCertificates,
        feasibility: compositeFeasibility,
      });

      return {
        matchType: 'MULTI_SUPPLIER_COMPOSITE',
        proposalId: uuidv4(),
        proposalTitle: title,
        totalFulfilledQuantity: accumulatedQty,
        targetQuantity: targetQty,
        fulfillmentPercentage: Math.round((accumulatedQty / targetQty) * 10000) / 100,
        weightedAveragePurity: avgPurity,
        contributingLots: pooledLots,
        totalProductCost: Math.round(totalProdCost * 100) / 100,
        totalFreightCost: Math.round(totalFreightCost * 100) / 100,
        totalLandedCost,
        averageLandedCostPerTon: avgLandedPerTon,
        score: compositeScoreResult.totalScore,
        rating: compositeScoreResult.rating,
        scoreBreakdown: compositeScoreResult.breakdown,
        deliveryFeasibility: compositeFeasibility,
        whyThisMatch,
      };
    };

    // Combination A: Optimal Balanced Greedy Pooling (sorted by score)
    const primaryProposal = buildCompositeProposal(candidatePool, 'Optimal Volume Pool');
    if (primaryProposal) {
      multiMatches.push(primaryProposal);
    }

    // Combination B: Closest Proximity First Pooling (if different lot ordering exists)
    const distanceSortedLots = [...candidatePool].sort((a, b) => a.distanceKm - b.distanceKm);
    const proximityProposal = buildCompositeProposal(distanceSortedLots, 'Lowest Distance Pool');
    if (
      proximityProposal &&
      primaryProposal &&
      proximityProposal.contributingLots.map((l) => `${l.batchId}:${l.contributingQuantity}`).join('|') !==
        primaryProposal.contributingLots.map((l) => `${l.batchId}:${l.contributingQuantity}`).join('|')
    ) {
      multiMatches.push(proximityProposal);
    }

    const allScores = [
      ...singleMatches.map((m) => m.score),
      ...multiMatches.map((m) => m.score),
    ];
    const bestMatchScore = allScores.length > 0 ? Math.max(...allScores) : 0;

    let summaryNote = '';
    if (singleMatches.length > 0) {
      summaryNote = `Found ${singleMatches.length} single-supplier source(s) capable of fulfilling 100% of your ${targetQty} T demand.`;
    } else if (multiMatches.length > 0) {
      summaryNote = `No single supplier can supply ${targetQty} T; generated ${multiMatches.length} intelligent volume-pooled multi-supplier proposal(s).`;
    } else {
      summaryNote = 'No available supplier batches currently meet both your quantity and minimum purity specifications.';
    }

    return {
      requirementId,
      targetQuantity: targetQty,
      minPurity,
      deliveryCoordinates: buyerCoord,
      singleSupplierMatches: singleMatches,
      multiSupplierMatches: multiMatches,
      evaluatedCandidatesCount: evaluatedLots.length,
      bestMatchScore,
      summaryNote,
    };
  }
}
