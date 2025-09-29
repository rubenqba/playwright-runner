import { DateTimeSchema } from '@/common/schemas';
import { SourceTypeSchema } from '@cmx-replayer/shared';
import { z } from 'zod';

export const ExecutionStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const ExecutionSourceSchema = z.object({
  type: SourceTypeSchema.describe('Type of the test source, e.g., cypress or playwright'),
  code: z.string().describe('The actual test code as a string'),
});
export type ExecutionSource = z.infer<typeof ExecutionSourceSchema>;

export const BrowserTypeSchema = z.enum(['chromium', 'firefox', 'webkit']);
export type BrowserType = z.infer<typeof BrowserTypeSchema>;

// Esquema Zod para TestExecution
export const ExecutionSchema = z.object({
  id: z.string().describe('Unique identifier for the execution'),
  recording: z.string().describe('Recording ID associated with this execution'),
  status: ExecutionStatusSchema.default('queued').describe('Current status of the execution'),
  browser: BrowserTypeSchema.default('chromium').describe('Browser used for the execution'),
  baseUrl: z.url().optional().describe('Initial URL for the test execution'),
  executionConfig: z.record(z.string(), z.unknown()).optional().describe('Configuration for the test execution'),
  executedBy: z.string().nullish().describe('User ID who initiated the execution'),
  errorMessage: z.string().optional().describe('Error message if the execution failed'),

  code: z.string().describe('The actual test code as a string'),

  created: DateTimeSchema.describe('Timestamp when the execution was created'),
  updated: DateTimeSchema.describe('Timestamp when the execution was last updated'),
  started: DateTimeSchema.optional().describe('Timestamp when the execution was started'),
  completed: DateTimeSchema.optional().describe('Timestamp when the execution was completed'),
});

export type Execution = z.infer<typeof ExecutionSchema>;

export const ExecutionMetricsSchema = z.object({
  execution: z.string().describe('Execution ID'),
  totalTests: z.number().int().min(0).describe('Total number of tests executed'),
  totalPassed: z.number().int().min(0).describe('Total number of tests passed'),
  totalFailed: z.number().int().min(0).describe('Total number of tests failed'),
  totalSkipped: z.number().int().min(0).describe('Total number of tests skipped'),
  totalDurationMs: z.number().int().min(0).describe('Total duration of the execution in milliseconds'),
  averageTestDurationMs: z.number().optional().describe('Average duration per test in milliseconds'),
  memoryUsageMb: z.number().optional().describe('Peak memory usage in megabytes'),
  cpuUsagePercent: z.number().optional().describe('Average CPU usage percentage'),
  screenshotsCount: z.number().int().min(0).default(0).describe('Number of screenshots taken during the execution'),
  videosCount: z.number().int().min(0).default(0).describe('Number of videos recorded during the execution'),
  created: DateTimeSchema.optional().describe('Timestamp when the metrics were recorded'),
});

export type ExecutionMetrics = z.infer<typeof ExecutionMetricsSchema>;

export const TestStatusSchema = z.enum(['passed', 'failed', 'pending', 'skipped']);
export type TestStatus = z.infer<typeof TestStatusSchema>;
export const ExecutionDetailSchema = z.object({
  execution: z.string().describe('Execution ID'),
  title: z.string().describe('Title of the test'),
  status: TestStatusSchema,
  durationMs: z.number().int().min(0).describe('Duration of the test in milliseconds'),
  startedAt: DateTimeSchema.describe('Timestamp when the test started'),
  completedAt: DateTimeSchema.describe('Timestamp when the test completed'),
  errorMessage: z.string().optional().describe('Error message if the test failed'),
  screenshotPath: z.string().optional().describe('Path to the screenshot if taken'),
  videoPath: z.string().optional().describe('Path to the video if recorded'),
  hookDurations: z.record(z.string(), z.number()).optional().describe('Duration of each hook in milliseconds'),
  created: DateTimeSchema.describe('Timestamp when the test was created'),
});

export type ExecutionDetail = z.infer<typeof ExecutionDetailSchema>;
