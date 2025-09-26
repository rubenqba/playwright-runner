import { z } from 'zod';

export const EventTypeSchema = z.enum(['click', 'change']);
export type EventType = z.infer<typeof EventTypeSchema>;

export const EventLocationSchema = z.object({
  x: z.number().describe('X coordinate of the event location'),
  y: z.number().describe('Y coordinate of the event location'),
});
export type EventLocation = z.infer<typeof EventLocationSchema>;

export const EventDataSchema = z
  .object({
    description: z.string().nullable(),
  })
  .catchall(z.unknown());
export type EventData = z.infer<typeof EventDataSchema>;

export const RecordingEventSchema = z.object({
  id: z.number().int().describe('Unique identifier for the recording event'),
  // recording: z.number().int().describe('ID of the associated recording'),
  type: EventTypeSchema.describe('Type of the event'),
  event_target: z.string().describe('Target of the event'),
  event_selector: z.string().describe('CSS selector for the event'),
  event_location: EventLocationSchema.describe('Location of the event (viewport coordinates)'),
  event_data: EventDataSchema.describe('Additional data recorded with the event'),
  event_test: z.array(z.string()).describe('List of tests associated with the event'),
  event_time: z.number().int().describe('Timestamp of the event'),
});
export type RecordingEvent = z.infer<typeof RecordingEventSchema>;
