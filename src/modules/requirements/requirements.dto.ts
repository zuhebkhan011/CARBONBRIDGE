import { z } from 'zod';

export function isPastDeliveryDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;

  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const utcToday = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

  // Extract calendar date YYYY-MM-DD from input string
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    const inputCalendarDate = match[1];
    // A calendar date is in the past only if it is strictly before today in both local and UTC dates
    return inputCalendarDate < localToday && inputCalendarDate < utcToday;
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  return d.getTime() < startOfToday;
}

const isValidDateString = (val: string): boolean => {
  if (!val) return true;
  const parsed = Date.parse(val);
  if (isNaN(parsed)) return false;
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})?)?$/.test(val);
};

export const createRequirementSchema = z.object({
  targetQuantity: z.number().positive('Target quantity must be greater than 0 metric tons'),
  minPurity: z.number().min(50).max(100, 'Minimum purity must be between 50% and 100%'),
  deliveryLat: z.number().min(-90).max(90),
  deliveryLng: z.number().min(-180).max(180),
  deliveryAddress: z.string().min(5, 'Valid delivery address is required'),
  requiredDeliveryDate: z
    .string()
    .refine((val) => isValidDateString(val), {
      message: 'Valid ISO-8601 delivery date is required',
    })
    .refine((val) => !isPastDeliveryDate(val), {
      message: 'Delivery date cannot be in the past.',
    })
    .optional(),
  budgetCeilingPerTon: z.number().positive('Budget ceiling must be positive').optional(),
  intendedApplication: z.string().optional(),
});

export const updateRequirementSchema = createRequirementSchema.partial();

export type CreateRequirementInput = z.infer<typeof createRequirementSchema>;
export type UpdateRequirementInput = z.infer<typeof updateRequirementSchema>;

