import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import type { ExecutionMetrics } from '@/executions/types/execution.types';
import { ExecutionDocument } from './execution.schema';

@Schema({ versionKey: false, timestamps: { createdAt: 'created', updatedAt: 'updated' } })
export class ExecutionMetricsDocument extends Document implements ExecutionMetrics {
  @Prop({ required: true, ref: ExecutionDocument.name })
  execution: string;

  @Prop({ required: true, min: 0 })
  totalTests: number;

  @Prop({ required: true, min: 0 })
  totalPassed: number;

  @Prop({ required: true, min: 0 })
  totalFailed: number;

  @Prop({ required: true, min: 0 })
  totalSkipped: number;

  @Prop({ required: true, min: 0 })
  totalDurationMs: number;

  @Prop()
  averageTestDurationMs?: number;

  @Prop()
  memoryUsageMb?: number;

  @Prop()
  cpuUsagePercent?: number;

  @Prop({ default: 0, min: 0 })
  screenshotsCount: number;

  @Prop({ default: 0, min: 0 })
  videosCount: number;
}

export const ExecutionMetricsDBSchema = SchemaFactory.createForClass(ExecutionMetricsDocument);
