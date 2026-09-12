import fs from 'fs';
import path from 'path';
import { prisma } from '../../database/prisma.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../../common/errors/AppError.js';
import { CoAStatus, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';

export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'coas');

// Ensure storage directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export class DocumentsService {
  /**
   * Validates PDF magic header bytes (%PDF-) to prevent malicious file extension spoofing
   */
  public static validatePdfHeader(filePath: string): boolean {
    const buffer = Buffer.alloc(5);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 5, 0);
    fs.closeSync(fd);
    return buffer.toString('utf-8') === '%PDF-';
  }

  public static async uploadCoA(
    batchId: string,
    sellerCompanyId: string,
    actorUserId: string,
    file: Express.Multer.File
  ) {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: { certificate: true },
    });

    if (!batch) {
      // Remove temporary uploaded file
      fs.unlinkSync(file.path);
      throw new NotFoundError(`Batch '${batchId}' not found.`);
    }

    if (batch.sellerId !== sellerCompanyId) {
      fs.unlinkSync(file.path);
      throw new ForbiddenError('You can only upload Certificate of Analysis for your own batches.');
    }

    // Inspect file header for real PDF signature
    if (!this.validatePdfHeader(file.path)) {
      fs.unlinkSync(file.path);
      throw new BadRequestError('Invalid file: Uploaded document does not contain a valid PDF signature.');
    }

    // Sanitize filename and move to safe location
    const sanitizedFileName = `coa_${batch.batchNumber}_${Date.now()}.pdf`;
    const targetPath = path.join(UPLOADS_DIR, sanitizedFileName);
    fs.renameSync(file.path, targetPath);

    const relativeUrl = `/api/v1/documents/coa/download/${batch.id}`;

    const coa = await prisma.certificateOfAnalysis.upsert({
      where: { batchId: batch.id },
      create: {
        batchId: batch.id,
        fileName: file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'),
        fileUrl: relativeUrl,
        fileSize: file.size,
        mimeType: 'application/pdf',
        status: CoAStatus.CERTIFICATE_UPLOADED,
      },
      update: {
        fileName: file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'),
        fileUrl: relativeUrl,
        fileSize: file.size,
        mimeType: 'application/pdf',
        status: CoAStatus.CERTIFICATE_UPLOADED,
        uploadedAt: new Date(),
      },
    });

    // Invalidate prior extraction if document is replaced
    await prisma.coaExtraction.deleteMany({ where: { batchId: batch.id } });

    await AuditService.recordEvent({
      entityType: 'CERTIFICATE_OF_ANALYSIS',
      entityId: coa.id,
      action: 'COA_UPLOADED',
      actorId: actorUserId,
      metadata: {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        fileSize: file.size,
        status: coa.status,
      },
    });

    return coa;
  }

  public static async getCoAMetadata(
    batchId: string,
    user?: { role: Role; companyId: string }
  ) {
    const coa = await prisma.certificateOfAnalysis.findUnique({
      where: { batchId },
      include: {
        batch: {
          include: { listings: true },
        },
      },
    });

    if (!coa) {
      throw new NotFoundError(`No Certificate of Analysis found for Batch '${batchId}'.`);
    }

    if (user && user.role !== Role.ADMIN) {
      if (user.role === Role.SELLER && coa.batch.sellerId !== user.companyId) {
        throw new ForbiddenError('You do not have permission to view certificate metadata for another seller’s batch.');
      }
    }

    return coa;
  }

  public static async getCoAFilePath(
    batchId: string,
    user?: { role: Role; companyId: string }
  ): Promise<{ filePath: string; originalName: string }> {
    const coa = await prisma.certificateOfAnalysis.findUnique({
      where: { batchId },
      include: {
        batch: {
          include: { listings: true },
        },
      },
    });

    if (!coa) {
      throw new NotFoundError(`No Certificate of Analysis found for Batch '${batchId}'.`);
    }

    // Access control: enforce seller ownership and buyer listing visibility
    if (user && user.role !== Role.ADMIN) {
      if (user.role === Role.SELLER && coa.batch.sellerId !== user.companyId) {
        throw new ForbiddenError('You do not have permission to view or download certificates for another seller’s batch.');
      }
      if (user.role === Role.BUYER) {
        const isListed = coa.batch.listings.some(
          (l) => l.status === 'ACTIVE' || l.status === 'PENDING_DEAL' || l.status === 'SOLD'
        );
        if (!isListed && coa.batch.sellerId !== user.companyId) {
          throw new ForbiddenError('You do not have permission to access certificates for unlisted batches.');
        }
      }
    }

    // Locate matching file in uploads dir
    const files = fs.readdirSync(UPLOADS_DIR);
    const matched = files.find((f) => f.startsWith(`coa_${coa.batch.batchNumber}_`));

    if (!matched) {
      throw new NotFoundError('Underlying Certificate of Analysis file was not found on disk storage.');
    }

    return {
      filePath: path.join(UPLOADS_DIR, matched),
      originalName: coa.fileName,
    };
  }
}
