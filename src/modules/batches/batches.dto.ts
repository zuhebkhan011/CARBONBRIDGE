import { z } from 'zod';

export const createBatchSchema = z.object({
  batchNumber: z.string().min(3, 'Batch number is required (e.g., CB-BATCH-2026-001)'),
  capturedQuantity: z.number().positive('Captured quantity must be greater than 0'),
  purityPercentage: z.number().min(50, 'Minimum industrial purity is 50%').max(100, 'Maximum purity is 100%'),
  storagePressureBar: z.number().positive('Storage pressure must be greater than 0 bar'),
  storageTemperatureC: z.number().min(-100).max(100, 'Valid temperature is required'),
  storageCity: z.string().optional(),
  storageState: z.string().optional(),
  locationLat: z.number().min(-90).max(90).optional(),
  locationLng: z.number().min(-180).max(180).optional(),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;

export interface BatchResponse {
  id: string;
  batchNumber: string;
  sellerId: string;
  capturedQuantity: number | string;
  allocatedQuantity: number | string;
  availableQuantity: number | string;
  purityPercentage: number | string;
  storagePressureBar: number | string;
  storageTemperatureC: number | string;
  locationLat: number | string;
  locationLng: number | string;
  status: 'ACTIVE' | 'DEPLETED' | 'CANCELLED';
  createdAt: Date | string;
  updatedAt: Date | string;
}
