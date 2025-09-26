import { z } from 'zod';
import { RecordingSchema } from './ui-recording.schema';
import { pageOf, queryOf } from './pagination.schema';

export const TestRecordingSchema = z.object({
  id: z.string().describe('Unique identifier for the test recording'),
  name: z.string().describe('Test recording name'),
  user: z.string().describe('Username of the user who created the recording'),
  url: z.url().describe('URL of the page where the recording started'),
  category: z.string().describe('Category of the recording'),
  recordings: RecordingSchema.array().describe('List of test recordings'),
  created: z.iso
    .datetime()
    .transform((d) => new Date(d))
    .describe('Timestamp when the test recording was created'),
  updated: z.iso
    .datetime()
    .transform((d) => new Date(d))
    .describe('Timestamp when the test recording was last updated'),
});
export type TestRecording = z.infer<typeof TestRecordingSchema>;

const testRecordingSortKeys = ['updated', 'user', 'name', 'category'] as const;
export const TestRecordingSearchParamsSchema = queryOf(
  z
    .object({
      user: z.string().max(100),
      category: z.string().max(100),
    })
    .partial(),
  testRecordingSortKeys,
);
export type TestRecordingSearchParams = z.infer<typeof TestRecordingSearchParamsSchema>;
export const TestRecordingPageSchema = pageOf(TestRecordingSchema).describe('Page of test recordings');
export type TestRecordingPage = z.infer<typeof TestRecordingPageSchema>;
