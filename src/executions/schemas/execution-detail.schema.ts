import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { TestStatusSchema, type TestStatus, type ExecutionDetail } from '../types/execution.types';

@Schema({ timestamps: { createdAt: 'created', updatedAt: 'updated' } })
export class ExecutionDetailDocument extends Document implements ExecutionDetail {
  @Prop({ required: true })
  execution: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true, enum: TestStatusSchema.options, type: String })
  status: TestStatus;

  @Prop({ required: true, min: 0 })
  durationMs: number;

  @Prop({ required: true })
  startedAt: Date;

  @Prop({ required: true })
  completedAt: Date;

  @Prop()
  errorMessage?: string;

  @Prop()
  screenshotPath?: string;

  @Prop()
  videoPath?: string;

  @Prop({ type: Object })
  hookDurations?: Record<string, number>;

  @Prop()
  created: Date;
}

export const ExecutionDetailDBSchema = SchemaFactory.createForClass(ExecutionDetailDocument);
