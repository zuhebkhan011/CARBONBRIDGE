import {
  Prisma,
  AuctionStatus,
  ListingStatus,
  SellingMethod,
  OrderType,
  OrderOverallStatus,
  ShipmentIndividualStatus,
  BatchStatus,
} from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
  OverAllocationError,
} from '../../common/errors/AppError.js';
import { CreateAuctionInput, PlaceBidInput, FinalizeAuctionInput } from './auctions.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationService } from '../notifications/notification.service.js';

export class AuctionsService {
  public static async createAuction(
    sellerCompanyId: string,
    actorUserId: string,
    input: CreateAuctionInput
  ) {
    const listing = await prisma.listing.findUnique({
      where: { id: input.listingId },
      include: { batch: true, auction: true },
    });

    if (!listing) {
      throw new NotFoundError(`Listing '${input.listingId}' not found.`);
    }

    if (listing.sellerId !== sellerCompanyId) {
      throw new ForbiddenError('You can only launch auctions for listings owned by your company.');
    }

    if (listing.sellingMethod !== SellingMethod.AUCTION) {
      throw new BadRequestError('Listing sellingMethod must be AUCTION.');
    }

    if (listing.auction) {
      throw new ConflictError('An auction has already been configured for this listing.');
    }

    const closingTime = new Date(input.closingTime);
    if (closingTime.getTime() <= Date.now()) {
      throw new BadRequestError('Auction closing time must be in the future.');
    }

    const baseReserve = new Prisma.Decimal(input.baseReservePrice.toFixed(2));
    const minIncrement = new Prisma.Decimal(input.minBidIncrement.toFixed(2));

    const auction = await prisma.auction.create({
      data: {
        listingId: listing.id,
        batchId: listing.batchId,
        sellerId: sellerCompanyId,
        quantity: listing.quantity,
        baseReservePrice: baseReserve,
        currentHighestBid: baseReserve,
        minBidIncrement: minIncrement,
        closingTime,
        status: AuctionStatus.OPEN,
      },
      include: {
        listing: {
          include: { batch: true },
        },
      },
    });

    await AuditService.recordEvent({
      entityType: 'AUCTION',
      entityId: auction.id,
      action: 'AUCTION_CREATED',
      actorId: actorUserId,
      metadata: {
        baseReservePrice: input.baseReservePrice,
        closingTime: input.closingTime,
        batchId: listing.batchId,
      },
    });

    return auction;
  }

  public static async listActiveAuctions(options?: { sellerId?: string; status?: AuctionStatus }) {
    const whereClause: Prisma.AuctionWhereInput = {};
    if (options?.sellerId) {
      whereClause.sellerId = options.sellerId;
    }
    if (options?.status) {
      whereClause.status = options.status;
    } else if (!options?.sellerId) {
      whereClause.status = AuctionStatus.OPEN;
      whereClause.closingTime = { gt: new Date() };
    }

    return prisma.auction.findMany({
      where: whereClause,
      include: {
        listing: {
          include: {
            batch: {
              select: {
                id: true,
                batchNumber: true,
                capturedQuantity: true,
                availableQuantity: true,
                purityPercentage: true,
                locationLat: true,
                locationLng: true,
                certificate: true,
              },
            },
          },
        },
        seller: {
          select: { id: true, name: true, address: true },
        },
        _count: { select: { bids: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  public static async getAuctionById(id: string) {
    const auction = await prisma.auction.findUnique({
      where: { id },
      include: {
        listing: {
          include: {
            batch: {
              include: { certificate: true },
            },
          },
        },
        seller: {
          select: { id: true, name: true, address: true },
        },
        bids: {
          orderBy: { amountPerTon: 'desc' },
          take: 20,
          include: {
            buyer: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    if (!auction) {
      throw new NotFoundError(`Auction '${id}' not found.`);
    }

    const isExpired = new Date() >= auction.closingTime;

    const uniqueBidders = new Set(auction.bids.map((b) => b.buyerId)).size;
    const totalBidsCount = auction.bids.length;

    // Analyze bid frequency in recent window
    const now = Date.now();
    const recentBids = auction.bids.filter(
      (b) => now - new Date(b.createdAt).getTime() <= 15 * 60 * 1000
    );

    let bidTrend: 'Accelerating' | 'Active' | 'Initial Phase' = 'Initial Phase';
    let advisoryMessage = 'Stable bidding pace.';

    if (totalBidsCount >= 3 && recentBids.length >= 2) {
      bidTrend = 'Accelerating';
      advisoryMessage = 'Bid activity is increasing.';
    } else if (totalBidsCount >= 2) {
      bidTrend = 'Active';
      advisoryMessage = 'Competitive bidding active.';
    } else if (totalBidsCount === 1) {
      bidTrend = 'Active';
      advisoryMessage = 'Initial bid placed.';
    } else {
      bidTrend = 'Initial Phase';
      advisoryMessage = 'Auction open for competitive offers.';
    }

    const insights = {
      currentHighestBid: auction.currentHighestBid.toNumber(),
      bidActivityCount: totalBidsCount,
      uniqueBiddersCount: uniqueBidders,
      bidTrend,
      advisoryMessage,
    };

    return {
      ...auction,
      isExpired,
      secondsRemaining: Math.max(
        0,
        Math.floor((auction.closingTime.getTime() - Date.now()) / 1000)
      ),
      insights,
    };
  }

  public static async getAuctionInsights(id: string) {
    const auction = await this.getAuctionById(id);
    return auction.insights;
  }

  /**
   * Concurrency-safe upward bidding transaction
   */
  public static async placeBid(
    auctionId: string,
    buyerUserId: string,
    buyerCompanyId: string,
    input: PlaceBidInput
  ) {
    const bidAmountDec = new Prisma.Decimal(input.amountPerTon.toFixed(2));

    return prisma.$transaction(
      async (tx) => {
        const auction = await tx.auction.findUnique({
          where: { id: auctionId },
          include: {
            listing: true,
            bids: {
              orderBy: { amountPerTon: 'desc' },
              take: 1,
            },
          },
        });

        if (!auction) {
          throw new NotFoundError(`Auction '${auctionId}' not found.`);
        }

        // Validate auction state and server timestamp
        if (auction.status !== AuctionStatus.OPEN) {
          throw new BadRequestError(`Auction is not open. Current status: ${auction.status}`, 'AUCTION_NOT_OPEN');
        }

        if (new Date() >= auction.closingTime) {
          await tx.auction.update({
            where: { id: auction.id },
            data: { status: AuctionStatus.FINALIZING },
          });
          throw new BadRequestError('Auction duration has ended. No further bids are accepted.', 'AUCTION_EXPIRED');
        }

        // Sellers cannot bid on their own auction
        if (auction.sellerId === buyerCompanyId) {
          throw new BadRequestError('Sellers cannot place bids on their own auctions.', 'OWN_AUCTION_BID_FORBIDDEN');
        }

        const previousHighestBid = auction.bids[0];
        const minRequiredBid = previousHighestBid
          ? previousHighestBid.amountPerTon.add(auction.minBidIncrement)
          : auction.baseReservePrice;

        if (bidAmountDec.lt(minRequiredBid)) {
          throw new BadRequestError(
            `Bid must be at least ₹${minRequiredBid.toString()}/T. Submitted: ₹${bidAmountDec.toString()}/T.`,
            'BID_BELOW_MINIMUM',
            { minRequiredBid: minRequiredBid.toNumber(), submittedBid: bidAmountDec.toNumber() }
          );
        }

        // Concurrency-safe atomic update of auction current highest bid with OCC
        const updateResult = await tx.auction.updateMany({
          where: {
            id: auctionId,
            status: AuctionStatus.OPEN,
            closingTime: { gt: new Date() },
            updatedAt: auction.updatedAt,
            ...(previousHighestBid
              ? { currentHighestBid: { lt: bidAmountDec } }
              : { currentHighestBid: { lte: bidAmountDec } }),
          },
          data: {
            currentHighestBid: bidAmountDec,
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictError(
            'Another buyer placed a higher bid or the auction closed. Please refresh the bidding console.',
            'BID_CONCURRENCY_CONFLICT'
          );
        }

        // Record the bid
        const bid = await tx.bid.create({
          data: {
            auctionId,
            buyerId: buyerUserId,
            amountPerTon: bidAmountDec,
          },
          include: {
            buyer: { select: { id: true, fullName: true } },
          },
        });

        await AuditService.recordEvent(
          {
            entityType: 'BID',
            entityId: bid.id,
            action: 'BID_PLACED',
            actorId: buyerUserId,
            metadata: {
              auctionId,
              amountPerTon: input.amountPerTon,
            },
          },
          tx
        );

        // Notify previous highest bidder of outbid
        if (previousHighestBid && previousHighestBid.buyerId !== buyerUserId) {
          NotificationService.notify({
            userId: previousHighestBid.buyerId,
            title: 'Outbid Alert',
            message: `You were outbid on Auction for Batch ${auction.batchId}. New highest bid: ₹${bidAmountDec.toString()}/T.`,
            type: 'OUTBID_ALERT',
          });
        }

        // Notify seller of new bid
        NotificationService.notifyCompanyUsers(
          auction.sellerId,
          'New Highest Bid Received',
          `A new bid of ₹${bidAmountDec.toString()}/T was placed on your CO2 auction.`,
          'NEW_BID'
        );

        return bid;
      }
    );
  }

  /**
   * Finalizes auction:
   * - If bids exist: allocates batch atomically to the winning bidder and creates order.
   * - If NO bids exist: marks auction EXPIRED with ZERO inventory allocated.
   */
  public static async finalizeAuction(
    auctionId: string,
    sellerCompanyId: string,
    actorUserId: string,
    input: FinalizeAuctionInput
  ) {
    return prisma.$transaction(
      async (tx) => {
        const auction = await tx.auction.findUnique({
          where: { id: auctionId },
          include: {
            listing: {
              include: { batch: true },
            },
            bids: {
              orderBy: { amountPerTon: 'desc' },
              take: 1,
              include: {
                buyer: { include: { company: true } },
              },
            },
          },
        });

        if (!auction) {
          throw new NotFoundError(`Auction '${auctionId}' not found.`);
        }

        if (auction.sellerId !== sellerCompanyId) {
          throw new ForbiddenError('You can only finalize auctions for your own listings.');
        }

        if (auction.status === AuctionStatus.SETTLED) {
          throw new BadRequestError('This auction has already been finalized and settled.');
        }

        const winningBid = auction.bids[0];

        // Scenario A: No bids submitted -> Auction expires with ZERO inventory deducted
        if (!winningBid) {
          await tx.auction.update({
            where: { id: auction.id },
            data: { status: AuctionStatus.EXPIRED },
          });

          await tx.listing.update({
            where: { id: auction.listingId },
            data: { status: ListingStatus.ACTIVE }, // Retain batch in inventory
          });

          await AuditService.recordEvent(
            {
              entityType: 'AUCTION',
              entityId: auction.id,
              action: 'AUCTION_EXPIRED_NO_BIDS',
              actorId: actorUserId,
            },
            tx
          );

          return {
            auctionId: auction.id,
            status: AuctionStatus.EXPIRED,
            message: 'Auction closed with zero bids. No batch inventory was allocated.',
            order: null,
          };
        }

        // Scenario B: Valid winning bid -> Atomic batch allocation and Order creation
        const batch = auction.listing.batch;
        const targetQty = auction.quantity ?? auction.listing.quantity;
        const allocatedQty =
          targetQty && targetQty.gt(0) && targetQty.lte(batch.availableQuantity)
            ? targetQty
            : batch.availableQuantity;

        if (allocatedQty.lte(0)) {
          throw new OverAllocationError('Cannot allocate a batch with zero available quantity.');
        }

        // Deduct inventory atomically
        const updateResult = await tx.batch.updateMany({
          where: {
            id: batch.id,
            status: { in: [BatchStatus.ACTIVE, BatchStatus.PARTIALLY_ALLOCATED] },
            availableQuantity: { gte: allocatedQty },
          },
          data: {
            allocatedQuantity: { increment: allocatedQty },
            availableQuantity: { decrement: allocatedQty },
          },
        });

        if (updateResult.count === 0) {
          throw new OverAllocationError(
            `Finalization failed: Batch '${batch.batchNumber}' could not be allocated.`
          );
        }

        const updatedBatch = await tx.batch.findUniqueOrThrow({
          where: { id: batch.id },
        });

        if (updatedBatch.availableQuantity.lte(0)) {
          await tx.batch.update({
            where: { id: batch.id },
            data: { status: BatchStatus.DEPLETED },
          });
        } else {
          await tx.batch.update({
            where: { id: batch.id },
            data: { status: BatchStatus.PARTIALLY_ALLOCATED },
          });
        }

        await tx.listing.update({
          where: { id: auction.listingId },
          data: { status: ListingStatus.SOLD, quantity: new Prisma.Decimal('0.0000') },
        });

        const buyerCompany = winningBid.buyer.company;
        const orderNumber = `CB-ORD-AUC-${Date.now().toString().slice(-6)}`;
        const totalPrice = allocatedQty.mul(winningBid.amountPerTon);

        const order = await tx.order.create({
          data: {
            orderNumber,
            orderType: OrderType.SINGLE_SELLER,
            buyerId: buyerCompany.id,
            totalQuantity: allocatedQty,
            totalPrice: new Prisma.Decimal(totalPrice.toFixed(2)),
            overallStatus: OrderOverallStatus.CONFIRMED,
          },
        });

        const allocation = await tx.allocation.create({
          data: {
            orderId: order.id,
            batchId: batch.id,
            sellerId: auction.sellerId,
            allocatedQuantity: allocatedQty,
            pricePerTon: winningBid.amountPerTon,
          },
        });

        const shipment = await tx.shipment.create({
          data: {
            orderId: order.id,
            allocationId: allocation.id,
            sellerId: auction.sellerId,
            buyerId: buyerCompany.id,
            individualStatus: ShipmentIndividualStatus.ALLOCATED,
            originLat: batch.locationLat,
            originLng: batch.locationLng,
            destinationLat: new Prisma.Decimal(input.deliveryLat.toFixed(7)),
            destinationLng: new Prisma.Decimal(input.deliveryLng.toFixed(7)),
            trackingNotes: `Won via Auction. Base reserve: ₹${auction.baseReservePrice.toString()}, Winning bid: ₹${winningBid.amountPerTon.toString()}/T.`,
          },
        });

        await tx.auction.update({
          where: { id: auction.id },
          data: {
            status: AuctionStatus.SETTLED,
            winningBidId: winningBid.id,
          },
        });

        await tx.listing.update({
          where: { id: auction.listingId },
          data: { status: ListingStatus.SOLD },
        });

        await AuditService.recordEvent(
          {
            entityType: 'AUCTION',
            entityId: auction.id,
            action: 'AUCTION_FINALIZED_SETTLED',
            actorId: actorUserId,
            metadata: {
              winningBidId: winningBid.id,
              winningBuyerId: winningBid.buyerId,
              orderId: order.id,
              allocatedQuantity: allocatedQty.toNumber(),
              winningAmountPerTon: winningBid.amountPerTon.toNumber(),
            },
          },
          tx
        );

        NotificationService.notify({
          userId: winningBid.buyerId,
          title: 'Auction Won!',
          message: `Congratulations! Your bid of ₹${winningBid.amountPerTon.toString()}/T won Batch ${batch.batchNumber}. Order ${orderNumber} created.`,
          type: 'AUCTION_WON',
        });

        return {
          auctionId: auction.id,
          status: AuctionStatus.SETTLED,
          winningBid: {
            bidId: winningBid.id,
            amountPerTon: winningBid.amountPerTon,
            buyerName: winningBid.buyer.fullName,
            companyName: buyerCompany.name,
          },
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            totalQuantity: order.totalQuantity,
            totalPrice: order.totalPrice,
          },
          shipment: {
            id: shipment.id,
            status: shipment.individualStatus,
          },
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );
  }
}
