import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { createWinstonLogger } from './common/logger/winston.config';
import { WINSTON_MODULE_NEST_PROVIDER, WinstonModule } from 'nest-winston';
import { ValidationPipe } from '@nestjs/common';
async function bootstrap() {
  const nodeEnv = process.env.NODE_ENV || 'development';

  const winstonLogger = createWinstonLogger(nodeEnv);

  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      instance: winstonLogger,
    }),
  });

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors();
  const config = new DocumentBuilder()
    .setTitle('AI 面试系统 API')
    .setDescription('AI面试系统的API文档')
    .setVersion('1.0.0')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);
  await app.listen(process.env.PORT ?? 3100);
}
bootstrap();
