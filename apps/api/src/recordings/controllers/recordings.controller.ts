import { Get, Param, Controller, Logger, Post, Body, Put, Delete, HttpStatus, HttpCode } from '@nestjs/common';
import { RecordingsService } from '../recordings.service';
import { TestRecording, TestRecordingPageSchema, TestRecordingSchema } from '@cmx-replayer/shared';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';

class TestRecordingPageResponse extends createZodDto(TestRecordingPageSchema) {}
class TestRecordingResponse extends createZodDto(TestRecordingSchema) {}
class TestRecordingInput extends createZodDto(TestRecordingSchema.omit({ id: true, created: true, updated: true })) {}

@ApiTags('Recordings')
@Controller('recordings')
export class RecordingsController {
  private readonly log = new Logger(RecordingsController.name);

  constructor(private readonly service: RecordingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all recordings' })
  @ApiResponse({ status: 200, description: 'List of recordings', type: TestRecordingPageResponse })
  async getRecordings() {
    return await this.service.getRecordings();
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all recording categories' })
  @ApiResponse({ status: 200, description: 'List of categories', type: [String] })
  async getCategories(): Promise<string[]> {
    return this.service.getCategories();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a recording by ID' })
  @ApiResponse({ status: 200, description: 'The recording', type: TestRecordingResponse })
  @ApiResponse({ status: 404, description: 'Recording not found' })
  async getRecording(@Param('id') id: string) {
    return this.service.getRecording(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new recording' })
  @ApiBody({ type: TestRecordingInput })
  @ApiResponse({ status: 201, description: 'The recording has been created', type: TestRecordingResponse })
  async createRecording(@Body() data: TestRecordingInput) {
    this.log.debug(`Creating recording: ${JSON.stringify(data)}`);
    return this.service.createRecording(data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a recording by ID' })
  @ApiResponse({ status: 200, description: 'The recording has been updated', type: TestRecordingResponse })
  @ApiResponse({ status: 404, description: 'Recording not found' })
  async updateRecording(@Param('id') id: string, @Body() data: Partial<TestRecording>) {
    this.log.debug(`Updating recording ${id}: ${JSON.stringify(data)}`);
    return this.service.updateRecording(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a recording by ID' })
  @ApiResponse({ status: 204, description: 'The recording has been deleted' })
  @ApiResponse({ status: 404, description: 'Recording not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRecording(@Param('id') id: string) {
    this.log.debug(`Deleting recording ${id}`);
    await this.service.deleteRecording(id);
  }
}
