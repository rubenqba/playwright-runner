import { z } from 'zod';
import { ExecutionStatusSchema, SourceTypeSchema } from '../types';

export const ExecutionEnqueueInputSchema = z.object({
  recording: z.string().min(2).max(100).describe('Recording ID to be executed'),
  baseUrl: z.url().describe('Base URL for the execution context'),
  type: SourceTypeSchema.default('playwright').describe('Type of the test framework to use'),
  code: z.string().min(10).describe('Optional code to run instead of the recording, must be valid code'),
  browser: z.string().optional().describe('Browser to use for the execution, e.g., chromium, firefox, webkit'),
  executionConfig: z.record(z.string(), z.unknown()).optional().describe('Additional execution configuration options'),
  executedBy: z.string().describe('User who initiated the execution'),
});

export type ExecutionEnqueueInput = z.infer<typeof ExecutionEnqueueInputSchema>;

export const ExecutionEnqueueResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    id: z.string().describe('Unique identifier for the enqueued execution'),
    status: ExecutionStatusSchema.describe('Current status of the execution, e.g., queued'),
  }),
  z.object({
    success: z.literal(false),
    errorMessage: z.string().describe('Error message if the enqueueing failed'),
  }),
]);

export type ExecutionEnqueueResponse = z.infer<typeof ExecutionEnqueueResponseSchema>;
