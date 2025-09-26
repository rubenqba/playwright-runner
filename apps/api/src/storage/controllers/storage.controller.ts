import { Controller, Get, Param, Res } from '@nestjs/common';
import { type Response } from 'express';
import { StorageService } from '../services/storage.service';
import { ApiOperation } from '@nestjs/swagger';

@Controller('files')
export class StorageController {
  constructor(private readonly service: StorageService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get file metadata' })
  async getExecutionFile(@Param('id') id: string) {
    const file = await this.service.getExecutionFile(id);
    return { ...file, url: await this.service.getExecutionFileUrl(id) };
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download a file' })
  async downloadExecutionFile(@Param('id') id: string, @Res() res: Response) {
    const { data, file } = await this.service.downloadExecutionFile(id);

    res.header('Content-Type', file.mimeType);
    res.header('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.header('Content-Length', data.length.toString());

    res.send(data);
  }
}
