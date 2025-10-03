import { type SourceType, SourceTypeSchema } from '@cmx-replayer/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class SourceCodeMongo {
  @Prop({ required: true })
  script: string;

  @Prop({ required: true, enum: SourceTypeSchema.options, type: String })
  type: SourceType;
}

export const SourceCodeMongoSchema = SchemaFactory.createForClass(SourceCodeMongo);
