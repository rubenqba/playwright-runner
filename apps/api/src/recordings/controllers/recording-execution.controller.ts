import { Controller, Param, Post } from '@nestjs/common';

@Controller('recordings/:id/executions')
export class RecordingExecutionController {
  @Post()
  async executeRecording(@Param('id') id: string) {
    return Promise.resolve({ message: `Execution started for recording ${id}` });
  }
}
