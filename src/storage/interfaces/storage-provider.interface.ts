export interface IStorageProvider {
  upload(options: UploadOptions): Promise<UploadResult>;
  download(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getProviderName(): string;
}

export type UploadOptions = {
  key: string;
  data: Buffer;
  contentType?: string;
  metadata?: Record<string, any>;
};

export type UploadResult = {
  key: string;
  size: number;
  etag?: string;
  url?: string;
};
