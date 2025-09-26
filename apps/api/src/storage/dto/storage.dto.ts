// src/storage/dto/storage.dto.ts
import { z } from 'zod';
import { FileTypeSchema } from '@/storage/types';

export const UploadFileSchema = z.object({
  execution: z.string(),
  detail: z.string().optional(),
  file: z.instanceof(Buffer).or(
    z.object({
      buffer: z.instanceof(Buffer),
      originalName: z.string(),
      mimetype: z.string(),
      size: z.number(),
    }),
  ),
  fileType: FileTypeSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UploadFileDto = z.infer<typeof UploadFileSchema>;

export const StorageResultSchema = z.object({
  key: z.string(),
  url: z.string().optional(),
  size: z.number(),
  etag: z.string().optional(),
  contentType: z.string().optional(),
});

export type StorageResult = z.infer<typeof StorageResultSchema>;
