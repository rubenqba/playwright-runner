import { StorageConfig } from '@/storage/types/storage-config.type';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  // Provider selection
  STORAGE_PROVIDER: z.enum(['filesystem', 'minio']).default('filesystem'),

  // Filesystem config (opcionales)
  FILESYSTEM_BASE_PATH: z.string().optional(),
  FILESYSTEM_BASE_URL: z.string().optional(),
  FILESYSTEM_SECRET_KEY: z.string().optional(),

  // Minio config (opcionales)
  MINIO_ENDPOINT: z.hostname().default('localhost'),
  MINIO_PORT: z.coerce.number().optional(),
  MINIO_USESSL: z.stringbool().default(false),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  MINIO_BUCKET: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9.-]+$/, 'Invalid bucket name')
    .optional(),
});

const storageConfigSchemaDetailed = envSchema
  .superRefine((data, ctx) => {
    if (data.STORAGE_PROVIDER === 'filesystem') {
      // Validar cada campo de filesystem individualmente
      if (!data.FILESYSTEM_BASE_PATH) {
        ctx.addIssue({
          code: 'custom',
          path: ['FILESYSTEM_BASE_PATH'],
          message: 'FILESYSTEM_BASE_PATH is required when provider is filesystem',
        });
      }

      if (!data.FILESYSTEM_BASE_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['FILESYSTEM_BASE_URL'],
          message: 'FILESYSTEM_BASE_URL is required when provider is filesystem',
        });
      } else if (!z.url().safeParse(data.FILESYSTEM_BASE_URL).success) {
        ctx.addIssue({
          code: 'custom',
          path: ['FILESYSTEM_BASE_URL'],
          message: 'FILESYSTEM_BASE_URL must be a valid URL',
        });
      }

      if (!data.FILESYSTEM_SECRET_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['FILESYSTEM_SECRET_KEY'],
          message: 'FILESYSTEM_SECRET_KEY is required when provider is filesystem',
        });
      }
    }

    if (data.STORAGE_PROVIDER === 'minio') {
      // Validar cada campo de minio individualmente
      if (!data.MINIO_ENDPOINT) {
        ctx.addIssue({
          code: 'custom',
          path: ['MINIO_ENDPOINT'],
          message: 'MINIO_ENDPOINT is required when provider is minio',
        });
      }

      if (!data.MINIO_BUCKET) {
        ctx.addIssue({
          code: 'custom',
          path: ['MINIO_BUCKET'],
          message: 'MINIO_BUCKET is required when provider is minio',
        });
      }

      if (data.MINIO_PORT !== undefined && (data.MINIO_PORT < 1 || data.MINIO_PORT > 65535)) {
        ctx.addIssue({
          code: 'invalid_value',
          values: [data.MINIO_PORT],
          path: ['MINIO_PORT'],
          message: 'MINIO_PORT must be between 1 and 65535 when provider is minio',
        });
      }
    }
  })
  .transform(
    (data): StorageConfig => ({
      provider: data.STORAGE_PROVIDER,
      filesystem:
        data.STORAGE_PROVIDER === 'filesystem'
          ? {
              basePath: data.FILESYSTEM_BASE_PATH!,
              baseUrl: data.FILESYSTEM_BASE_URL!,
              secretKey: data.FILESYSTEM_SECRET_KEY!,
            }
          : undefined,
      minio:
        data.STORAGE_PROVIDER === 'minio'
          ? {
              endPoint: data.MINIO_ENDPOINT,
              port: data.MINIO_PORT,
              useSSL: data.MINIO_USESSL,
              accessKey: data.MINIO_ACCESS_KEY,
              secretKey: data.MINIO_SECRET_KEY,
              bucket: data.MINIO_BUCKET!,
              region: 'us-east-1', // Default region
            }
          : undefined,
    }),
  );

export function validateStorageConfig(env: Record<string, string | undefined>) {
  return storageConfigSchemaDetailed.parse(env);
}

export default registerAs('storage', () => {
  const data = validateStorageConfig(process.env);
  return data;
});
