import { type EventData, type EventType, EventTypeSchema, RecordingEvent } from '@cmx-replayer/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class EventLocationMongo {
  @Prop({ required: true, type: Number })
  x: number;

  @Prop({ required: true, type: Number })
  y: number;
}

@Schema({ _id: false })
export class RecordingEventMongo implements Omit<RecordingEvent, 'recording'> {
  @Prop({ required: true })
  id: number;

  @Prop({ required: true, enum: EventTypeSchema.options, type: String })
  type: EventType;

  @Prop({ required: true })
  event_target: string;

  @Prop({ required: true })
  event_selector: string;

  @Prop({ required: true, type: EventLocationMongo })
  event_location: EventLocationMongo;

  @Prop({ required: true, type: Object })
  event_data: EventData;

  @Prop({ required: true })
  event_test: string[];

  @Prop({ required: true })
  event_time: number;
}

export const RecordingEventMongoSchema = SchemaFactory.createForClass(RecordingEventMongo);
