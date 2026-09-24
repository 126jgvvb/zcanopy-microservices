/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app/app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { resolve, join } from 'path';
import { existsSync, statSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3004;

  const propertyProtoPath = join(__dirname, './proto/property.proto');
  const resolvedProtoPath = resolve(propertyProtoPath);
  if (!existsSync(resolvedProtoPath)) {
    throw new Error(`Property proto file not found at: ${resolvedProtoPath}`);
  }
  const protoStats = statSync(resolvedProtoPath);
  console.log(`[PropertyMain] Loading property proto from: ${resolvedProtoPath} (size: ${protoStats.size} bytes, modified: ${protoStats.mtime.toISOString()})`);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      host: `0.0.0.0`,
      url: `0.0.0.0:${port}`,
      package: 'property.v1',
      protoPath: propertyProtoPath,
    },
  });

  const httpPort=304;

  await app.startAllMicroservices();
  await app.listen(httpPort);
  Logger.log(
    `🚀 Property service is running on: http://localhost:${httpPort}/${globalPrefix} (gRPC on ${port})`,
  );
}

bootstrap();
