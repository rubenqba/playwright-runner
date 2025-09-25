import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ExecutionFile, type FileType, FileTypeSchema } from '@/storage/types';
import { ExecutionDocument } from '@/executions/schemas/execution.schema';

@Schema({ versionKey: false, timestamps: { createdAt: 'created', updatedAt: 'updated' } })
export class ExecutionFileDocument extends Document implements Omit<ExecutionFile, 'id' | 'created'> {
  @Prop({ required: true, ref: ExecutionDocument.name })
  execution!: string;

  @Prop()
  detail: string;

  @Prop({ required: true })
  fileName!: string;

  @Prop({ required: true })
  filePath!: string;

  @Prop({ required: true, enum: FileTypeSchema.options, type: String })
  fileType!: FileType;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true })
  fileSize!: number;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ type: Date })
  expiresAt?: Date;
}

export const ExecutionFileDBSchema = SchemaFactory.createForClass(ExecutionFileDocument);
