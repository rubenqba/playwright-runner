import { Recording, RecordingEvent } from '@cmx-replayer/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RecordingEventMongo, RecordingEventMongoSchema } from './event.schema';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
export class RecordingMongo implements Omit<Recording, 'id' | 'created' | 'updated'> {
  @Prop({ required: true })
  id: number;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  screen_width: number;

  @Prop({ required: true })
  screen_height: number;

  @Prop({ required: true })
  start_time: number;

  @Prop({ type: [RecordingEventMongoSchema], default: [] })
  events: RecordingEvent[];
}

export const RecordingMongoSchema = SchemaFactory.createForClass(RecordingMongo);

export type RecordingMongoDocumentOverride = {
  events: Types.DocumentArray<RecordingEventMongo>;
};
export type RecordingMongoDocument = HydratedDocument<RecordingMongo, RecordingMongoDocumentOverride>;
