import { StorageService } from '@/storage/services/storage.service';
import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Queue } from 'bull';
import { Model } from 'mongoose';
import {
  ExecutionDetailDocument,
  ExecutionDocument,
  ExecutionEnqueueInput,
  ExecutionEnqueueResponse,
  ExecutionMetricsDocument,
} from '../schemas';
import { Execution, ExecutionDetail, ExecutionMetrics } from '../types';
import { ExecutionFile } from '@/storage/types';

@Injectable()
export class ExecutionsService {
  private readonly log = new Logger(ExecutionsService.name);

  constructor(
    @InjectQueue('test-execution') private executionQueue: Queue,
    @InjectModel(ExecutionDocument.name)
    private executionModel: Model<Execution>,
    @InjectModel(ExecutionDetailDocument.name)
    private details: Model<ExecutionDetail>,
    @InjectModel(ExecutionMetricsDocument.name)
    private metrics: Model<ExecutionMetrics>,
    private readonly storage: StorageService,
  ) {}

  async enqueueExecution(data: ExecutionEnqueueInput): Promise<ExecutionEnqueueResponse> {
    this.log.debug(`Enqueuing execution with data: ${JSON.stringify(data)}`);

    try {
      const { recording, baseUrl, code, browser, executionConfig, executedBy } = data;

      // Guardar en BD con status 'queued'
      const execution = await new this.executionModel({
        recording,
        baseUrl,
        code,
        browser,
        executionConfig,
        executedBy,
        status: 'queued',
      }).save();

      // Agregar a la cola
      await this.executionQueue.add('execute-test', {
        execution: execution.toObject({ virtuals: true }),
      });

      return {
        success: true,
        id: execution.id as string,
        status: 'queued',
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: (error as Error).message,
      };
    }
  }

  async getExecution(id: string): Promise<Execution> {
    this.log.debug(`Fetching execution with ID: ${id}`);
    const execution = await this.executionModel.findById(id).lean();
    if (!execution) {
      throw new NotFoundException(`Execution not found with ID: ${id}`);
    }
    return execution;
  }

  async getExecutionMetrics(id: string): Promise<ExecutionMetrics> {
    this.log.debug(`Fetching metrics for execution ID: ${id}`);
    const metrics = await this.metrics.findOne({ execution: id }).lean();
    if (!metrics) {
      throw new NotFoundException(`Metrics not found for execution ID: ${id}`);
    }
    return metrics;
  }

  async getExecutionDetails(id: string): Promise<ExecutionDetail[]> {
    this.log.debug(`Fetching details for execution ID: ${id}`);
    return this.details.find({ execution: id }).lean();
  }

  async getExecutionFiles(id: string): Promise<ExecutionFile[]> {
    this.log.debug(`Fetching files for execution ID: ${id}`);
    return this.storage.getExecutionFiles(id);
  }
}
