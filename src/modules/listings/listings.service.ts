import { Prisma, ListingStatus } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from '../../common/errors/AppError.js';
import { CreateListingInput, QueryListingsInput } from './listings.dto.js';
import { AuditService } from '../audit/audit.service.js';

export class ListingsService {
  public static async createListing(
    sellerCompanyId: string,
    actorUserId: string,
    input: CreateListingInput
  ) {
    const batch = await prisma.batch.findUnique({
      where: { id: input.batchId },
      include: { listings: true },
    });

    if (!batch) {
      throw new NotFoundError(`Batch '${input.batchId}' not found.`);
    }

    if (batch.sellerId !== sellerCompanyId) {
      throw new ForbiddenError('You can only create listings for batches owned by your company.');
    }

    const availableBatchQty = batch.availableQuantity.toNumber();
    if (availableBatchQty <= 0) {
      throw new BadRequestError('Cannot list a batch with zero available quantity.');
    }

    const listingQty = input.quantity !== undefined ? input.quantity : availableBatchQty;

    if (listingQty <= 0) {
      throw new BadRequestError('Listing quantity must be positive.');
    }

    if (listingQty > availableBatchQty) {
      throw new BadRequestError(
        `Listing quantity (${listingQty}T) cannot exceed available batch quantity (${availableBatchQty}T).`
      );
    }

    const priceDec = input.pricePerTon ? new Prisma.Decimal(input.pricePerTon.toFixed(2)) : null;

    // IMPORTANT: Creating a listing does NOT modify batch.availableQuantity or batch.allocatedQuantity!
    const listing = await prisma.listing.create({
      data: {
        batchId: batch.id,
        sellerId: sellerCompanyId,
        sellingMethod: input.sellingMethod,
        quantity: new Prisma.Decimal(listingQty.toFixed(4)),
        pricePerTon: priceDec,
        status: ListingStatus.ACTIVE,
      },
      include: {
        batch: {
          include: {
            certificate: {
              include: { extraction: true },
            },
          },
        },
        seller: {
          select: { id: true, name: true, address: true, latitude: true, longitude: true },
        },
      },
    });

    await AuditService.recordEvent({
      entityType: 'LISTING',
      entityId: listing.id,
      action: 'LISTING_CREATED',
      actorId: actorUserId,
      metadata: {
        sellingMethod: listing.sellingMethod,
        pricePerTon: input.pricePerTon,
        quantity: listingQty,
        batchId: batch.id,
      },
    });

    return listing;
  }

  public static async browseListings(query: QueryListingsInput) {
    const { cursor, limit, minPurity, maxPrice, sellingMethod } = query;

    const whereClause: Prisma.ListingWhereInput = {
      status: ListingStatus.ACTIVE,
      quantity: { gt: new Prisma.Decimal(0) },
      batch: {
        availableQuantity: { gt: new Prisma.Decimal(0) },
        ...(minPurity !== undefined && {
          purityPercentage: { gte: new Prisma.Decimal(minPurity.toFixed(2)) },
        }),
      },
      ...(sellingMethod && { sellingMethod }),
      ...(maxPrice !== undefined && {
        pricePerTon: { lte: new Prisma.Decimal(maxPrice.toFixed(2)) },
      }),
    };

    const listings = await prisma.listing.findMany({
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      where: whereClause,
      include: {
        batch: {
          select: {
            id: true,
            batchNumber: true,
            capturedQuantity: true,
            allocatedQuantity: true,
            availableQuantity: true,
            purityPercentage: true,
            storagePressureBar: true,
            locationLat: true,
            locationLng: true,
            certificate: {
              select: {
                id: true,
                fileName: true,
                status: true,
                uploadedAt: true,
              },
            },
          },
        },
        seller: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        auction: {
          select: {
            id: true,
            baseReservePrice: true,
            currentHighestBid: true,
            closingTime: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let nextCursor: string | null = null;
    if (listings.length > limit) {
      const nextItem = listings.pop();
      nextCursor = nextItem!.id;
    }

    // Format with friendly CoA badge status
    const formatted = listings.map((l) => ({
      id: l.id,
      sellingMethod: l.sellingMethod,
      quantity: l.quantity,
      listedQuantity: l.quantity,
      pricePerTon: l.pricePerTon,
      status: l.status,
      createdAt: l.createdAt,
      seller: l.seller,
      batch: {
        id: l.batch.id,
        batchNumber: l.batch.batchNumber,
        capturedQuantity: l.batch.capturedQuantity,
        allocatedQuantity: l.batch.allocatedQuantity,
        availableQuantity: l.batch.availableQuantity,
        purityPercentage: l.batch.purityPercentage,
        storagePressureBar: l.batch.storagePressureBar,
        locationLat: l.batch.locationLat,
        locationLng: l.batch.locationLng,
        coaBadge: l.batch.certificate ? l.batch.certificate.status : 'NO_CERTIFICATE',
        certificate: l.batch.certificate,
      },
      auction: l.auction,
    }));

    return {
      items: formatted,
      nextCursor,
      hasMore: !!nextCursor,
    };
  }

  public static async getListingById(id: string) {
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        batch: {
          include: {
            certificate: {
              include: { extraction: true },
            },
          },
        },
        seller: {
          select: { id: true, name: true, address: true, latitude: true, longitude: true },
        },
        auction: {
          include: {
            bids: {
              orderBy: { amountPerTon: 'desc' },
              take: 20,
              include: {
                buyer: {
                  select: {
                    id: true,
                    fullName: true,
                    company: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!listing) {
      throw new NotFoundError(`Listing '${id}' not found.`);
    }

    return {
      ...listing,
      coaBadge: listing.batch.certificate ? listing.batch.certificate.status : 'NO_CERTIFICATE',
    };
  }

  public static async deactivateListing(
    id: string,
    sellerCompanyId: string,
    actorUserId: string
  ) {
    const listing = await prisma.listing.findUnique({
      where: { id },
    });

    if (!listing) {
      throw new NotFoundError(`Listing '${id}' not found.`);
    }

    if (listing.sellerId !== sellerCompanyId) {
      throw new ForbiddenError('You can only deactivate listings owned by your company.');
    }

    const updated = await prisma.listing.update({
      where: { id },
      data: { status: ListingStatus.DEACTIVATED },
    });

    await AuditService.recordEvent({
      entityType: 'LISTING',
      entityId: id,
      action: 'LISTING_DEACTIVATED',
      actorId: actorUserId,
    });

    return updated;
  }
}
