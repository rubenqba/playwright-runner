import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ExecutionDocument,
  ExecutionMetricsDocument,
  ExecutionDetailDocument,
  ExecutionFileDocument,
  ExecutionDBSchema,
  ExecutionMetricsDBSchema,
  ExecutionDetailDBSchema,
  ExecutionFileDBSchema,
} from './schemas';
import { ExecutionController } from './executions.controller';
import { ExecutionProcessor } from './execution.processor';
import { PLAYWRIGHT_EXECUTOR_TOKEN, PlaywrightOSExecutorService } from './services';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'test-execution',
    }),
    MongooseModule.forFeature([
      { name: ExecutionDocument.name, schema: ExecutionDBSchema, collection: 'executions' },
      { name: ExecutionMetricsDocument.name, schema: ExecutionMetricsDBSchema, collection: 'execution_metrics' },
      { name: ExecutionDetailDocument.name, schema: ExecutionDetailDBSchema, collection: 'execution_details' },
      { name: ExecutionFileDocument.name, schema: ExecutionFileDBSchema, collection: 'execution_files' },
    ]),
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
