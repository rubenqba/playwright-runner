import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { type BrowserType, BrowserTypeSchema, Execution, type ExecutionStatus } from '../types/execution.types';

@Schema({ versionKey: false, timestamps: { createdAt: 'created', updatedAt: 'updated' } })
export class ExecutionDocument extends Document implements Omit<Execution, 'id' | 'created' | 'updated'> {
  @Prop({ required: true })
  recording: string;

  @Prop({
    required: true,
    enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
    type: String,
  })
  status: ExecutionStatus;

  @Prop({ enum: BrowserTypeSchema.options, default: 'chrome' })
  browser: BrowserType;

  @Prop()
  baseUrl?: string;

  @Prop({ type: Object })
  executionConfig?: Record<string, unknown>;

  @Prop()
  executedBy?: string;

  @Prop()
  errorMessage?: string;

  @Prop()
  code: string;

  @Prop()
  created: Date;

  @Prop()
  updated: Date;

  @Prop()
  started?: Date;

  @Prop()
  completed?: Date;
}

export const ExecutionDBSchema = SchemaFactory.createForClass(ExecutionDocument);
