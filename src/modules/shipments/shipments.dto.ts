import { z } from 'zod';
import { ShipmentIndividualStatus } from '@prisma/client';

export const updateShipmentStatusSchema = z.object({
  status: z.enum([
    ShipmentIndividualStatus.DISPATCH_PENDING,
    ShipmentIndividualStatus.IN_TRANSIT,
    ShipmentIndividualStatus.DELIVERED,
    ShipmentIndividualStatus.RECEIVED,
  ]),
  trackingNotes: z.string().optional(),
});

export type UpdateShipmentStatusInput = z.infer<typeof updateShipmentStatusSchema>;
