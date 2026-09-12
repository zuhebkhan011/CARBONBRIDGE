/**
 * Shipment data contracts matching the real CarbonBridge backend Prisma API response.
 */

export type ShipmentIndividualStatus =
  | 'ALLOCATED'
  | 'DISPATCH_PENDING'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'RECEIVED';

export interface CompanySummary {
  id: string;
  name: string;
  address: string;
}

export interface BatchSummary {
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
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AllocationSummary {
  id: string;
  orderId: string;
  batchId: string;
  sellerId: string;
  allocatedQuantity: string | number;
  pricePerTon: string | number;
  createdAt: string;
  batch?: BatchSummary;
}

export interface Shipment {
  id: string;
  orderId: string;
  allocationId: string;
  sellerId: string;
  buyerId: string;
  individualStatus: ShipmentIndividualStatus;
  /** Frontend fallback alias for backwards compatibility */
  status?: ShipmentIndividualStatus;
  originLat: string | number;
  originLng: string | number;
  destinationLat: string | number;
  destinationLng: string | number;
  trackingNotes: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  allocation?: AllocationSummary;
  buyer?: CompanySummary;
  seller?: CompanySummary;
}
