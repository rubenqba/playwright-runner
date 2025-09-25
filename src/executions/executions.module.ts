import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ExecutionDocument,
  ExecutionMetricsDocument,
  ExecutionDetailDocument,
  ExecutionDBSchema,
  ExecutionMetricsDBSchema,
  ExecutionDetailDBSchema,
} from './schemas';
import { ExecutionController } from './executions.controller';
import { ExecutionProcessor } from './execution.processor';
import { PLAYWRIGHT_EXECUTOR_TOKEN, PlaywrightOSExecutorService } from './services';
import { StorageModule } from '@/storage/storage.module';
import { mongooseTransformPlugin } from '@/common/plugins/mongoose-transform.plugin';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'test-execution',
    }),
    MongooseModule.forFeatureAsync([
      {
        name: ExecutionDocument.name,
        collection: 'executions',
        useFactory: () => {
          const schema = ExecutionDBSchema;
          schema.plugin(mongooseTransformPlugin);
          return schema;
        },
      },
      {
        name: ExecutionMetricsDocument.name,
        collection: 'execution_metrics',
        useFactory: () => {
          const schema = ExecutionMetricsDBSchema;
          schema.plugin(mongooseTransformPlugin);
          return schema;
        },
      },
      {
        name: ExecutionDetailDocument.name,
        collection: 'execution_details',
        useFactory: () => {
          const schema = ExecutionDetailDBSchema;
          schema.plugin(mongooseTransformPlugin);
          return schema;
        },
      },
    ]),
    StorageModule,
  ],
  controllers: [ExecutionController],
  providers: [
    ExecutionProcessor,
    {
      provide: PLAYWRIGHT_EXECUTOR_TOKEN,
      useClass: PlaywrightOSExecutorService,
    },
  ],
})
export class ExecutionsModule {}
