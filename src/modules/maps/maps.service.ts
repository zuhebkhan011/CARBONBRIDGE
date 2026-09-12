import { ShipmentIndividualStatus, Role } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { calculateDistanceKm } from '../../common/utils/geo.js';

export class MapsService {
  /**
   * Retrieves active, allocated, undelivered transactions scoped to authenticated user.
   * Auto-excludes any shipment that has reached 'RECEIVED' state for zero-clutter visualization.
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
          select: { id: true, orderNumber: true, overallStatus: true, orderType: true },
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

    const activeRoutes = shipments.map((s) => {
      const origin = {
        name: s.seller.name,
        address: s.seller.address,
        latitude: s.originLat.toNumber(),
        longitude: s.originLng.toNumber(),
      };

      const destination = {
        name: s.buyer.name,
        address: s.buyer.address,
        latitude: s.destinationLat.toNumber(),
        longitude: s.destinationLng.toNumber(),
      };

      const distanceKm = calculateDistanceKm(origin, destination);

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
        origin,
        destination,
        distanceKm,
        dispatchedAt: s.dispatchedAt,
        deliveredAt: s.deliveredAt,
        trackingNotes: s.trackingNotes,
      };
    });

    return {
      activeRunsCount: activeRoutes.length,
      scope: role === Role.SELLER ? 'SELLER_VIEW (Plant -> Buyers)' : 'BUYER_VIEW (Origins -> My Delivery Site)',
      visibilityRule: 'Shows active undelivered runs. Auto-drops immediately upon reaching RECEIVED.',
      routes: activeRoutes,
    };
  }
}
