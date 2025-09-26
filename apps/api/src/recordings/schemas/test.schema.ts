import { Recording, TestRecording } from '@cmx-replayer/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { RecordingMongo, RecordingMongoSchema } from './recording.schema';

@Schema({
  versionKey: false,
  timestamps: { createdAt: 'created', updatedAt: 'updated' },
  collection: 'recordings',
})
export class TestRecordingMongo implements Omit<TestRecording, 'id' | 'created' | 'updated'> {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  user: string;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  category: string;

  @Prop({ type: [RecordingMongoSchema], default: [] })
  recordings: Recording[];
}

export const TestRecordingMongoDBSchema = SchemaFactory.createForClass(TestRecordingMongo);

export type TestRecordingMongoDocumentOverride = {
  recordings: Types.DocumentArray<RecordingMongo>;
};
export type TestRecordingMongoDocument = HydratedDocument<TestRecordingMongo, TestRecordingMongoDocumentOverride>;
