import {
  Prisma,
  OrderType,
  OrderOverallStatus,
  ShipmentIndividualStatus,
  ListingStatus,
  BatchStatus,
  SellingMethod,
} from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import {
  NotFoundError,
  BadRequestError,
  OverAllocationError,
  ForbiddenError,
} from '../../common/errors/AppError.js';
import { ProcureFixedPriceInput, ProcureCompositeInput } from './orders.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationService } from '../notifications/notification.service.js';

export class OrdersService {
  /**
   * Generates sequential or timestamped human-readable order number (e.g., CB-ORD-2026-1001)
   */
  private static generateOrderNumber(): string {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `CB-ORD-${Date.now().toString().slice(-6)}-${randomSuffix}`;
  }

  /**
   * Recalculates and synchronizes overall parent order status based on all child shipments
   */
  public static async refreshOrderOverallStatus(
    orderId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<OrderOverallStatus> {
    const shipments = await tx.shipment.findMany({
      where: { orderId },
      select: { individualStatus: true },
    });

    if (shipments.length === 0) {
      return OrderOverallStatus.CONFIRMED;
    }

    const allReceived = shipments.every(
      (s) => s.individualStatus === ShipmentIndividualStatus.RECEIVED
    );
    if (allReceived) {
      await tx.order.update({
        where: { id: orderId },
        data: { overallStatus: OrderOverallStatus.RECEIVED },
      });
      return OrderOverallStatus.RECEIVED;
    }

    const allDeliveredOrReceived = shipments.every(
      (s) =>
        s.individualStatus === ShipmentIndividualStatus.DELIVERED ||
        s.individualStatus === ShipmentIndividualStatus.RECEIVED
    );
    if (allDeliveredOrReceived) {
      await tx.order.update({
        where: { id: orderId },
        data: { overallStatus: OrderOverallStatus.DELIVERED },
      });
      return OrderOverallStatus.DELIVERED;
    }

    const anyInProgress = shipments.some(
      (s) =>
        s.individualStatus === ShipmentIndividualStatus.DISPATCH_PENDING ||
        s.individualStatus === ShipmentIndividualStatus.IN_TRANSIT ||
        s.individualStatus === ShipmentIndividualStatus.DELIVERED
    );
    if (anyInProgress) {
      await tx.order.update({
        where: { id: orderId },
        data: { overallStatus: OrderOverallStatus.IN_FULFILLMENT },
      });
      return OrderOverallStatus.IN_FULFILLMENT;
    }

    return OrderOverallStatus.CONFIRMED;
  }

  /**
   * Concurrency-Safe Fixed-Price Procurement Flow
   * Strictly enforces: Available = Captured - Allocated >= 0
   */
  public static async procureFixedPrice(
    buyerCompanyId: string,
    actorUserId: string,
    input: ProcureFixedPriceInput
  ) {
    const requestedQty = new Prisma.Decimal(input.quantity.toFixed(4));

    if (requestedQty.lte(0)) {
      throw new BadRequestError('Requested quantity must be positive.', 'INVALID_PURCHASE_QUANTITY');
    }

    return prisma.$transaction(
      async (tx) => {
        // 1. Fetch listing and batch details
        const listing = await tx.listing.findUnique({
          where: { id: input.listingId },
          include: {
            batch: true,
            seller: true,
          },
        });

        if (!listing) {
          throw new NotFoundError(`Listing '${input.listingId}' not found.`);
        }

        if (listing.status !== ListingStatus.ACTIVE) {
          throw new BadRequestError(
            `Listing is not active. Current status: ${listing.status}`,
            'LISTING_NOT_ACTIVE'
          );
        }

        if (listing.sellingMethod !== SellingMethod.FIXED_PRICE) {
          throw new BadRequestError(
            'This listing is an auction and cannot be purchased directly at fixed price.',
            'LISTING_NOT_FIXED_PRICE'
          );
        }

        if (!listing.pricePerTon) {
          throw new BadRequestError('Listing does not have an active fixed price.', 'LISTING_NO_PRICE');
        }

        // Prevent self-procurement
        if (listing.sellerId === buyerCompanyId) {
          throw new BadRequestError('Sellers cannot procure their own CO2 listings.', 'FORBIDDEN_SELF_PURCHASE');
        }

        const batch = listing.batch;

        if (listing.quantity && listing.quantity.gt(0) && requestedQty.gt(listing.quantity)) {
          throw new OverAllocationError(
            `Allocation rejected: Requested quantity (${requestedQty}T) exceeds available quantity on this listing (${listing.quantity}T).`,
            { listingQuantity: listing.quantity.toNumber(), requestedQuantity: requestedQty.toNumber() },
            'INSUFFICIENT_BATCH_STOCK'
          );
        }

        // 2. Concurrency-safe atomic conditional update on PostgreSQL
        // Guarantees row-level lock and verifies availableQuantity >= requestedQty
        const updateResult = await tx.batch.updateMany({
          where: {
            id: batch.id,
            status: { in: [BatchStatus.ACTIVE, BatchStatus.PARTIALLY_ALLOCATED] },
            availableQuantity: { gte: requestedQty },
          },
          data: {
            allocatedQuantity: { increment: requestedQty },
            availableQuantity: { decrement: requestedQty },
          },
        });

        if (updateResult.count === 0) {
          // Fetch current state for informative diagnostic error
          const currentBatch = await tx.batch.findUnique({
            where: { id: batch.id },
          });

          throw new OverAllocationError(
            `Allocation rejected: Batch '${batch.batchNumber}' has insufficient available capacity. ` +
              `Requested: ${input.quantity}T, Current Available: ${
                currentBatch?.availableQuantity.toString() || '0'
              }T.`,
            { currentAvailable: currentBatch?.availableQuantity.toNumber() || 0 },
            'INSUFFICIENT_BATCH_STOCK'
          );
        }

        // 3. Update listing quantity and status
        const remainingListingQty = listing.quantity.sub(requestedQty);
        await tx.listing.update({
          where: { id: listing.id },
          data: {
            quantity: remainingListingQty.lte(0) ? new Prisma.Decimal('0.0000') : remainingListingQty,
            status: remainingListingQty.lte(0) ? ListingStatus.SOLD : ListingStatus.ACTIVE,
          },
        });

        // 4. Update batch status to DEPLETED if balance reached zero
        const updatedBatch = await tx.batch.findUniqueOrThrow({
          where: { id: batch.id },
        });

        if (updatedBatch.availableQuantity.lte(0)) {
          await tx.batch.update({
            where: { id: batch.id },
            data: { status: BatchStatus.DEPLETED },
          });
          await tx.listing.updateMany({
            where: { batchId: batch.id, status: ListingStatus.ACTIVE },
            data: { status: ListingStatus.SOLD, quantity: new Prisma.Decimal('0.0000') },
          });
        } else {
          await tx.batch.update({
            where: { id: batch.id },
            data: { status: BatchStatus.PARTIALLY_ALLOCATED },
          });
        }

        // 4. Create parent Order record
        const orderNumber = OrdersService.generateOrderNumber();
        const totalPrice = requestedQty.mul(listing.pricePerTon);

        const order = await tx.order.create({
          data: {
            orderNumber,
            orderType: OrderType.SINGLE_SELLER,
            buyerId: buyerCompanyId,
            totalQuantity: requestedQty,
            totalPrice: new Prisma.Decimal(totalPrice.toFixed(2)),
            overallStatus: OrderOverallStatus.CONFIRMED,
            requirementId: input.requirementId || null,
          },
        });

        // 5. Create Allocation record
        const allocation = await tx.allocation.create({
          data: {
            orderId: order.id,
            batchId: batch.id,
            sellerId: listing.sellerId,
            allocatedQuantity: requestedQty,
            pricePerTon: listing.pricePerTon,
          },
        });

        // 6. Create initial child Shipment record at ALLOCATED
        const shipment = await tx.shipment.create({
          data: {
            orderId: order.id,
            allocationId: allocation.id,
            sellerId: listing.sellerId,
            buyerId: buyerCompanyId,
            individualStatus: ShipmentIndividualStatus.ALLOCATED,
            originLat: batch.locationLat,
            originLng: batch.locationLng,
            destinationLat: new Prisma.Decimal(input.deliveryLat.toFixed(7)),
            destinationLng: new Prisma.Decimal(input.deliveryLng.toFixed(7)),
            trackingNotes: `Order confirmed. Allocated from batch ${batch.batchNumber}. Awaiting dispatch staging.`,
          },
        });

        // 7. Record immutable audit events
        await AuditService.recordEvent(
          {
            entityType: 'ORDER',
            entityId: order.id,
            action: 'ORDER_CREATED_FIXED_PRICE',
            actorId: actorUserId,
            metadata: {
              orderNumber,
              batchNumber: batch.batchNumber,
              allocatedQuantity: input.quantity,
              totalPrice: totalPrice.toNumber(),
            },
          },
          tx
        );

        await AuditService.recordEvent(
          {
            entityType: 'BATCH',
            entityId: batch.id,
            action: 'BATCH_ALLOCATED',
            actorId: actorUserId,
            metadata: {
              allocatedTons: input.quantity,
              remainingAvailableTons: updatedBatch.availableQuantity.toNumber(),
            },
          },
          tx
        );

        // Notify seller and buyer asynchronously
        NotificationService.notifyCompanyUsers(
          listing.sellerId,
          'New CO2 Allocation Confirmed',
          `Order ${orderNumber}: ${input.quantity}T allocated from Batch ${batch.batchNumber}.`,
          'ORDER_ALLOCATED'
        );

        return {
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            orderType: order.orderType,
            overallStatus: order.overallStatus,
            totalQuantity: order.totalQuantity,
            totalPrice: order.totalPrice,
            createdAt: order.createdAt,
          },
          allocation: {
            id: allocation.id,
            batchNumber: batch.batchNumber,
            allocatedQuantity: allocation.allocatedQuantity,
            pricePerTon: allocation.pricePerTon,
          },
          shipment: {
            id: shipment.id,
            individualStatus: shipment.individualStatus,
            originLat: shipment.originLat,
            originLng: shipment.originLng,
            destinationLat: shipment.destinationLat,
            destinationLng: shipment.destinationLng,
          },
          remainingBatchAvailable: updatedBatch.availableQuantity,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );
  }

  /**
   * Concurrency-Safe Multi-Supplier Composite Procurement Flow
   * Atomically locks and allocates multiple pooled seller lots (e.g. 100T + 200T + 200T = 500T).
   * Rolls back completely if any single lot fails balance check.
   */
  public static async procureComposite(
    buyerCompanyId: string,
    actorUserId: string,
    input: ProcureCompositeInput
  ) {
    return prisma.$transaction(
      async (tx) => {
        let totalOrderQty = new Prisma.Decimal('0.0000');
        let totalOrderPrice = new Prisma.Decimal('0.00');

        const preparedAllocations: {
          batch: any;
          listing: any;
          requestedQty: Prisma.Decimal;
        }[] = [];

        // Pre-validate all lots
        for (const item of input.allocations) {
          const requestedQty = new Prisma.Decimal(item.quantity.toFixed(4));

          if (requestedQty.lte(0)) {
            throw new BadRequestError('Each composite allocation quantity must be positive.');
          }

          const listing = await tx.listing.findUnique({
            where: { id: item.listingId },
            include: { batch: true, seller: true },
          });

          if (!listing) {
            throw new NotFoundError(`Listing '${item.listingId}' not found.`);
          }

          if (listing.batchId !== item.batchId) {
            throw new BadRequestError('Listing does not match the specified Batch ID.');
          }

          if (listing.status !== ListingStatus.ACTIVE || !listing.pricePerTon) {
            throw new BadRequestError(`Listing '${listing.id}' is not an active fixed price listing.`);
          }

          if (listing.sellerId === buyerCompanyId) {
            throw new BadRequestError('Cannot include own batches in composite procurement.');
          }

          if (listing.quantity && listing.quantity.gt(0) && requestedQty.gt(listing.quantity)) {
            throw new OverAllocationError(
              `Composite allocation rejected: Requested quantity (${requestedQty}T) exceeds available quantity on listing '${listing.id}' (${listing.quantity}T).`
            );
          }

          preparedAllocations.push({
            batch: listing.batch,
            listing,
            requestedQty,
          });

          totalOrderQty = totalOrderQty.add(requestedQty);
          totalOrderPrice = totalOrderPrice.add(requestedQty.mul(listing.pricePerTon));
        }

        // Create parent Order
        const orderNumber = OrdersService.generateOrderNumber();
        const order = await tx.order.create({
          data: {
            orderNumber,
            orderType: OrderType.MULTI_SUPPLIER_COMPOSITE,
            buyerId: buyerCompanyId,
            totalQuantity: totalOrderQty,
            totalPrice: new Prisma.Decimal(totalOrderPrice.toFixed(2)),
            overallStatus: OrderOverallStatus.CONFIRMED,
            requirementId: input.requirementId || null,
          },
        });

        const createdAllocations: any[] = [];
        const createdShipments: any[] = [];

        // Atomically allocate each contributing batch
        for (const item of preparedAllocations) {
          const { batch, listing, requestedQty } = item;

          const updateResult = await tx.batch.updateMany({
            where: {
              id: batch.id,
              status: { in: [BatchStatus.ACTIVE, BatchStatus.PARTIALLY_ALLOCATED] },
              availableQuantity: { gte: requestedQty },
            },
            data: {
              allocatedQuantity: { increment: requestedQty },
              availableQuantity: { decrement: requestedQty },
            },
          });

          if (updateResult.count === 0) {
            throw new OverAllocationError(
              `Composite allocation failed: Batch '${batch.batchNumber}' has insufficient balance for requested ${requestedQty.toString()}T.`
            );
          }

          // Update listing quantity and status
          const remainingListingQty = listing.quantity.sub(requestedQty);
          await tx.listing.update({
            where: { id: listing.id },
            data: {
              quantity: remainingListingQty.lte(0) ? new Prisma.Decimal('0.0000') : remainingListingQty,
              status: remainingListingQty.lte(0) ? ListingStatus.SOLD : ListingStatus.ACTIVE,
            },
          });

          const updatedBatch = await tx.batch.findUniqueOrThrow({
            where: { id: batch.id },
          });

          if (updatedBatch.availableQuantity.lte(0)) {
            await tx.batch.update({
              where: { id: batch.id },
              data: { status: BatchStatus.DEPLETED },
            });
            await tx.listing.updateMany({
              where: { batchId: batch.id, status: ListingStatus.ACTIVE },
              data: { status: ListingStatus.SOLD, quantity: new Prisma.Decimal('0.0000') },
            });
          } else {
            await tx.batch.update({
              where: { id: batch.id },
              data: { status: BatchStatus.PARTIALLY_ALLOCATED },
            });
          }

          const allocation = await tx.allocation.create({
            data: {
              orderId: order.id,
              batchId: batch.id,
              sellerId: listing.sellerId,
              allocatedQuantity: requestedQty,
              pricePerTon: listing.pricePerTon,
            },
          });

          const shipment = await tx.shipment.create({
            data: {
              orderId: order.id,
              allocationId: allocation.id,
              sellerId: listing.sellerId,
              buyerId: buyerCompanyId,
              individualStatus: ShipmentIndividualStatus.ALLOCATED,
              originLat: batch.locationLat,
              originLng: batch.locationLng,
              destinationLat: new Prisma.Decimal(input.deliveryLat.toFixed(7)),
              destinationLng: new Prisma.Decimal(input.deliveryLng.toFixed(7)),
              trackingNotes: `Part of composite order ${orderNumber}. Allocated from ${batch.batchNumber}.`,
            },
          });

          createdAllocations.push({
            allocationId: allocation.id,
            sellerId: listing.sellerId,
            batchNumber: batch.batchNumber,
            allocatedQuantity: requestedQty,
            pricePerTon: listing.pricePerTon,
          });

          createdShipments.push({
            shipmentId: shipment.id,
            individualStatus: shipment.individualStatus,
            sellerId: listing.sellerId,
          });

          NotificationService.notifyCompanyUsers(
            listing.sellerId,
            'Composite Order Allocation',
            `Order ${orderNumber}: ${requestedQty.toString()}T allocated from Batch ${batch.batchNumber}.`,
            'COMPOSITE_ALLOCATION'
          );
        }

        await AuditService.recordEvent(
          {
            entityType: 'ORDER',
            entityId: order.id,
            action: 'ORDER_CREATED_COMPOSITE',
            actorId: actorUserId,
            metadata: {
              orderNumber,
              totalQuantity: totalOrderQty.toNumber(),
              totalPrice: totalOrderPrice.toNumber(),
              contributingAllocationsCount: input.allocations.length,
            },
          },
          tx
        );

        return {
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            orderType: order.orderType,
            overallStatus: order.overallStatus,
            totalQuantity: order.totalQuantity,
            totalPrice: order.totalPrice,
            createdAt: order.createdAt,
          },
          allocations: createdAllocations,
          shipments: createdShipments,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );
  }

  public static async getOrders(companyId: string, role: string) {
    if (role === 'BUYER') {
      return prisma.order.findMany({
        where: { buyerId: companyId },
        include: {
          allocations: {
            include: {
              batch: { select: { batchNumber: true, purityPercentage: true } },
              seller: { select: { name: true } },
              shipment: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (role === 'SELLER') {
      // Sellers see orders containing their allocations
      return prisma.order.findMany({
        where: {
          allocations: {
            some: { sellerId: companyId },
          },
        },
        include: {
          allocations: {
            where: { sellerId: companyId },
            include: {
              batch: { select: { batchNumber: true, purityPercentage: true } },
              shipment: true,
            },
          },
          buyer: { select: { name: true, address: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return prisma.order.findMany({
      include: {
        allocations: {
          include: { batch: true, seller: true, shipment: true },
        },
        buyer: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  public static async getOrderById(orderId: string, companyId: string, role: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: true,
        allocations: {
          include: {
            batch: true,
            seller: true,
            shipment: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Order '${orderId}' not found.`);
    }

    if (role === 'BUYER' && order.buyerId !== companyId) {
      throw new ForbiddenError('You can only view orders placed by your company.');
    }

    if (role === 'SELLER') {
      const hasSellerAllocation = order.allocations.some((a) => a.sellerId === companyId);
      if (!hasSellerAllocation) {
        throw new ForbiddenError('You do not have allocations in this order.');
      }
    }

    return order;
  }
}
