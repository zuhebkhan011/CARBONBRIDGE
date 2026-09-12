import { z } from 'zod';
import { Role, CompanyType } from '@prisma/client';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  role: z.enum([Role.SELLER, Role.BUYER]),
  company: z.object({
    name: z.string().min(2, 'Company name is required'),
    companyType: z.enum([CompanyType.EMITTER, CompanyType.OFFTAKER]),
    registrationNumber: z.string().min(3, 'Registration number is required'),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    address: z.string().min(5, 'Valid address is required'),
  }),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name cannot be empty').max(100, 'Full name cannot exceed 100 characters').optional(),
  companyName: z.string().trim().min(1, 'Company name cannot be empty').max(100, 'Company name cannot exceed 100 characters').optional(),
  companyLocation: z.string().trim().min(1, 'Company location cannot be empty').max(255, 'Company location cannot exceed 255 characters').optional(),
}).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
