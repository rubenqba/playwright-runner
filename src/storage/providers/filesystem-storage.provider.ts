// src/storage/providers/filesystem-storage.provider.ts
import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { IStorageProvider, UploadOptions, UploadResult } from '../interfaces/storage-provider.interface';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { isError } from '@/common/utils/error-helper.util';
import { type FileSystemProviderConfig } from '../types/filesystem-provider.type';

@Injectable()
export class FileSystemStorageProvider implements IStorageProvider, OnModuleInit {
  private readonly log = new Logger(FileSystemStorageProvider.name);

  constructor(private readonly config: FileSystemProviderConfig) {}

  async onModuleInit(): Promise<void> {
    try {
      await fs.mkdir(this.config.basePath, { recursive: true });
      this.log.log(`Storage directory initialized at: ${this.config.basePath}`);
    } catch (error) {
      const e = error as NodeJS.ErrnoException;
      this.log.error(`Failed to initialize storage directory: ${e.message}`);
    }
  }

  async upload(options: UploadOptions): Promise<UploadResult> {
    const { key, data, contentType, metadata } = options;
    const filePath = path.join(this.config.basePath, key);

    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, data);

      if (metadata || contentType) {
        const metadataPath = `${filePath}.metadata.json`;
        const metadataContent: Record<string, unknown> = {
          contentType,
          metadata,
          uploadedAt: new Date().toISOString(),
        };
        await fs.writeFile(metadataPath, JSON.stringify(metadataContent, null, 2));
      }

      const hash = crypto.createHash('md5').update(data).digest('hex');

      this.log.debug(`File uploaded to filesystem: ${key} (${data.length} bytes)`);

      return {
        key,
        size: data.length,
        etag: hash,
        url: `${this.config.baseUrl}/api/storage/files/${encodeURIComponent(key)}`,
      };
    } catch (error) {
      if (isError(error)) {
        this.log.error(`Failed to upload file ${key}: ${error.message}`);
      } else {
        this.log.error(`Failed to upload file ${key}: ${error}`);
      }
      throw error;
    }
  }

  async download(key: string): Promise<Buffer> {
    const filePath = path.join(this.config.basePath, key);

    try {
      await fs.access(filePath);
      const buffer = await fs.readFile(filePath);
      this.log.debug(`File downloaded from filesystem: ${key} (${buffer.length} bytes)`);
      return buffer;
    } catch (error) {
      const e = error as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        throw new Error(`File not found: ${key}`);
      }
      this.log.error(`Failed to download file ${key}: ${e.message}`);
      throw error;
    }
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const filePath = path.join(this.config.basePath, key);

    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException(`File not found: ${key}`);
    }

    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const tokenData = `${key}:${expires}`;
    const signature = crypto.createHmac('sha256', this.config.secretKey).update(tokenData).digest('hex');

    const params = new URLSearchParams({
      token: signature,
      expires: expires.toString(),
    });

    const url = `${this.config.baseUrl}/api/storage/signed/${encodeURIComponent(key)}?${params}`;
    this.log.debug(`Generated signed URL for ${key}, expires in ${expiresIn}s`);

    return url;
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.config.basePath, key);
    const metadataPath = `${filePath}.metadata.json`;

    try {
      await fs.unlink(filePath);

      try {
        await fs.unlink(metadataPath);
      } catch {
        // Ignorar si no existe metadata
      }

      await this.cleanEmptyDirectories(path.dirname(filePath));
      this.log.debug(`File deleted from filesystem: ${key}`);
    } catch (error) {
      const e = error as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        this.log.warn(`File not found for deletion: ${key}`);
        return;
      }
      this.log.error(`Failed to delete file ${key}: ${e.message}`);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = path.join(this.config.basePath, key);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  getProviderName(): string {
    return 'filesystem';
  }

  async validateSignedUrl(key: string, token: string, expires: string): Promise<boolean> {
    try {
      const expiresTimestamp = parseInt(expires, 10);

      if (Math.floor(Date.now() / 1000) > expiresTimestamp) {
        return false;
      }

      const tokenData = `${key}:${expires}`;
      const expectedSignature = crypto.createHmac('sha256', this.config.secretKey).update(tokenData).digest('hex');

      return Promise.resolve(token === expectedSignature);
    } catch (error) {
      const e = error as Error;
      this.log.error(`Failed to validate signed URL: ${e.message}`);
      return Promise.resolve(false);
    }
  }

  async getMetadata(key: string): Promise<Record<string, unknown>> {
    const metadataPath = path.join(this.config.basePath, `${key}.metadata.json`);

    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private async cleanEmptyDirectories(dirPath: string): Promise<void> {
    if (path.resolve(dirPath) === path.resolve(this.config.basePath)) {
      return;
    }

    try {
      const files = await fs.readdir(dirPath);

      if (files.length === 0) {
        await fs.rmdir(dirPath);
        this.log.debug(`Removed empty directory: ${dirPath}`);

        const parentDir = path.dirname(dirPath);
        if (parentDir !== dirPath) {
          await this.cleanEmptyDirectories(parentDir);
        }
      }
    } catch (error) {
      const e = error as Error;
      this.log.debug(`Could not clean directory ${dirPath}: ${e.message}`);
    }
  }
}
