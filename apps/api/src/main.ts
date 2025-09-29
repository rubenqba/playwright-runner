import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000; // Default to 3000 if not found

  // defining global prefix
  app.setGlobalPrefix('api');

  // enabling fixed versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '2',
  });

  const openApiDoc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Cemex Replayer API')
      .setDescription('API to save records of a web application for testing purposes')
      .setVersion('2.0')
      .setContact('Rubén Bresler', '', 'ruben.bresler@ext.cemex.com')
      .addServer(`http://localhost:${port}`, 'Development')
      .build(),
  );

  SwaggerModule.setup('docs', app, cleanupOpenApiDoc(openApiDoc));

  await app.listen(port, () => {
    const log = new Logger('NestApplication');
    log.log(`Server is running on port ${port}`);
  });
}
void bootstrap();
