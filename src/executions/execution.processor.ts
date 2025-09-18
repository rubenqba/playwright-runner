import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { type Job } from 'bull';
import { Execution } from './types/execution.types';
import { type IPlaywrightExecutor, PLAYWRIGHT_EXECUTOR_TOKEN } from './services';

interface TestExecutionJobData {
  execution: Execution;
}

@Processor('test-execution')
export class ExecutionProcessor {
  private readonly logger = new Logger(ExecutionProcessor.name);

  constructor(@Inject(PLAYWRIGHT_EXECUTOR_TOKEN) private readonly executor: IPlaywrightExecutor) {}

  @Process('execute-test')
  async handleTestExecution(job: Job<TestExecutionJobData>): Promise<void> {
    this.logger.log(`Processing job ${job.id} for execution ${job.data.execution.id}`);

    try {
      await this.executor.executeTest(job.data.execution);
      this.logger.log(`Job ${job.id} completed successfully`);
    } catch (error) {
      this.logger.error(`Job ${job.id} failed:`, error);
      throw error;
    }
  }
}
