import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { ConflictError, NotFoundError, ForbiddenError } from '../../common/errors/AppError.js';
import { CreateBatchInput } from './batches.dto.js';
import { AuditService } from '../audit/audit.service.js';

export class BatchesService {
  public static async createBatch(sellerCompanyId: string, actorUserId: string, input: CreateBatchInput) {
    const existing = await prisma.batch.findUnique({
      where: { batchNumber: input.batchNumber },
    });

    if (existing) {
      throw new ConflictError(`Batch with number '${input.batchNumber}' already exists.`);
    }

    const capturedDec = new Prisma.Decimal(input.capturedQuantity.toFixed(4));
    const allocatedDec = new Prisma.Decimal('0.0000');
    const availableDec = capturedDec; // Available = Captured - 0

    let lat = input.locationLat;
    let lng = input.locationLng;
    if (lat === undefined || lng === undefined) {
      const sellerCompany = await prisma.company.findUnique({
        where: { id: sellerCompanyId },
      });
      lat = lat ?? (sellerCompany ? Number(sellerCompany.latitude) : 20.5937);
      lng = lng ?? (sellerCompany ? Number(sellerCompany.longitude) : 78.9629);
    }

    const batch = await prisma.batch.create({
      data: {
        batchNumber: input.batchNumber,
        sellerId: sellerCompanyId,
        capturedQuantity: capturedDec,
        allocatedQuantity: allocatedDec,
        availableQuantity: availableDec,
        purityPercentage: new Prisma.Decimal(input.purityPercentage.toFixed(2)),
        storagePressureBar: new Prisma.Decimal(input.storagePressureBar.toFixed(2)),
        storageTemperatureC: new Prisma.Decimal(input.storageTemperatureC.toFixed(2)),
        locationLat: new Prisma.Decimal(lat.toFixed(7)),
        locationLng: new Prisma.Decimal(lng.toFixed(7)),
      },
    });

    await AuditService.recordEvent({
      entityType: 'BATCH',
      entityId: batch.id,
      action: 'BATCH_CREATED',
      actorId: actorUserId,
      metadata: {
        batchNumber: batch.batchNumber,
        capturedQuantity: input.capturedQuantity,
        purity: input.purityPercentage,
      },
    });

    return batch;
  }

  public static async getSellerBatches(sellerCompanyId: string) {
    const batches = await prisma.batch.findMany({
      where: { sellerId: sellerCompanyId },
      include: {
        listings: {
          orderBy: { createdAt: 'desc' },
        },
        certificate: {
          include: { extraction: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return batches.map((b) => {
      const activeListing = b.listings.find((l) => l.status === 'ACTIVE') || b.listings[0] || null;
      const totalListedQuantity = b.listings
        .filter((l) => l.status === 'ACTIVE')
        .reduce((sum, l) => sum + l.quantity.toNumber(), 0);

      return {
        ...b,
        listing: activeListing,
        totalListedQuantity,
      };
    });
  }

  public static async getBatchById(batchId: string, companyId: string, role: string) {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        seller: {
          select: { id: true, name: true, address: true, latitude: true, longitude: true },
        },
        listings: {
          orderBy: { createdAt: 'desc' },
        },
        certificate: {
          include: { extraction: true },
        },
        allocations: {
          select: {
            id: true,
            allocatedQuantity: true,
            pricePerTon: true,
            createdAt: true,
            order: {
              select: { id: true, orderNumber: true, overallStatus: true },
            },
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundError(`Batch '${batchId}' not found.`);
    }

    // Object-level authorization for sensitive ledger allocation details
    if (role === 'SELLER' && batch.sellerId !== companyId) {
      throw new ForbiddenError('You do not have permission to view allocations for another company’s batch.');
    }

    const activeListing = batch.listings.find((l) => l.status === 'ACTIVE') || batch.listings[0] || null;
    const totalListedQuantity = batch.listings
      .filter((l) => l.status === 'ACTIVE')
      .reduce((sum, l) => sum + l.quantity.toNumber(), 0);

    return {
      ...batch,
      listing: activeListing,
      totalListedQuantity,
    };
  }
}
