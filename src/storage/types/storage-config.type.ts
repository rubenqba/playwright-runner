import { FileSystemProviderConfig } from './filesystem-provider.type';
import { ClientOptions } from 'minio';

export type StorageConfig = {
  provider: 'filesystem' | 'minio'; // | 's3'; // Extend with other providers as needed
  filesystem?: FileSystemProviderConfig;
  minio?: MinioProviderConfig;
};

export type MinioProviderConfig = ClientOptions & {
  bucket: string;
  region?: string;
};
