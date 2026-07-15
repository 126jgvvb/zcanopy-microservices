import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { EncryptionMiddleware } from './app/encryption/encryption.middleware';
import { EncryptionInterceptor } from './app/encryption/encryption.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  
  const encryptionMiddleware = app.get(EncryptionMiddleware);
  app.use(encryptionMiddleware.use.bind(encryptionMiddleware));
  
  const encryptionInterceptor = app.get(EncryptionInterceptor);
  app.useGlobalInterceptors(encryptionInterceptor);
  
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });
  const port = process.env.PORT || 4000;
  await app.listen(port);
  Logger.log(
    `🚀 API Gateway is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
