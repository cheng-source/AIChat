import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = new DocumentBuilder()
    .setTitle('AI 面试系统 API')
    .setDescription('AI面试系统的API文档')
    .setVersion('1.0.0')
    .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documentFactory);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
