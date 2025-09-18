import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MongooseModule } from '@nestjs/mongoose';
import { ExecutionMetricsDocument, ExecutionMetricsDBSchema } from './schemas/execution-metrics.schema';
import { ExecutionDocument, ExecutionDBSchema } from './schemas/execution.schema';
import { ExecutionDetailDocument, ExecutionDetailDBSchema } from './schemas/execution-detail.schema';
import { ExecutionController } from './executions.controller';
import { ExecutionProcessor } from './execution.processor';
import { PLAYWRIGHT_EXECUTOR_TOKEN, PlaywrightCliExecutorService } from './services';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'test-execution',
    }),
    MongooseModule.forFeature([
      { name: ExecutionDocument.name, schema: ExecutionDBSchema, collection: 'executions' },
      { name: ExecutionMetricsDocument.name, schema: ExecutionMetricsDBSchema, collection: 'execution_metrics' },
      { name: ExecutionDetailDocument.name, schema: ExecutionDetailDBSchema, collection: 'execution_details' },
    ]),
  ],
  controllers: [ExecutionController],
  providers: [
    ExecutionProcessor,
    {
      provide: PLAYWRIGHT_EXECUTOR_TOKEN,
      useClass: PlaywrightCliExecutorService, // 🔄 Cambiar por PlaywrightInlineExecutorService
    },
  ],
})
export class ExecutionsModule {}
