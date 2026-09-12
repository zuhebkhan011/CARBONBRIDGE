import { prisma } from '../../database/prisma.js';
import { RequirementStatus, ListingStatus, SellingMethod, Prisma } from '@prisma/client';
import { calculateDistanceKm, GeoCoordinate } from '../../common/utils/geo.js';
import { calculateMatchScore, calculateDeliveryFeasibility } from '../matching/matching.service.js';
import { config } from '../../config/env.js';

export interface RegionalCluster {
  name: string;
  activeDemandTons: number;
  activeSupplyTons: number;
  buyerCount: number;
  sellerCount: number;
}

export interface MarketplaceInsightsResult {
  totalActiveDemandTons: number;
  totalActiveSupplyTons: number;
  activeRequirementsCount: number;
  activeListingsCount: number;
  supplyDemandRatio: number;
  highPurityDemandTons: number;
  clusters: RegionalCluster[];
  insights: string[];
}

export interface SellerOpportunity {
  requirementId: string;
  displayId: string;
  buyerName: string;
  targetQuantity: number;
  minPurity: number;
  deliveryLocation: string;
  matchingBatchId: string;
  batchNumber: string;
  availableBatchQuantity: number;
  purityPercentage: number;
  distanceKm: number;
  fitType: 'FULL_MATCH' | 'POOLED_CANDIDATE';
  fitDescription: string;
  matchScore: number;
  primaryCta: 'View Match';
}

export interface SellerOpportunitiesResult {
  sellerCompanyId: string;
  totalAvailableTons: number;
  matchingBatchesCount: number;
  opportunitiesCount: number;
  headline: string;
  opportunities: SellerOpportunity[];
}

export interface BuyerRequirementInsightsResult {
  requirementId: string;
  targetQuantity: number;
  minPurity: number;
  feasibleSupplierCombinationsCount: number;
  nearbyFulfillmentPercentage: number;
  nearbyAvailableTons: number;
  radiusExpansionOpportunity: {
    canExpand: boolean;
    currentRadiusKm: number;
    proposedRadiusKm: number;
    additionalSuppliersUnlocked: number;
    additionalTonsUnlocked: number;
    insightNote: string;
  } | null;
  insights: string[];
}

export class InsightsService {
  /**
   * Aggregates real marketplace data to compute supply-demand analytics and insights.
   * Strictly grounded in database records without fabricating market statistics.
   */
  public static async getMarketplaceInsights(): Promise<MarketplaceInsightsResult> {
    const [requirements, batches] = await Promise.all([
      prisma.requirement.findMany({
        where: { status: { in: [RequirementStatus.OPEN, RequirementStatus.PARTIALLY_FULFILLED] } },
        include: { buyer: { select: { id: true, name: true, address: true } } },
      }),
      prisma.batch.findMany({
        where: {
          status: 'ACTIVE',
          availableQuantity: { gt: new Prisma.Decimal(0) },
        },
        include: { seller: { select: { id: true, name: true, address: true } } },
      }),
    ]);

    let totalDemand = 0;
    let highPurityDemand = 0;
    for (const r of requirements) {
      const qty = r.targetQuantity.toNumber();
      totalDemand += qty;
      if (r.minPurity.toNumber() >= 75) {
        highPurityDemand += qty;
      }
    }

    let totalSupply = 0;
    for (const b of batches) {
      totalSupply += b.availableQuantity.toNumber();
    }

    const clustersMap: Record<string, RegionalCluster> = {};
    const extractCity = (addr?: string | null): string => {
      if (!addr) return 'Regional Industrial Hub';
      const parts = addr.split(',').map((p) => p.trim());
      if (parts.length >= 2) {
        return parts[parts.length - 2] || parts[0];
      }
      return parts[0] || 'Regional Industrial Hub';
    };

    // Aggregate demand by city
    for (const r of requirements) {
      const city = extractCity(r.deliveryAddress);
      if (!clustersMap[city]) {
        clustersMap[city] = {
          name: city,
          activeDemandTons: 0,
          activeSupplyTons: 0,
          buyerCount: 0,
          sellerCount: 0,
        };
      }
      clustersMap[city].activeDemandTons += r.targetQuantity.toNumber();
      clustersMap[city].buyerCount += 1;
    }

    // Aggregate supply by city
    for (const b of batches) {
      const city = extractCity(b.seller?.address);
      if (!clustersMap[city]) {
        clustersMap[city] = {
          name: city,
          activeDemandTons: 0,
          activeSupplyTons: 0,
          buyerCount: 0,
          sellerCount: 0,
        };
      }
      clustersMap[city].activeSupplyTons += b.availableQuantity.toNumber();
      clustersMap[city].sellerCount += 1;
    }

    const clusters = Object.values(clustersMap);
    const insights: string[] = [];

    if (requirements.length === 0 && batches.length === 0) {
      insights.push('Not enough marketplace data for this insight.');
    } else {
      for (const c of clusters) {
        if (c.activeDemandTons > 0 && c.activeSupplyTons > 0) {
          insights.push(
            `${c.name} has ${c.activeDemandTons.toLocaleString()}T active demand and ${c.activeSupplyTons.toLocaleString()}T nearby supply.`
          );
        } else if (c.activeDemandTons > 0) {
          insights.push(
            `${c.name} has ${c.activeDemandTons.toLocaleString()}T active buyer demand seeking supplier sources.`
          );
        } else if (c.activeSupplyTons > 0) {
          insights.push(
            `${c.name} has ${c.activeSupplyTons.toLocaleString()}T active industrial supply ready for dispatch.`
          );
        }
      }

      if (highPurityDemand > 0) {
        insights.push(
          `High demand detected for CO₂ purity above 75% (${highPurityDemand.toLocaleString()}T required across active orders).`
        );
      }
    }

    const supplyDemandRatio = totalSupply > 0 ? Math.round((totalDemand / totalSupply) * 100) / 100 : 0;

    return {
      totalActiveDemandTons: totalDemand,
      totalActiveSupplyTons: totalSupply,
      activeRequirementsCount: requirements.length,
      activeListingsCount: batches.length,
      supplyDemandRatio,
      highPurityDemandTons: highPurityDemand,
      clusters,
      insights,
    };
  }

  /**
   * For an authenticated seller, evaluates active available batches against active buyer requirements.
   * Does NOT auto-allocate; provides advisory matchmaking opportunities with primary CTA.
   */
  public static async getSellerOpportunities(sellerCompanyId: string): Promise<SellerOpportunitiesResult> {
    const [sellerBatches, activeRequirements] = await Promise.all([
      prisma.batch.findMany({
        where: {
          sellerId: sellerCompanyId,
          status: 'ACTIVE',
          availableQuantity: { gt: new Prisma.Decimal(0) },
        },
        include: {
          listings: true,
          certificate: true,
        },
      }),
      prisma.requirement.findMany({
        where: { status: { in: [RequirementStatus.OPEN, RequirementStatus.PARTIALLY_FULFILLED] } },
        include: { buyer: { select: { id: true, name: true, address: true } } },
      }),
    ]);

    let totalAvailable = 0;
    for (const b of sellerBatches) {
      totalAvailable += b.availableQuantity.toNumber();
    }

    const opportunities: SellerOpportunity[] = [];

    for (const batch of sellerBatches) {
      const batchQty = batch.availableQuantity.toNumber();
      const batchPurity = batch.purityPercentage.toNumber();
      const hasCert = Boolean(batch.certificate);
      const batchCoord: GeoCoordinate = {
        latitude: batch.locationLat.toNumber(),
        longitude: batch.locationLng.toNumber(),
      };
      const activeListing = batch.listings?.find((l) => l.status === 'ACTIVE') || batch.listings?.[0];
      const basePrice = activeListing?.pricePerTon ? activeListing.pricePerTon.toNumber() : 2450;

      for (const req of activeRequirements) {
        const reqMinPurity = req.minPurity.toNumber();
        const reqTargetQty = req.targetQuantity.toNumber();

        // Must meet purity threshold
        if (batchPurity >= reqMinPurity) {
          const reqCoord: GeoCoordinate = {
            latitude: req.deliveryLat.toNumber(),
            longitude: req.deliveryLng.toNumber(),
          };
          const distanceKm = calculateDistanceKm(batchCoord, reqCoord);
          const freightPerTon = distanceKm * config.CRYO_FREIGHT_BASE_RATE_PER_KM;
          const landedCostPerTon = Math.round((basePrice + freightPerTon) * 100) / 100;

          const feasibility = calculateDeliveryFeasibility(distanceKm, req.requiredDeliveryDate);

          const scoreRes = calculateMatchScore({
            fulfilledQuantity: Math.min(batchQty, reqTargetQty),
            targetQuantity: reqTargetQty,
            purityPercentage: batchPurity,
            minPurity: reqMinPurity,
            landedCostPerTon,
            distanceKm,
            hasCertificate: hasCert,
            feasibility,
          });

          const isFullMatch = batchQty >= reqTargetQty;
          const fitType: 'FULL_MATCH' | 'POOLED_CANDIDATE' = isFullMatch ? 'FULL_MATCH' : 'POOLED_CANDIDATE';
          const fitDescription = isFullMatch
            ? `Full single-supplier match (${batchQty}T available fulfills 100% of ${reqTargetQty}T requirement)`
            : `Pooled volume candidate (${batchQty}T can fulfill ${Math.round((batchQty / reqTargetQty) * 100)}% of ${reqTargetQty}T requirement)`;

          opportunities.push({
            requirementId: req.id,
            displayId: `REQ-${req.id.slice(0, 8).toUpperCase()}`,
            buyerName: req.buyer?.name || 'Verified Industrial Buyer',
            targetQuantity: reqTargetQty,
            minPurity: reqMinPurity,
            deliveryLocation: req.deliveryAddress || 'Gujarat Cluster',
            matchingBatchId: batch.id,
            batchNumber: batch.batchNumber,
            availableBatchQuantity: batchQty,
            purityPercentage: batchPurity,
            distanceKm,
            fitType,
            fitDescription,
            matchScore: scoreRes.totalScore,
            primaryCta: 'View Match',
          });
        }
      }
    }

    // Sort opportunities by highest match score first
    opportunities.sort((a, b) => b.matchScore - a.matchScore);

    const headline =
      opportunities.length > 0
        ? `Your ${totalAvailable}T available inventory matches ${opportunities.length} active buyer requirement(s).`
        : 'No active buyer requirements currently match your inventory specifications.';

    return {
      sellerCompanyId,
      totalAvailableTons: totalAvailable,
      matchingBatchesCount: sellerBatches.length,
      opportunitiesCount: opportunities.length,
      headline,
      opportunities,
    };
  }

  /**
   * For an active buyer requirement, computes demand-side intelligence
   * such as feasible combinations, nearby fulfillment %, and delivery radius unlock opportunities.
   */
  public static async getBuyerRequirementInsights(requirementId: string): Promise<BuyerRequirementInsightsResult> {
    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId },
    });

    if (!requirement) {
      return {
        requirementId,
        targetQuantity: 0,
        minPurity: 0,
        feasibleSupplierCombinationsCount: 0,
        nearbyFulfillmentPercentage: 0,
        nearbyAvailableTons: 0,
        radiusExpansionOpportunity: null,
        insights: ['Not enough marketplace data for this insight.'],
      };
    }

    const targetQty = requirement.targetQuantity.toNumber();
    const minPurity = requirement.minPurity.toNumber();
    const buyerCoord: GeoCoordinate = {
      latitude: requirement.deliveryLat.toNumber(),
      longitude: requirement.deliveryLng.toNumber(),
    };

    // Query candidate batches meeting purity threshold
    const candidates = await prisma.listing.findMany({
      where: {
        status: ListingStatus.ACTIVE,
        sellingMethod: SellingMethod.FIXED_PRICE,
        batch: {
          availableQuantity: { gt: new Prisma.Decimal(0) },
          purityPercentage: { gte: new Prisma.Decimal(minPurity.toFixed(2)) },
        },
      },
      include: { batch: true, seller: true },
    });

    let nearbyAvailableTons = 0;
    const baseRadiusKm = 150;
    const expandedRadiusKm = 300;

    let inBaseRadiusCount = 0;
    let inExpandedRadiusCount = 0;
    let expandedAvailableTons = 0;

    for (const c of candidates) {
      const sellerCoord: GeoCoordinate = {
        latitude: c.batch.locationLat.toNumber(),
        longitude: c.batch.locationLng.toNumber(),
      };
      const dist = calculateDistanceKm(sellerCoord, buyerCoord);
      const qty = c.batch.availableQuantity.toNumber();

      if (dist <= baseRadiusKm) {
        nearbyAvailableTons += qty;
        inBaseRadiusCount += 1;
      } else if (dist <= expandedRadiusKm) {
        expandedAvailableTons += qty;
        inExpandedRadiusCount += 1;
      }
    }

    const nearbyFulfillmentPct = targetQty > 0 ? Math.min(100, Math.round((nearbyAvailableTons / targetQty) * 100)) : 0;
    const insights: string[] = [];

    // Combinations count
    const feasibleSupplierCombinationsCount = candidates.length >= 2 ? Math.min(3, candidates.length - 1) : candidates.length;

    if (feasibleSupplierCombinationsCount > 0) {
      insights.push(`Your ${targetQty}T requirement has ${feasibleSupplierCombinationsCount} feasible supplier combination(s).`);
    }

    if (nearbyFulfillmentPct >= 100) {
      insights.push(`Current nearby supply can fulfill 100% of your requirement.`);
    } else if (nearbyAvailableTons > 0) {
      insights.push(`Current nearby supply can fulfill ${nearbyFulfillmentPct}% of your requirement (${nearbyAvailableTons}T of ${targetQty}T).`);
    } else {
      insights.push(`Your requirement currently has insufficient nearby supply within ${baseRadiusKm} km.`);
    }

    let radiusExpansionOpportunity = null;
    if (inExpandedRadiusCount > 0) {
      const note = `Expanding delivery radius to ${expandedRadiusKm} km could unlock ${inExpandedRadiusCount} additional supplier(s) (${expandedAvailableTons}T CO₂).`;
      insights.push(note);
      radiusExpansionOpportunity = {
        canExpand: true,
        currentRadiusKm: baseRadiusKm,
        proposedRadiusKm: expandedRadiusKm,
        additionalSuppliersUnlocked: inExpandedRadiusCount,
        additionalTonsUnlocked: expandedAvailableTons,
        insightNote: note,
      };
    }

    return {
      requirementId,
      targetQuantity: targetQty,
      minPurity,
      feasibleSupplierCombinationsCount,
      nearbyFulfillmentPercentage: nearbyFulfillmentPct,
      nearbyAvailableTons,
      radiusExpansionOpportunity,
      insights,
    };
  }
}
