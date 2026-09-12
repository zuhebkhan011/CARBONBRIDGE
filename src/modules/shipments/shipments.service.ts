import { ShipmentIndividualStatus, Role } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import {
  NotFoundError,
  ForbiddenError,
  InvalidStateTransitionError,
} from '../../common/errors/AppError.js';
import { UpdateShipmentStatusInput } from './shipments.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { OrdersService } from '../orders/orders.service.js';

// Strict state transition lookup table
const VALID_TRANSITIONS: Record<
  ShipmentIndividualStatus,
  ShipmentIndividualStatus[]
> = {
  [ShipmentIndividualStatus.ALLOCATED]: [ShipmentIndividualStatus.DISPATCH_PENDING],
  [ShipmentIndividualStatus.DISPATCH_PENDING]: [ShipmentIndividualStatus.IN_TRANSIT],
  [ShipmentIndividualStatus.IN_TRANSIT]: [ShipmentIndividualStatus.DELIVERED],
  [ShipmentIndividualStatus.DELIVERED]: [ShipmentIndividualStatus.RECEIVED],
  [ShipmentIndividualStatus.RECEIVED]: [], // Terminal state
};

export class ShipmentsService {
  public static async updateShipmentStatus(
    shipmentId: string,
    companyId: string,
    userRole: Role,
    actorUserId: string,
    input: UpdateShipmentStatusInput
  ) {
    return prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        include: {
          order: true,
          allocation: { include: { batch: true } },
          seller: true,
          buyer: true,
        },
      });

      if (!shipment) {
        throw new NotFoundError(`Shipment '${shipmentId}' not found.`);
      }

      const currentStatus = shipment.individualStatus;
      const targetStatus = input.status;

      // 1. Validate State Machine Transition
      const allowedNextStates = VALID_TRANSITIONS[currentStatus];
      if (!allowedNextStates.includes(targetStatus)) {
        throw new InvalidStateTransitionError(
          `Invalid state transition: Cannot advance shipment from '${currentStatus}' to '${targetStatus}'. Allowed next: [${allowedNextStates.join(
            ', '
          )}]`
        );
      }

      // 2. Validate Role and Ownership Permissions
      if (targetStatus === ShipmentIndividualStatus.RECEIVED) {
        // Only the recipient Buyer can confirm receipt
        if (shipment.buyerId !== companyId && userRole !== Role.ADMIN) {
          throw new ForbiddenError(
            'Only the recipient buyer company can confirm custody receipt (RECEIVED).'
          );
        }
      } else {
        // DISPATCH_PENDING, IN_TRANSIT, DELIVERED can only be updated by Seller
        if (shipment.sellerId !== companyId && userRole !== Role.ADMIN) {
          throw new ForbiddenError(
            'Only the dispatching seller company can update shipment transit progress.'
          );
        }
      }

      // 3. Prepare timestamp updates
      const timestampUpdates: {
        dispatchedAt?: Date;
        deliveredAt?: Date;
        receivedAt?: Date;
      } = {};

      if (targetStatus === ShipmentIndividualStatus.IN_TRANSIT && !shipment.dispatchedAt) {
        timestampUpdates.dispatchedAt = new Date();
      } else if (targetStatus === ShipmentIndividualStatus.DELIVERED && !shipment.deliveredAt) {
        timestampUpdates.deliveredAt = new Date();
      } else if (targetStatus === ShipmentIndividualStatus.RECEIVED && !shipment.receivedAt) {
        timestampUpdates.receivedAt = new Date();
      }

      // 4. Update the individual shipment
      const updatedShipment = await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          individualStatus: targetStatus,
          trackingNotes: input.trackingNotes || shipment.trackingNotes,
          ...timestampUpdates,
        },
      });

      // 5. Refresh Parent Order overall status
      const overallOrderStatus = await OrdersService.refreshOrderOverallStatus(
        shipment.orderId,
        tx
      );

      // 6. Record immutable Audit Event
      await AuditService.recordEvent(
        {
          entityType: 'SHIPMENT',
          entityId: shipment.id,
          action: `SHIPMENT_TRANSITION_${targetStatus}`,
          actorId: actorUserId,
          metadata: {
            orderId: shipment.orderId,
            batchNumber: shipment.allocation.batch.batchNumber,
            previousStatus: currentStatus,
            newStatus: targetStatus,
            parentOrderOverallStatus: overallOrderStatus,
          },
        },
        tx
      );

      // Notify counterparty asynchronously
      const notifyTargetCompanyId =
        targetStatus === ShipmentIndividualStatus.RECEIVED ? shipment.sellerId : shipment.buyerId;

      NotificationService.notifyCompanyUsers(
        notifyTargetCompanyId,
        `Shipment Status: ${targetStatus}`,
        `Shipment for Batch ${shipment.allocation.batch.batchNumber} has advanced to ${targetStatus}.`,
        'SHIPMENT_STATUS_UPDATE'
      );

      return {
        shipment: updatedShipment,
        parentOrderOverallStatus: overallOrderStatus,
      };
    });
  }

  public static async listShipments(companyId: string, role: Role) {
    if (role === Role.SELLER) {
      return prisma.shipment.findMany({
        where: { sellerId: companyId },
        include: {
          allocation: { include: { batch: true } },
          buyer: { select: { id: true, name: true, address: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (role === Role.BUYER) {
      return prisma.shipment.findMany({
        where: { buyerId: companyId },
        include: {
          allocation: { include: { batch: true } },
          seller: { select: { id: true, name: true, address: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    return prisma.shipment.findMany({
      include: {
        allocation: { include: { batch: true } },
        seller: true,
        buyer: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  public static async getShipmentById(shipmentId: string, companyId: string, role: Role) {
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        allocation: { include: { batch: true } },
        seller: true,
        buyer: true,
        order: true,
      },
    });

    if (!shipment) {
      throw new NotFoundError(`Shipment '${shipmentId}' not found.`);
    }

    if (
      role !== Role.ADMIN &&
      shipment.sellerId !== companyId &&
      shipment.buyerId !== companyId
    ) {
      throw new ForbiddenError('You do not have permission to view this shipment.');
    }

    return shipment;
  }
}
