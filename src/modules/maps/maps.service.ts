import { ShipmentIndividualStatus, Role } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { RouteService } from '../logistics/route.service.js';
import { resolveLocationCoordinates, calculateEstimatedProgress } from '../../common/utils/geo.js';

export class MapsService {
  /**
   * Retrieves active, allocated, undelivered transactions scoped to authenticated user.
   * Auto-excludes any shipment that has reached 'RECEIVED' state for zero-clutter visualization.
   * Resolves real OSRM road geometry and distance for every active seller -> buyer shipment.
   */
  public static async getActiveTransactionMap(companyId: string, role: Role) {
    // Only fetch non-terminal shipments: ALLOCATED, DISPATCH_PENDING, IN_TRANSIT, DELIVERED
    const activeStatuses: ShipmentIndividualStatus[] = [
      ShipmentIndividualStatus.ALLOCATED,
      ShipmentIndividualStatus.DISPATCH_PENDING,
      ShipmentIndividualStatus.IN_TRANSIT,
      ShipmentIndividualStatus.DELIVERED,
    ];

    let whereClause: any = {
      individualStatus: { in: activeStatuses },
    };

    if (role === Role.SELLER) {
      whereClause.sellerId = companyId;
    } else if (role === Role.BUYER) {
      whereClause.buyerId = companyId;
    }

    const shipments = await prisma.shipment.findMany({
      where: whereClause,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            overallStatus: true,
            orderType: true,
          },
        },
        allocation: {
          include: {
            batch: {
              select: {
                id: true,
                batchNumber: true,
                purityPercentage: true,
                storagePressureBar: true,
              },
            },
          },
        },
        seller: {
          select: { id: true, name: true, address: true, latitude: true, longitude: true },
        },
        buyer: {
          select: { id: true, name: true, address: true, latitude: true, longitude: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const routePromises = new Map<string, Promise<any>>();

    const activeRoutes = await Promise.all(
      shipments.map(async (s) => {
        // Resolve authoritative origin
        const resolvedOrigin = resolveLocationCoordinates(
          s.seller.address,
          s.originLat?.toNumber(),
          s.originLng?.toNumber()
        );

        // Resolve authoritative destination from buyer company address and shipment destination
        const deliveryAddressText = s.buyer.address || '';
        const rawDestLat = s.destinationLat?.toNumber() ?? s.buyer.latitude?.toNumber();
        const rawDestLng = s.destinationLng?.toNumber() ?? s.buyer.longitude?.toNumber();

        const resolvedDest = resolveLocationCoordinates(
          deliveryAddressText,
          rawDestLat,
          rawDestLng
        );

        const origin = {
          name: s.seller.name,
          address: s.seller.address,
          city: resolvedOrigin.city,
          state: resolvedOrigin.state,
          latitude: resolvedOrigin.latitude,
          longitude: resolvedOrigin.longitude,
        };

        const destination = {
          name: s.buyer.name,
          address: deliveryAddressText || `${resolvedDest.city}, ${resolvedDest.state}`,
          city: resolvedDest.city,
          state: resolvedDest.state,
          latitude: resolvedDest.latitude,
          longitude: resolvedDest.longitude,
          isAuthoritative: resolvedDest.isAuthoritative,
        };

        const key = `${origin.latitude},${origin.longitude}->${destination.latitude},${destination.longitude}`;
        if (!routePromises.has(key)) {
          routePromises.set(key, RouteService.getPointToPointRoadRoute(origin, destination));
        }
        const routeResult = await routePromises.get(key)!;

        const estimatedProgress =
          s.individualStatus === ShipmentIndividualStatus.IN_TRANSIT
            ? calculateEstimatedProgress({
                dispatchedAt: s.dispatchedAt,
                durationHours: routeResult.durationHours,
                distanceKm: routeResult.distanceKm,
                geometry: routeResult.geometry,
              })
            : null;

        return {
          shipmentId: s.id,
          orderId: s.orderId,
          orderNumber: s.order.orderNumber,
          orderType: s.order.orderType,
          parentOrderStatus: s.order.overallStatus,
          status: s.individualStatus,
          allocatedTonnage: s.allocation.allocatedQuantity.toNumber(),
          purityPercentage: s.allocation.batch.purityPercentage.toNumber(),
          batchNumber: s.allocation.batch.batchNumber,
          seller: {
            id: s.seller.id,
            name: s.seller.name,
            address: s.seller.address,
            city: origin.city,
            state: origin.state,
            latitude: origin.latitude,
            longitude: origin.longitude,
          },
          buyer: {
            id: s.buyer.id,
            name: s.buyer.name,
            address: destination.address,
            city: destination.city,
            state: destination.state,
            latitude: destination.latitude,
            longitude: destination.longitude,
          },
          origin,
          destination,
          distanceKm: routeResult.distanceKm,
          durationHours: routeResult.durationHours,
          geometry: routeResult.geometry,
          isRoadRoute: routeResult.isRoadRoute,
          routeType: routeResult.routeType,
          routeStatus: routeResult.routeStatus,
          routingProvider: routeResult.routingProvider,
          dispatchedAt: s.dispatchedAt,
          deliveredAt: s.deliveredAt,
          trackingNotes: s.trackingNotes,
          estimatedProgress,
        };
      })
    );

    const totalAllocatedTonnage = Math.round(
      activeRoutes.reduce((acc, r) => acc + r.allocatedTonnage, 0) * 100
    ) / 100;
    const suppliersCount = new Set(activeRoutes.map((r) => r.seller.id)).size;

    return {
      activeRunsCount: activeRoutes.length,
      totalAllocatedTonnage,
      suppliersCount,
      destination: activeRoutes[0]?.destination || null,
      scope:
        role === Role.SELLER
          ? 'SELLER_VIEW (Plant -> Buyers)'
          : 'BUYER_VIEW (Origins -> My Delivery Site)',
      visibilityRule:
        'Shows active undelivered runs. Auto-drops immediately upon reaching RECEIVED.',
      routes: activeRoutes,
      transactions: activeRoutes, // Backwards-compatible alias
    };
  }
}
