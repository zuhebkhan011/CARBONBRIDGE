/**
 * TypeScript definitions matching the actual CarbonBridge backend API responses for Batches.
 * Backend Prisma schema: `purityPercentage Decimal @db.Decimal(5, 2)`
 */

export type BatchStatus = 'ACTIVE' | 'DEPLETED' | 'CANCELLED';

export interface BatchCompany {
  id: string;
  name: string;
  address: string;
  latitude: number | string;
  longitude: number | string;
}

export interface BatchCertificate {
  id: string;
  fileName: string;
  fileUrl: string;
  status: 'PENDING_ANALYSIS' | 'CERTIFICATE_UPLOADED' | 'VERIFIED' | 'REJECTED';
  uploadedAt: string;
}

export interface BatchListingSummary {
  id: string;
  sellingMethod: 'FIXED_PRICE' | 'AUCTION';
  pricePerTon?: number | string | null;
  status: 'ACTIVE' | 'FILLED' | 'CANCELLED';
}

/**
 * Raw Batch response directly returned from backend Express/Prisma JSON serialization.
 * Note: Decimals are serialized as strings or numbers.
 */
export interface BackendBatchResponse {
  id: string;
  batchNumber: string;
  sellerId: string;
  capturedQuantity: string | number;
  allocatedQuantity: string | number;
  availableQuantity: string | number;
  purityPercentage: string | number;
  storagePressureBar: string | number;
  storageTemperatureC: string | number;
  locationLat: string | number;
  locationLng: string | number;
  status: BatchStatus;
  createdAt: string;
  updatedAt: string;
  seller?: BatchCompany;
  listing?: BatchListingSummary | null;
  certificate?: BatchCertificate | null;
}

/**
 * Normalized Batch model used throughout frontend components.
 * Both `purityPercentage` and `purity` are available as finite numbers (or null if missing).
 */
export interface NormalizedBatch {
  id: string;
  batchNumber: string;
  sellerId: string;
  capturedQuantity: number;
  allocatedQuantity: number;
  availableQuantity: number;
  purityPercentage: number | null;
  purity: number | null;
  storagePressureBar?: number | null;
  storageTemperatureC?: number | null;
  locationLat?: number | null;
  locationLng?: number | null;
  status: BatchStatus;
  createdAt: string;
  updatedAt: string;
  storageLocationCity: string;
  storageLocationState: string;
  captureMethod?: string;
  seller?: BatchCompany;
  listing?: BatchListingSummary | null;
  certificate?: BatchCertificate | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}
