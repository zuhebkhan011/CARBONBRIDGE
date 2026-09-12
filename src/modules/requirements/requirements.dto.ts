import { z } from 'zod';

export const createRequirementSchema = z.object({
  targetQuantity: z.number().positive('Target quantity must be greater than 0 metric tons'),
  minPurity: z.number().min(50).max(100, 'Minimum purity must be between 50% and 100%'),
  deliveryLat: z.number().min(-90).max(90),
  deliveryLng: z.number().min(-180).max(180),
  deliveryAddress: z.string().min(5, 'Valid delivery address is required'),
  requiredDeliveryDate: z.string().datetime('Valid ISO-8601 delivery date is required').optional(),
  budgetCeilingPerTon: z.number().positive('Budget ceiling must be positive').optional(),
  intendedApplication: z.string().optional(),
});

export type CreateRequirementInput = z.infer<typeof createRequirementSchema>;
