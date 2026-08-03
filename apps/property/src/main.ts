/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app/app.module';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3004;

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      host: `0.0.0.0:${port}`,
      package: 'property',
      protoPath: join(__dirname, '../../property/src/proto/property.proto'),
    },
  });

  await app.startAllMicroservices();
  await app.listen(port);
  Logger.log(
    `🚀 Property service is running on: http://localhost:${port}/${globalPrefix} (gRPC on ${port})`,
  );
}

bootstrap();
