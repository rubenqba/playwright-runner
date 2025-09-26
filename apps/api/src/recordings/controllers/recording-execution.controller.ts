import { ExecutionsService } from '@/executions/services/executions.service';
import { ExecutionStatusSchema, SourceTypeSchema } from '@/executions/types';
import { Body, Controller, Logger, Param, Post } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RecordingsService } from '../recordings.service';
import { TestRecording } from '@cmx-replayer/shared';
import { generatePlaywrightSpec } from '@/playwright/utils';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

class RecordingExecutionInputDto extends createZodDto(
  z.object({
    type: SourceTypeSchema.default('playwright').describe('Type of the test framework to use'),
    code: z.string().min(10).optional().describe('Optional code to run instead of the recording, must be valid code'),
    browser: z.string().optional().describe('Browser to use for the execution, e.g., chromium, firefox, webkit'),
    executionConfig: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Additional execution configuration options'),
    executedBy: z.string().describe('User who initiated the execution'),
  }),
) {}

class RecordingExecutionOutputDto extends createZodDto(
  z.object({
    success: z.boolean().describe('Indicates if the execution was successfully enqueued'),
    id: z.string().describe('Unique identifier for the enqueued execution'),
    status: ExecutionStatusSchema.describe('Current status of the execution, e.g., queued'),
    errorMessage: z.string().nullish().describe('Error message if the enqueueing failed'),
  }),
) {}

@Controller('recordings/:id/execute')
@ApiTags('Recordings')
export class RecordingExecutionController {
  private readonly log = new Logger(RecordingExecutionController.name);

  constructor(
    private readonly recordings: RecordingsService,
    private readonly executions: ExecutionsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Execute a recording by ID' })
  @ApiBody({ type: RecordingExecutionInputDto })
  @ApiResponse({ status: 201, description: 'The execution has been enqueued', type: RecordingExecutionOutputDto })
  async executeRecording(@Param('id') id: string, @Body() body: RecordingExecutionInputDto) {
    this.log.debug(`Executing recording ${id} with payload: ${JSON.stringify(body)}`);

    const recording = await this.recordings.getRecording(id);

    const code = body.code ?? this.generateCodeFromRecording(recording, body.type);

    return this.executions.enqueueExecution({
      recording: recording.id,
      baseUrl: recording.url,
      type: body.type,
      code,
      browser: body.browser,
      executionConfig: body.executionConfig,
      executedBy: body.executedBy,
    });
  }

  generateCodeFromRecording(recording: TestRecording, type: string): string {
    switch (type) {
      case 'playwright': {
        return generatePlaywrightSpec(recording);
      }
      default:
        throw new Error(`Unsupported execution type: ${type}`);
    }
  }
}
