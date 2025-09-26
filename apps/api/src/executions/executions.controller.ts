import { Body, Controller, Post, Get, Param, InternalServerErrorException } from '@nestjs/common';
import { Execution, ExecutionDetailSchema, ExecutionMetricsSchema } from './types/execution.types';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ExecutionsService } from './services/executions.service';
import { createZodDto } from 'nestjs-zod';
import { ExecutionFileSchema } from '@/storage/types';
import { ExecutionEnqueueInputSchema } from './schemas';

class ExecutionInputDto extends createZodDto(ExecutionEnqueueInputSchema) {}

// class ExecutionResponse extends createZodDto(ExecutionSchema) {}
class DetailsResponse extends createZodDto(ExecutionDetailSchema) {}
class MetricsResponse extends createZodDto(ExecutionMetricsSchema) {}
class FilesResponse extends createZodDto(ExecutionFileSchema) {}

@Controller('executions')
export class ExecutionController {
  constructor(private readonly service: ExecutionsService) {}

  @Post()
  @ApiOperation({ summary: 'Enqueue a new test execution' })
  @ApiBody({ type: ExecutionInputDto })
  @ApiResponse({ status: 201, description: 'The execution has been enqueued' })
  async executeTest(@Body() data: ExecutionInputDto) {
    try {
      const { recording, baseUrl, type, code, browser, executionConfig, executedBy } = data;

      return this.service.enqueueExecution({
        recording,
        baseUrl,
        type,
        code,
        browser,
        executionConfig,
        executedBy,
      });
    } catch (error) {
      throw new InternalServerErrorException(
        `Invalid execution data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get execution details by ID' })
  @ApiResponse({ status: 200, description: 'Execution details retrieved successfully' })
  async getExecution(@Param('id') id: string): Promise<Execution> {
    return this.service.getExecution(id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get execution status by ID' })
  @ApiResponse({ status: 200, description: 'Execution status retrieved successfully' })
  async getExecutionStatus(@Param('id') id: string) {
    const execution = await this.service.getExecution(id);

    return {
      id: execution.id,
      status: execution.status,
      started: execution.started,
      completed: execution.completed,
      errorMessage: execution.errorMessage,
    };
  }

  @Get(':id/details')
  @ApiOperation({ summary: 'Get detailed test results for a specific execution' })
  @ApiResponse({ status: 200, description: 'Detailed test results retrieved successfully', type: [DetailsResponse] })
  async getExecutionDetails(@Param('id') id: string) {
    return this.service.getExecutionDetails(id);
  }

  @Get(':id/metrics')
  @ApiOperation({ summary: 'Get metrics for a specific execution' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved successfully', type: MetricsResponse })
  async getExecutionMetrics(@Param('id') id: string) {
    return this.service.getExecutionMetrics(id);
  }

  @Get(':id/files')
  @ApiOperation({ summary: 'Get all files for an execution' })
  @ApiResponse({ status: 200, description: 'Files retrieved successfully', type: [FilesResponse] })
  async getExecutionFiles(@Param('id') id: string) {
    return this.service.getExecutionFiles(id);
  }
}
