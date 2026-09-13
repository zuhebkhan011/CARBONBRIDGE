import { ShipmentIndividualStatus, Role } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../common/errors/AppError.js';
import { GeoCoordinate, computeRouteSavings } from '../../common/utils/geo.js';
import { config } from '../../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import {
  DeliveryStop,
  OptimizationResult,
  OptimizeRouteInput,
  SelectRouteInput,
} from './types.js';
import { OptimizerService } from './optimizer.service.js';
import { CostService } from './cost.service.js';

export class LogisticsService {
  /**
   * Fetches active pending shipments owned by the authenticated seller for route optimization
   */
  public static async getActiveShipmentsForOptimization(sellerCompanyId: string) {
    const seller = await prisma.company.findUnique({
      where: { id: sellerCompanyId },
      select: { id: true, name: true, address: true, latitude: true, longitude: true },
    });

    if (!seller) {
      throw new NotFoundError(`Seller company '${sellerCompanyId}' not found.`);
    }

    const shipments = await prisma.shipment.findMany({
      where: {
        sellerId: sellerCompanyId,
        individualStatus: {
          in: [
            ShipmentIndividualStatus.ALLOCATED,
            ShipmentIndividualStatus.DISPATCH_PENDING,
          ],
        },
      },
      include: {
        buyer: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
        order: { select: { id: true, orderNumber: true } },
        allocation: {
          select: {
            allocatedQuantity: true,
            pricePerTon: true,
            batch: { select: { batchNumber: true, purityPercentage: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedShipments = shipments.map((s) => ({
      shipmentId: s.id,
      orderId: s.orderId,
      orderNumber: s.order.orderNumber,
      buyerId: s.buyerId,
      buyerName: s.buyer.name,
      deliveryAddress: s.buyer.address,
      destinationLat: s.destinationLat.toNumber(),
      destinationLng: s.destinationLng.toNumber(),
      quantityTonnes: s.allocation.allocatedQuantity.toNumber(),
      pricePerTon: s.allocation.pricePerTon.toNumber(),
      batchNumber: s.allocation.batch.batchNumber,
      purityPercentage: s.allocation.batch.purityPercentage.toNumber(),
      status: s.individualStatus,
      createdAt: s.createdAt,
    }));

    return {
      sellerPlant: {
        id: seller.id,
        name: seller.name,
        address: seller.address,
        coordinates: {
          latitude: seller.latitude.toNumber(),
          longitude: seller.longitude.toNumber(),
        },
      },
      activeShipmentsCount: formattedShipments.length,
      shipments: formattedShipments,
    };
  }

  /**
   * Optimizes delivery routes for the authenticated seller
   */
  public static async optimizeSellerRoutes(
    sellerCompanyId: string,
    input?: OptimizeRouteInput
  ): Promise<OptimizationResult> {
    const seller = await prisma.company.findUnique({
      where: { id: sellerCompanyId },
      select: { id: true, name: true, address: true, latitude: true, longitude: true },
    });

    if (!seller) {
      throw new NotFoundError(`Seller company '${sellerCompanyId}' not found.`);
    }

    const sellerPlant = {
      id: seller.id,
      name: seller.name,
      address: seller.address,
      coordinates: {
        latitude: seller.latitude.toNumber(),
        longitude: seller.longitude.toNumber(),
      },
    };

    let stops: DeliveryStop[] = [];

    // Option A: Custom stops passed directly (e.g. for simulations / what-if planning)
    if (input?.customStops && input.customStops.length > 0) {
      stops = input.customStops.map((cs, idx) => ({
        id: cs.buyerId || `stop-${idx + 1}`,
        buyerId: cs.buyerId || `buyer-${idx + 1}`,
        buyerName: cs.buyerName || `Delivery Stop ${idx + 1}`,
        address: cs.address || `Stop Address ${idx + 1}`,
        coordinates: { latitude: cs.latitude, longitude: cs.longitude },
        quantityTonnes: cs.quantityTonnes,
        requiredDeliveryDate: cs.requiredDeliveryDate || null,
        co2PricePerTon: cs.co2PricePerTon || 2400,
      }));
    } else {
      // Option B: Query database for seller's shipments
      let whereClause: any = {
        individualStatus: {
          in: [
            ShipmentIndividualStatus.ALLOCATED,
            ShipmentIndividualStatus.DISPATCH_PENDING,
          ],
        },
      };

      if (input?.shipmentIds && input.shipmentIds.length > 0) {
        const requestedShipments = await prisma.shipment.findMany({
          where: { id: { in: input.shipmentIds } },
          select: { id: true, sellerId: true },
        });

        for (const reqShip of requestedShipments) {
          if (reqShip.sellerId !== sellerCompanyId) {
            throw new ForbiddenError(
              'Security violation: You cannot optimize routes for shipments owned by another seller.'
            );
          }
        }

        whereClause.id = { in: input.shipmentIds };
      } else {
        whereClause.sellerId = sellerCompanyId;
      }

      const shipments = await prisma.shipment.findMany({
        where: whereClause,
        include: {
          buyer: { select: { id: true, name: true, address: true } },
          order: { select: { id: true, orderNumber: true, requirementId: true } },
          allocation: { select: { allocatedQuantity: true, pricePerTon: true } },
        },
      });

      // Step 5 & 20: SECURITY — Verify all shipments belong strictly to the authenticated seller
      for (const s of shipments) {
        if (s.sellerId !== sellerCompanyId) {
          throw new ForbiddenError(
            'Security violation: You cannot optimize routes for shipments owned by another seller.'
          );
        }
      }

      stops = shipments.map((s) => ({
        id: s.id,
        buyerId: s.buyerId,
        buyerName: s.buyer.name,
        address: s.buyer.address,
        coordinates: {
          latitude: s.destinationLat.toNumber(),
          longitude: s.destinationLng.toNumber(),
        },
        quantityTonnes: s.allocation.allocatedQuantity.toNumber(),
        orderId: s.orderId,
        orderNumber: s.order.orderNumber,
        shipmentId: s.id,
        co2PricePerTon: s.allocation.pricePerTon.toNumber(),
      }));
    }

    return await OptimizerService.optimizeRoutes(sellerPlant, stops, input?.vehicle);
  }

  /**
   * Persists the seller's selected route recommendation
   * Strictly preserves existing shipment states without automatic mutation.
   */
  public static async selectOptimizedRoute(
    sellerCompanyId: string,
    actorUserId: string,
    input: SelectRouteInput
  ) {
    if (!input.routeId) {
      throw new BadRequestError('routeId is required.');
    }

    const routeName = input.routeName || 'Economically Optimized Route';

    // 1. If shipmentIds are provided, update their tracking notes with the route reference
    if (input.shipmentIds && input.shipmentIds.length > 0) {
      const ownedShipments = await prisma.shipment.findMany({
        where: { id: { in: input.shipmentIds } },
        select: { id: true, sellerId: true },
      });

      for (const s of ownedShipments) {
        if (s.sellerId !== sellerCompanyId) {
          throw new ForbiddenError(
            'You cannot update tracking information for shipments belonging to another seller.'
          );
        }
      }

      await prisma.shipment.updateMany({
        where: { id: { in: input.shipmentIds } },
        data: {
          trackingNotes: `[Selected Route: ${routeName}] Sequence planned via Smart Cost Optimizer.`,
        },
      });
    }

    // 2. Record audit event for traceability
    await AuditService.recordEvent({
      entityType: 'LOGISTICS_ROUTE',
      entityId: input.routeId,
      action: 'OPTIMIZED_ROUTE_SELECTED',
      actorId: actorUserId,
      metadata: {
        sellerCompanyId,
        routeName,
        tripPlans: input.tripPlans,
        shipmentIds: input.shipmentIds,
        notes: input.notes,
        selectedAt: new Date().toISOString(),
      },
    });

    return {
      selectedRouteId: input.routeId,
      routeName,
      status: 'ROUTE_CONFIRMED',
      message: `Selected route '${routeName}' has been assigned to your shipment trip plans. Existing shipment statuses remain intact.`,
    };
  }

  /**
   * Evaluates potential same-seller multi-buyer route consolidation.
   * Backward-compatible with existing consolidation endpoint while providing enhanced economics.
   */
  public static async analyzeSellerRouteConsolidation(sellerCompanyId: string) {
    const seller = await prisma.company.findUnique({
      where: { id: sellerCompanyId },
      select: { id: true, name: true, address: true, latitude: true, longitude: true },
    });

    if (!seller) {
      return { message: 'Seller not found' };
    }

    const originCoord: GeoCoordinate = {
      latitude: seller.latitude.toNumber(),
      longitude: seller.longitude.toNumber(),
    };

    // Find active undelivered shipments from this ONE seller
    const activeShipments = await prisma.shipment.findMany({
      where: {
        sellerId: sellerCompanyId,
        individualStatus: {
          in: [
            ShipmentIndividualStatus.ALLOCATED,
            ShipmentIndividualStatus.DISPATCH_PENDING,
          ],
        },
      },
      include: {
        buyer: { select: { id: true, name: true, address: true } },
        allocation: { select: { allocatedQuantity: true, pricePerTon: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    if (activeShipments.length < 2) {
      return {
        sellerPlant: {
          name: seller.name,
          address: seller.address,
          coordinates: originCoord,
        },
        activePendingShipmentsCount: activeShipments.length,
        consolidationOpportunityDetected: false,
        message:
          'Insufficient active shipments for route bundling. At least 2 active pending shipments are required to analyze multi-drop consolidation.',
      };
    }

    const destinations: (GeoCoordinate & {
      buyerName: string;
      shipmentId: string;
      tonnage: number;
    })[] = activeShipments.map((s) => ({
      latitude: s.destinationLat.toNumber(),
      longitude: s.destinationLng.toNumber(),
      buyerName: s.buyer.name,
      shipmentId: s.id,
      tonnage: s.allocation.allocatedQuantity.toNumber(),
    }));

    // Perform dynamic distance calculation
    const savings = computeRouteSavings(originCoord, destinations);
    const transitSpeed = config.CRYO_TRANSIT_ESTIMATE_KM_PER_HOUR || 45;

    const separateTravelHours = Math.round(
      (savings.independentDistanceKm / transitSpeed + destinations.length * 1) * 10
    ) / 10;
    const consolidatedTravelHours = Math.round(
      (savings.consolidatedDistanceKm / transitSpeed + destinations.length * 1) * 10
    ) / 10;
    const hoursSaved = Math.max(0, Math.round((separateTravelHours - consolidatedTravelHours) * 10) / 10);

    const routeSequence = [
      `Origin: ${seller.name} (Depot/Plant)`,
      ...destinations.map((d, i) => `Stop ${i + 1}: ${d.buyerName} (${d.tonnage} T CO₂)`),
      `Return: ${seller.name} (Depot/Plant)`,
    ];

    // Also run full smart optimization
    const smartStops: DeliveryStop[] = activeShipments.map((s) => ({
      id: s.id,
      buyerId: s.buyerId,
      buyerName: s.buyer.name,
      address: s.buyer.address,
      coordinates: {
        latitude: s.destinationLat.toNumber(),
        longitude: s.destinationLng.toNumber(),
      },
      quantityTonnes: s.allocation.allocatedQuantity.toNumber(),
      co2PricePerTon: s.allocation.pricePerTon.toNumber(),
      shipmentId: s.id,
      orderId: s.orderId,
      orderNumber: s.order.orderNumber,
    }));

    const smartResult = await OptimizerService.optimizeRoutes(
      { id: seller.id, name: seller.name, address: seller.address, coordinates: originCoord },
      smartStops
    );

    return {
      sellerPlant: {
        name: seller.name,
        address: seller.address,
        coordinates: originCoord,
      },
      activePendingShipmentsCount: activeShipments.length,
      consolidationOpportunityDetected: savings.savingsPercentage > 0,
      routeSequence,
      destinations: destinations.map((d) => ({
        shipmentId: d.shipmentId,
        buyerName: d.buyerName,
        tonnage: d.tonnage,
        coordinates: { latitude: d.latitude, longitude: d.longitude },
      })),
      metrics: {
        separateDistanceKm: savings.independentDistanceKm,
        consolidatedDistanceKm: savings.consolidatedDistanceKm,
        distanceSavedKm: savings.distanceSavedKm,
        percentageReduction: savings.savingsPercentage,
        estimatedTravelTime: {
          transitSpeedEstimateKmH: transitSpeed,
          separateHours: separateTravelHours,
          consolidatedHours: consolidatedTravelHours,
          hoursSaved,
        },
      },
      recommendation:
        savings.savingsPercentage > 10
          ? `High consolidation efficiency: Bundling these ${activeShipments.length} runs reduces cryogenic tanker empty-run deadheading by ${savings.savingsPercentage}% (${savings.distanceSavedKm} km saved, saving ~${hoursSaved}h).`
          : `Marginal consolidation efficiency (${savings.savingsPercentage}% savings). Standard individual dispatches remain viable.`,
      smartOptimization: smartResult,
    };
  }
}
