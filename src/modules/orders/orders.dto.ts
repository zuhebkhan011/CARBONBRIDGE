import { z } from 'zod';

export const procureFixedPriceSchema = z.object({
  listingId: z.string().uuid('Valid listing UUID is required'),
  quantity: z.number().positive('Procurement quantity must be positive'),
  deliveryLat: z.number().min(-90).max(90),
  deliveryLng: z.number().min(-180).max(180),
  deliveryAddress: z.string().min(5, 'Delivery address is required'),
  requirementId: z.string().uuid().optional(),
});

export const procureCompositeSchema = z.object({
  requirementId: z.string().uuid().optional(),
  deliveryLat: z.number().min(-90).max(90),
  deliveryLng: z.number().min(-180).max(180),
  deliveryAddress: z.string().min(5, 'Delivery address is required'),
  allocations: z
    .array(
      z.object({
        batchId: z.string().uuid('Batch UUID is required'),
        quantity: z.number().positive('Allocated quantity must be positive'),
        listingId: z.string().uuid('Listing UUID is required'),
      })
    )
    .min(2, 'Composite orders require at least 2 contributing allocations'),
});

export type ProcureFixedPriceInput = z.infer<typeof procureFixedPriceSchema>;
export type ProcureCompositeInput = z.infer<typeof procureCompositeSchema>;
