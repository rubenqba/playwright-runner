// src/config/env.schema.ts
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().min(1000).max(65535).default(3000),
  MONGODB_URI: z.url(),
  MONGODB_USERNAME: z.string().min(3).max(100).optional(),
  MONGODB_PASSWORD: z.string().min(6).max(100).optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  // Add other environment variables as needed
});

export type EnvSchema = z.infer<typeof envSchema>;
