import { z } from 'zod';

export const createAuctionSchema = z.object({
  listingId: z.string().uuid('Valid listing UUID is required'),
  baseReservePrice: z.number().positive('Base reserve price must be positive'),
  minBidIncrement: z.number().positive().default(50),
  closingTime: z
    .string()
    .datetime('Valid future ISO closing timestamp is required')
    .refine((val) => new Date(val).getTime() > Date.now(), {
      message: 'Auction closing time must be in the future.',
    }),
});

export const placeBidSchema = z.object({
  amountPerTon: z
    .number({
      required_error: 'Bid amount per ton is required',
      invalid_type_error: 'Bid amount per ton must be a valid number',
    })
    .positive('Bid amount per ton must be greater than zero'),
});

export const finalizeAuctionSchema = z.object({
  deliveryLat: z.number().min(-90).max(90),
  deliveryLng: z.number().min(-180).max(180),
  deliveryAddress: z.string().min(5, 'Delivery address is required'),
});

export type CreateAuctionInput = z.infer<typeof createAuctionSchema>;
export type PlaceBidInput = z.infer<typeof placeBidSchema>;
export type FinalizeAuctionInput = z.infer<typeof finalizeAuctionSchema>;
