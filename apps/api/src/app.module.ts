import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { ExecutionsModule } from '@/executions/executions.module';
import { StorageModule } from '@/storage/storage.module';
import mongodbConfig from '@/config/mongodb.config';
import storageConfig from '@/config/storage.config';
import redisConfig from '@/config/redis.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env'],
      isGlobal: true, // Makes ConfigService available globally
      expandVariables: true, // Expand environment variables
      load: [storageConfig], // You can add custom configuration files here
    }),
    MongooseModule.forRootAsync({
      useFactory: mongodbConfig,
    }),
    BullModule.forRootAsync({
      useFactory: redisConfig,
    }),
    ExecutionsModule,
    StorageModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
