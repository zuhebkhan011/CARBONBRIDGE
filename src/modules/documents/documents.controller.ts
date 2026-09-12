import { Request, Response, NextFunction } from 'express';
import { DocumentsService } from './documents.service.js';
import { BadRequestError } from '../../common/errors/AppError.js';

export class DocumentsController {
  public static async uploadCoA(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new BadRequestError('No PDF file uploaded. Please attach a file under key "file".');
      }

      const batchId = req.params.batchId || req.body.batchId;
      if (!batchId) {
        throw new BadRequestError('batchId is required.');
      }

      const result = await DocumentsService.uploadCoA(
        batchId,
        req.user!.companyId,
        req.user!.userId,
        req.file
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getCoAMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await DocumentsService.getCoAMetadata(req.params.batchId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async downloadCoA(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { filePath, originalName } = await DocumentsService.getCoAFilePath(req.params.batchId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);
      res.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  }
}
