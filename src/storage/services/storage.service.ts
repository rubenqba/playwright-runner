// src/storage/storage.service.ts
import { Injectable, Inject, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { STORAGE_PROVIDER } from '../storage.constants';
import { type IStorageProvider } from '../interfaces/storage-provider.interface';
import { ExecutionFile, FileType } from '@/storage/types';
import { UploadFileDto, UploadFileSchema } from '../dto/storage.dto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import * as path from 'path';
import { z } from 'zod';
import { ExecutionFileDocument } from '@/storage/schemas';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: IStorageProvider,
    @InjectModel(ExecutionFileDocument.name) private executionFileModel: Model<ExecutionFile>,
    private readonly configService: ConfigService,
  ) {}

  async uploadExecutionFile(dto: UploadFileDto): Promise<ExecutionFile> {
    try {
      // Validar entrada con Zod
      const validatedDto = UploadFileSchema.parse(dto);

      let fileBuffer: Buffer;
      let originalName: string;
      let mimeType: string;
      let originalSize: number;
      let compressed = false;

      // Procesar el archivo
      if (Buffer.isBuffer(validatedDto.file)) {
        fileBuffer = validatedDto.file;
        originalName = `${validatedDto.fileType}-${Date.now()}`;
        mimeType = this.getMimeType(validatedDto.fileType);
        originalSize = fileBuffer.length;
      } else {
        fileBuffer = validatedDto.file.buffer;
        originalName = validatedDto.file.originalname;
        mimeType = validatedDto.file.mimetype;
        originalSize = validatedDto.file.size;
      }

      // Comprimir archivos grandes o logs
      if (this.shouldCompress(validatedDto.fileType, fileBuffer)) {
        fileBuffer = await gzip(fileBuffer);
        compressed = true;
        this.log.debug(`Compressed ${validatedDto.fileType} from ${originalSize} to ${fileBuffer.length} bytes`);
      }

      // Generar path único para el archivo
      const storagePath = this.generateStoragePath(validatedDto.execution, validatedDto.fileType, originalName);

      // Subir al storage provider
      const uploadResult = await this.storageProvider.upload({
        key: storagePath,
        data: fileBuffer,
        contentType: mimeType,
        metadata: {
          execution: validatedDto.execution,
          detail: validatedDto.detail,
          fileType: validatedDto.fileType,
          compressed,
          originalSize,
          ...validatedDto.metadata,
        },
      });

      // Calcular fecha de expiración según el tipo de archivo
      const expiresAt = this.calculateExpiration(validatedDto.fileType);

      // Guardar metadata en MongoDB
      const executionFile = new this.executionFileModel({
        execution: validatedDto.execution,
        detail: validatedDto.detail,
        fileName: originalName,
        filePath: storagePath,
        fileType: validatedDto.fileType,
        mimeType,
        fileSize: uploadResult.size,
        metadata: {
          ...validatedDto.metadata,
          compressed,
          originalSize,
          storageProvider: this.storageProvider.getProviderName(),
        },
        expiresAt,
      });

      const savedFile = await executionFile.save();

      // Convertir a ExecutionFile type
      return savedFile;
    } catch (error) {
      // Handle Zod validation errors specifically
      if (error instanceof z.ZodError) {
        throw new BadRequestException('Invalid upload data', z.prettifyError(error));
      }

      // Type-safe error handling for other errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.log.error(`Failed to upload execution file: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  async getExecutionFileUrl(fileId: string): Promise<string> {
    const file = await this.executionFileModel.findById(fileId);
    if (!file) {
      throw new BadRequestException('File not found');
    }

    // Verificar si el archivo ha expirado
    if (file.expiresAt && file.expiresAt < new Date()) {
      throw new BadRequestException('File has expired');
    }

    // Generar URL temporal basada en el tipo de archivo
    const expirationSeconds = this.getUrlExpiration(file.fileType);

    return await this.storageProvider.getSignedUrl(file.filePath, expirationSeconds);
  }

  async getExecutionFiles(executionId: string): Promise<ExecutionFile[]> {
    const files = await this.executionFileModel.find({ execution: executionId }).sort({ created: -1 }).exec();
    return files;
  }

  async getExecutionFile(id: string): Promise<ExecutionFile> {
    const file = await this.executionFileModel.findById(id).exec();
    if (!file) {
      throw new NotFoundException(`File ${id} not found`);
    }
    return file.toObject();
  }

  async downloadExecutionFile(fileId: string): Promise<{ data: Buffer; file: ExecutionFile }> {
    const file = await this.executionFileModel.findById(fileId).exec();
    if (!file) {
      throw new BadRequestException('File not found');
    }

    let data = await this.storageProvider.download(file.filePath);

    // Descomprimir si es necesario
    if (file.metadata?.compressed) {
      data = await gunzip(data);
    }

    return {
      data,
      file,
    };
  }

  async deleteExecutionFile(fileId: string): Promise<void> {
    const file = await this.executionFileModel.findById(fileId);
    if (!file) {
      throw new BadRequestException('File not found');
    }

    try {
      await this.storageProvider.delete(file.filePath);
    } catch (error) {
      this.log.warn(`Could not delete file from storage: ${(error as Error).message}`);
    }

    await this.executionFileModel.findByIdAndDelete(fileId);
    this.log.debug(`Deleted execution file ${fileId}`);
  }

  async deleteExecutionFiles(executionId: string): Promise<number> {
    const files = await this.executionFileModel.find({ execution: executionId });

    // Eliminar archivos del storage
    await Promise.all(
      files.map(async (file) => {
        try {
          await this.storageProvider.delete(file.filePath);
        } catch (error) {
          this.log.warn(`Could not delete file ${file.filePath}: ${(error as Error).message}`);
        }
      }),
    );

    // Eliminar registros de la BD
    const result = await this.executionFileModel.deleteMany({ execution: executionId });
    return result.deletedCount || 0;
  }

  private generateStoragePath(executionId: string, fileType: FileType, originalName: string): string {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '/');
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = path.extname(originalName) || this.getDefaultExtension(fileType);

    return `executions/${date}/${executionId}/${fileType}-${timestamp}-${random}${extension}`;
  }

  private shouldCompress(fileType: FileType, data: Buffer): boolean {
    // Comprimir logs siempre, otros archivos si son > 1MB
    if (fileType === 'log') return true;
    if (fileType === 'report' && data.length > 512 * 1024) return true; // > 512KB
    return false;
  }

  private calculateExpiration(fileType: FileType): Date | undefined {
    const retentionDays = this.configService.get<number>(`storage.retention.${fileType}`);
    if (!retentionDays) return undefined;

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + retentionDays);
    return expirationDate;
  }

  private getUrlExpiration(fileType: FileType): number {
    // URLs más largas para screenshots/videos de errores
    switch (fileType) {
      case 'screenshot':
      case 'video':
        return 86400; // 24 horas
      case 'report':
        return 3600 * 12; // 12 horas
      case 'log':
      default:
        return 3600; // 1 hora
    }
  }

  private getMimeType(fileType: FileType): string {
    switch (fileType) {
      case 'video':
        return 'video/mp4';
      case 'screenshot':
        return 'image/png';
      case 'log':
        return 'text/plain';
      case 'report':
        return 'text/html';
      default:
        return 'application/octet-stream';
    }
  }

  private getDefaultExtension(fileType: FileType): string {
    switch (fileType) {
      case 'video':
        return '.mp4';
      case 'screenshot':
        return '.png';
      case 'log':
        return '.log';
      case 'report':
        return '.html';
      default:
        return '';
    }
  }
}
