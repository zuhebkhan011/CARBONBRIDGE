import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().default('carbonbridge_jwt_secret_default_key'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().default('carbonbridge_jwt_refresh_secret_default_key'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('*'),
  UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().default(10),
  CRYO_FREIGHT_BASE_RATE_PER_KM: z.coerce.number().default(1.85),
  CRYO_TRANSIT_ESTIMATE_KM_PER_HOUR: z.coerce.number().default(45),
  LOGISTICS_FUEL_PRICE_PER_LITRE: z.coerce.number().default(92.5),
  LOGISTICS_VEHICLE_MILEAGE_KM_PER_LITRE: z.coerce.number().default(3.5),
  LOGISTICS_VEHICLE_OPERATING_COST_PER_KM: z.coerce.number().default(14.0),
  LOGISTICS_DRIVER_COST_PER_HOUR: z.coerce.number().default(250.0),
  LOGISTICS_TOLL_RATE_PER_KM: z.coerce.number().default(2.40),
  LOGISTICS_LOADING_COST_PER_TONNE: z.coerce.number().default(50.0),
  LOGISTICS_UNLOADING_COST_PER_STOP: z.coerce.number().default(1500.0),
  LOGISTICS_DEFAULT_VEHICLE_CAPACITY_TONNES: z.coerce.number().default(200.0),
  LOGISTICS_AVERAGE_SPEED_KM_H: z.coerce.number().default(45.0),
  ML_SERVICE_URL: z.string().default('http://localhost:8000'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
