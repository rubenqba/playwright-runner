// src/storage/providers/minio-storage.provider.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Minio from 'minio';
import { IStorageProvider, UploadOptions, UploadResult } from '../interfaces/storage-provider.interface';
import type { MinioProviderConfig } from '../types/storage-config.type';

interface MinioMetadataRecord {
  [key: string]: string;
}

interface MinioStatObject {
  size: number;
  metaData?: MinioMetadataRecord;
  lastModified: Date;
  etag: string;
}

@Injectable()
export class MinioStorageProvider implements IStorageProvider, OnModuleInit {
  private readonly logger = new Logger(MinioStorageProvider.name);
  private readonly client: Minio.Client;
  private readonly bucket: string;

  constructor(private readonly config: MinioProviderConfig) {
    this.client = new Minio.Client(config);
    this.bucket = this.config.bucket;
  }

  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);

      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created MinIO bucket: ${this.bucket}`);

        const policy = {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${this.bucket}/*`],
              Condition: {
                StringLike: {
                  's3:signatureversion': 'AWS4-HMAC-SHA256',
                },
              },
            },
          ],
        };

        await this.client.setBucketPolicy(this.bucket, JSON.stringify(policy));
      }

      this.logger.log(`MinIO storage initialized with bucket: ${this.bucket}`);
    } catch (error) {
      const e = error as Error;
      this.logger.error(`Failed to initialize MinIO bucket: ${e.message}`);
    }
  }

  async upload(options: UploadOptions): Promise<UploadResult> {
    const { key, data, contentType, metadata } = options;

    try {
      const minioMetadata: MinioMetadataRecord = {};

      if (metadata) {
        Object.entries(metadata).forEach(([k, v]) => {
          minioMetadata[`x-amz-meta-${k}`] = typeof v === 'string' ? v : JSON.stringify(v);
        });
      }

      if (contentType) {
        minioMetadata['Content-Type'] = contentType;
      }

      const uploadInfo = await this.client.putObject(this.bucket, key, data, data.length, minioMetadata);

      this.logger.debug(`File uploaded to MinIO: ${key} (${data.length} bytes) with etag: ${uploadInfo.etag}`);

      return {
        key,
        size: data.length,
        etag: uploadInfo.etag,
        url: await this.getSignedUrl(key),
      };
    } catch (error) {
      const e = error as Error;
      this.logger.error(`Failed to upload file to MinIO ${key}: ${e.message}`);
      throw error;
    }
  }

  async download(key: string): Promise<Buffer> {
    try {
      const stream = await this.client.getObject(this.bucket, key);
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        stream.on('end', () => {
          const buffer = Buffer.concat(chunks);
          this.logger.debug(`File downloaded from MinIO: ${key} (${buffer.length} bytes)`);
          resolve(buffer);
        });
        stream.on('error', (error: Error) => {
          this.logger.error(`Failed to download file from MinIO ${key}: ${error.message}`);
          reject(error);
        });
      });
    } catch (error) {
      if ((error as Error & { code?: string }).code === 'NoSuchKey') {
        throw new Error(`File not found: ${key}`);
      }
      throw error;
    }
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      await this.client.statObject(this.bucket, key);

      const url = await this.client.presignedGetObject(this.bucket, key, expiresIn);

      this.logger.debug(`Generated signed URL for ${key}, expires in ${expiresIn}s`);

      return url;
    } catch (error) {
      if ((error as Error & { code?: string }).code === 'NoSuchKey') {
        throw new Error(`File not found: ${key}`);
      }
      const e = error as Error;
      this.logger.error(`Failed to generate signed URL for ${key}: ${e.message}`);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, key);
      this.logger.debug(`File deleted from MinIO: ${key}`);
    } catch (error) {
      if ((error as Error & { code?: string }).code === 'NoSuchKey') {
        this.logger.warn(`File not found for deletion: ${key}`);
        return;
      }
      const e = error as Error;
      this.logger.error(`Failed to delete file from MinIO ${key}: ${e.message}`);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch (error) {
      if ((error as Error & { code?: string }).code === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }

  getProviderName(): string {
    return 'minio';
  }

  async getMetadata(key: string): Promise<Record<string, unknown>> {
    try {
      const stat = (await this.client.statObject(this.bucket, key)) as MinioStatObject;
      const metadata: Record<string, unknown> = {};

      if (stat.metaData) {
        Object.entries(stat.metaData).forEach(([k, v]) => {
          if (k.startsWith('x-amz-meta-')) {
            const metaKey = k.replace('x-amz-meta-', '');
            try {
              metadata[metaKey] = JSON.parse(v);
            } catch {
              metadata[metaKey] = v;
            }
          }
        });
      }

      return {
        size: stat.size,
        lastModified: stat.lastModified,
        etag: stat.etag,
        metadata,
      };
    } catch (error) {
      if ((error as Error & { code?: string }).code === 'NoSuchKey') {
        return {};
      }
      throw error;
    }
  }
}
