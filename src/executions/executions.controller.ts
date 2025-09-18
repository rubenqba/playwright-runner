import { Body, Controller, Post, Get, Param, HttpException, HttpStatus } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { type Queue } from 'bull';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Execution } from './types/execution.types';
import { ExecutionDocument } from './schemas/execution.schema';
import { z } from 'zod';

interface ExecutionResponse {
  success: boolean;
  executionId: string;
  status: string;
}

interface ExecutionStatusResponse {
  id: string;
  status: string;
  started?: Date;
  completed?: Date;
  errorMessage?: string;
}

export const ExecutionInputSchema = z.object({
  recording: z.string().min(2).max(100),
  baseUrl: z.url(),
  code: z.string().min(10),
  browser: z.string().optional(),
  executionConfig: z.record(z.string(), z.unknown()).optional(),
  executedBy: z.string().optional(),
});

@Controller('executions')
export class ExecutionController {
  constructor(
    @InjectQueue('test-execution') private testQueue: Queue,
    @InjectModel(ExecutionDocument.name)
    private executionModel: Model<Execution>,
  ) {}

  @Post()
  async executeTest(@Body() data: unknown): Promise<ExecutionResponse> {
    try {
      // Validar con Zod
      const validatedExecution = ExecutionInputSchema.parse(data);

      const { recording, baseUrl, code, browser, executionConfig, executedBy } = validatedExecution;

      // Guardar en BD con status 'queued'
      const execution = await new this.executionModel({
        id: `exec_${new Date().getTime()}`,
        recording,
        baseUrl,
        code,
        browser,
        executionConfig,
        executedBy,
        status: 'queued',
      }).save();

      // Agregar a la cola
      await this.testQueue.add('execute-test', {
        execution: execution.toObject({ virtuals: true }),
      });

      return {
        success: true,
        executionId: execution.id as string,
        status: 'queued',
      };
    } catch (error) {
      throw new HttpException(
        `Invalid execution data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':id')
  async getExecution(@Param('id') id: string): Promise<Execution> {
    const execution = await this.executionModel.findOne({ id }).exec();

    if (!execution) {
      throw new HttpException('Execution not found', HttpStatus.NOT_FOUND);
    }

    return execution;
  }

  @Get(':id/status')
  async getExecutionStatus(@Param('id') id: string): Promise<ExecutionStatusResponse> {
    const execution = await this.executionModel
      .findOne({ id })
      .select('id status startedAt completedAt errorMessage')
      .exec();

    if (!execution) {
      throw new HttpException('Execution not found', HttpStatus.NOT_FOUND);
    }

    return {
      id: execution.id as string,
      status: execution.status,
      started: execution.started,
      completed: execution.completed,
      errorMessage: execution.errorMessage,
    };
  }
}
