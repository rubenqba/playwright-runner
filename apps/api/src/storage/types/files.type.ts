import { z } from 'zod';

export const FileTypeSchema = z.enum(['video', 'screenshot', 'log', 'report']);
export type FileType = z.infer<typeof FileTypeSchema>;

export const ExecutionFileSchema = z.object({
  id: z.string(),
  execution: z.string().describe('Execution ID'),
  detail: z.string().optional().describe('Associated TestDetail ID, if applicable'),
  fileName: z.string().describe('Name of the file'),
  filePath: z.string().describe('Path where the file is stored'),
  fileType: FileTypeSchema.describe('Type of the file'),
  mimeType: z.string().describe('MIME type of the file'),
  fileSize: z.number().int().min(0).describe('Size of the file in bytes'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('Additional metadata about the file'),
  expiresAt: z.coerce.date().optional().describe('Timestamp when the file is considered expired'),
  created: z.coerce.date().describe('Timestamp when the file was created'),
});

export type ExecutionFile = z.infer<typeof ExecutionFileSchema>;
