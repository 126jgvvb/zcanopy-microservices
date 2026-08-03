/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3001;

  // Redis transport: receives OTP delivery events emitted by other services.
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.REDIS,
    options: {
      host: configService.get<string>('REDIS_HOST') || 'localhost',
      port: Number(configService.get<string>('REDIS_PORT') || '6379'),
      password: configService.get<string>('REDIS_PASSWORD') || undefined,
    },
  });

  await app.startAllMicroservices();
  await app.listen(port);
  Logger.log(
    `🚀 Notification service is running on: http://localhost:${port}/${globalPrefix} (listening for OTP events over Redis)`,
  );
}

bootstrap();
