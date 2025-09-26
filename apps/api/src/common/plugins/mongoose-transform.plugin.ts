// mongoose-transform.plugin.ts
import { Schema } from 'mongoose';

export function mongooseTransformPlugin(schema: Schema) {
  schema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
      if (ret.id && ret._id) {
        delete ret._id;
        return ret;
      }
      return ret;
    },
  });
  schema.set('toObject', {
    virtuals: true,
    transform: (doc, ret) => {
      if (ret.id && ret._id) {
        delete ret._id;
        return ret;
      }
      return ret;
    },
  });
}
