import { Module } from '@nestjs/common';
import { StorageService } from './services/storage.service';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ExecutionFileDBSchema, ExecutionFileDocument } from './schemas';
import { STORAGE_PROVIDER } from './storage.constants';
import { StorageCleanupService } from './services/storage-cleanup.service';
import { FileSystemStorageProvider } from './providers/filesystem-storage.provider';
import { MinioStorageProvider } from './providers/minio-storage.provider';
import { StorageConfig } from './types/storage-config.type';
import { StorageController } from './controllers/storage.controller';
import { mongooseTransformPlugin } from '@/common/plugins/mongoose-transform.plugin';

@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: ExecutionFileDocument.name,
        collection: 'execution_files',
        useFactory: () => {
          const schema = ExecutionFileDBSchema;
          schema.plugin(mongooseTransformPlugin);
          return schema;
        },
      },
    ]),
  ],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useFactory: (configService: ConfigService) => {
        const config = configService.getOrThrow<StorageConfig>('storage');

        switch (config.provider) {
          // case 's3':
          //   return new S3StorageProvider(configService);
          case 'minio':
            return new MinioStorageProvider(config.minio!);
          case 'filesystem':
          default:
            return new FileSystemStorageProvider(config.filesystem!);
        }
      },
      inject: [ConfigService],
    },
    StorageService,
    StorageCleanupService,
  ],
  exports: [StorageService],
  controllers: [StorageController],
})
export class StorageModule {}
