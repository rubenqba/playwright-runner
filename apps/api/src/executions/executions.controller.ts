import { Body, Controller, Post, Get, Param, HttpException, HttpStatus, Res, Delete } from '@nestjs/common';
import { type Response } from 'express';
import { InjectQueue } from '@nestjs/bull';
import { type Queue } from 'bull';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Execution } from './types/execution.types';
import { ExecutionDocument } from '@/executions/schemas/execution.schema';
import { z } from 'zod';
import { ApiOperation } from '@nestjs/swagger';
import { StorageService } from '@/storage/services/storage.service';

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
    private readonly storage: StorageService,
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
    const execution = await this.executionModel.findById(id).exec();

    if (!execution) {
      throw new HttpException('Execution not found', HttpStatus.NOT_FOUND);
    }

    return execution.toJSON({ virtuals: true }) as Execution;
  }

  @Get(':id/status')
  async getExecutionStatus(@Param('id') id: string): Promise<ExecutionStatusResponse> {
    const execution = await this.executionModel
      .findById(id)
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

  @Get(':id/files')
  @ApiOperation({ summary: 'Get all files for an execution' })
  async getExecutionFiles(@Param('id') executionId: string) {
    const list = await this.storage.getExecutionFiles(executionId);
    return list;
  }

  @Get('files/:fileId')
  @ApiOperation({ summary: 'Get a specific execution file URL' })
  async getExecutionFileUrl(@Param('fileId') fileId: string) {
    const url = await this.storage.getExecutionFileUrl(fileId);
    return { url, expiresIn: '24h' };
  }

  @Get('files/:fileId/download')
  @ApiOperation({ summary: 'Download an execution file' })
  async downloadExecutionFile(@Param('fileId') fileId: string, @Res() res: Response) {
    const { data, file } = await this.storage.downloadExecutionFile(fileId);

    res.header('Content-Type', file.mimeType);
    res.header('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.header('Content-Length', data.length.toString());

    res.send(data);
  }

  @Delete(':id/files')
  @ApiOperation({ summary: 'Delete all files for an execution' })
  async deleteExecutionFiles(@Param('id') executionId: string) {
    const deletedCount = await this.storage.deleteExecutionFiles(executionId);
    return { message: `Deleted ${deletedCount} files` };
  }
}
