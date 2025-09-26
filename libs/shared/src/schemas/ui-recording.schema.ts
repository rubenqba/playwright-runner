import { z } from 'zod';
import { RecordingEventSchema } from './ui-events.schema';

export const RecordingSchema = z.object({
  id: z.number().describe('Unique identifier for the recording'),
  url: z.url().describe('URL of the recording'),
  screen_width: z.number().int().positive().describe('Width of the recording screen'),
  screen_height: z.number().int().positive().describe('Height of the recording screen'),
  start_time: z.number().int().positive().describe('Start time of the recording'),
  events: RecordingEventSchema.array().describe('List of events associated with the recording'),
});

export type Recording = z.infer<typeof RecordingSchema>;
