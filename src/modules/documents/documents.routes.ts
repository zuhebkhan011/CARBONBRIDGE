import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import { DocumentsController } from './documents.controller.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { Role } from '@prisma/client';
import { config } from '../../config/env.js';

const upload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: config.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF documents are accepted for Certificate of Analysis'));
    }
  },
});

export const documentsRouter = Router();

documentsRouter.use(authenticate);

documentsRouter.post(
  '/coa/upload',
  requireRole(Role.SELLER),
  upload.single('file'),
  DocumentsController.uploadCoA
);

documentsRouter.post(
  '/coa/:batchId/upload',
  requireRole(Role.SELLER),
  upload.single('file'),
  DocumentsController.uploadCoA
);

documentsRouter.get('/coa/:batchId', DocumentsController.getCoAMetadata);
documentsRouter.get('/coa/download/:batchId', DocumentsController.downloadCoA);
