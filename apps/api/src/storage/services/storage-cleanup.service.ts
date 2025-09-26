/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/storage/storage-cleanup.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ExecutionFileDocument } from '@/storage/schemas/execution-file.schema';
import { StorageService } from './storage.service';

@Injectable()
export class StorageCleanupService {
  private readonly logger = new Logger(StorageCleanupService.name);

  constructor(
    @InjectModel(ExecutionFileDocument.name)
    private executionFileModel: Model<ExecutionFileDocument>,
    private storageService: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredFiles(): Promise<void> {
    this.logger.log('Starting expired files cleanup...');

    try {
      // Buscar archivos expirados
      const expiredFiles = await this.executionFileModel
        .find({
          expiresAt: { $lt: new Date() },
        })
        .limit(100); // Procesar en lotes

      let deletedCount = 0;
      for (const file of expiredFiles) {
        try {
          await this.storageService.deleteExecutionFile(file.id.toString());
          deletedCount++;
        } catch (error) {
          this.logger.error(`Failed to delete expired file ${file.id}: ${error.message}`);
        }
      }

      this.logger.log(`Cleanup completed. Deleted ${deletedCount} expired files.`);
    } catch (error) {
      this.logger.error(`Cleanup job failed: ${error.message}`, error.stack);
    }
  }

  @Cron(CronExpression.EVERY_WEEK)
  async cleanupOrphanedFiles(): Promise<void> {
    this.logger.log('Starting orphaned files cleanup...');

    // Limpiar archivos de ejecuciones eliminadas
    const orphanedFiles = await this.executionFileModel.aggregate([
      {
        $lookup: {
          from: 'executions',
          localField: 'execution',
          foreignField: '_id',
          as: 'executionDoc',
        },
      },
      {
        $match: {
          executionDoc: { $size: 0 },
        },
      },
      {
        $limit: 50,
      },
    ]);

    for (const file of orphanedFiles) {
      try {
        await this.storageService.deleteExecutionFile(file._id.toString());
        this.logger.debug(`Deleted orphaned file ${file._id}`);
      } catch (error) {
        this.logger.error(`Failed to delete orphaned file ${file._id}: ${error.message}`);
      }
    }
  }
}
