import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000; // Default to 3000 if not found
  await app.listen(port, () => {
    const log = new Logger('NestApplication');
    log.log(`Server is running on port ${port}`);
  });
}
bootstrap();
