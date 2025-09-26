import { Module } from '@nestjs/common';
import { RecordingsService } from './recordings.service';
import { MongooseModule } from '@nestjs/mongoose';
import { TestRecordingMongo, TestRecordingMongoDBSchema } from './schemas';
import { mongooseTransformPlugin } from '@/common/plugins/mongoose-transform.plugin';
import { RecordingsController, RecordingExecutionController } from './controllers';

@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: TestRecordingMongo.name,
        collection: 'recordings',
        useFactory: () => {
          const schema = TestRecordingMongoDBSchema;
          schema.plugin(mongooseTransformPlugin);
          return schema;
        },
      },
    ]),
  ],
  providers: [RecordingsService],
  controllers: [RecordingsController, RecordingExecutionController],
})
export class RecordingsModule {}
