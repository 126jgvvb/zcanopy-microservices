import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
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
  
  const configService = app.get(ConfigService);
  const webOrigins = (process.env.WEB_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || webOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS origin ${origin} not allowed by zcanopy`), false);
      }
    },
    credentials: true,
  });
  const port = configService.get<number>('PORT') || 4000;
  await app.listen(port);
  Logger.log(
    `🚀 API Gateway is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
