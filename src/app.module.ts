import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExecutionsModule } from './executions/executions.module';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './config/env.schema';
import { z } from 'zod';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env'],
      validate: (config) => {
        try {
          return envSchema.parse(config);
        } catch (error) {
          console.error('Config validation error:', z.prettifyError(error));
          throw error;
        }
      },
      isGlobal: true, // Makes ConfigService available globally
    }),
    MongooseModule.forRoot('mongodb://localhost:27017/playwright'), // Replace with your MongoDB connection string
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
    ExecutionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
