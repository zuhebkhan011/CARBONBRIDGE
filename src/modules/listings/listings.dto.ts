import { z } from 'zod';
import { SellingMethod } from '@prisma/client';

export const createListingSchema = z
  .object({
    batchId: z.string().uuid('Valid Batch UUID is required'),
    sellingMethod: z.enum([SellingMethod.FIXED_PRICE, SellingMethod.AUCTION]),
    pricePerTon: z.number().positive('Price per ton must be positive').optional(),
    quantity: z.number().positive('Quantity must be positive').optional(),
  })
  .refine(
    (data) => {
      if (data.sellingMethod === SellingMethod.FIXED_PRICE && !data.pricePerTon) {
        return false;
      }
      return true;
    },
    {
      message: 'Price per ton is required for FIXED_PRICE listings',
      path: ['pricePerTon'],
    }
  );

export const queryListingsSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  minPurity: z.coerce.number().min(0).max(100).optional(),
  maxPrice: z.coerce.number().positive().optional(),
  sellingMethod: z.enum([SellingMethod.FIXED_PRICE, SellingMethod.AUCTION]).optional(),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type QueryListingsInput = z.infer<typeof queryListingsSchema>;
