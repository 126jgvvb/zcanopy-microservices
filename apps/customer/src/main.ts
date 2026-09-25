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
  const port = configService.get<number>('PORT') || 3007;

  const customerProtoPath = join(__dirname, './proto/customer.proto');
  const resolvedProtoPath = resolve(customerProtoPath);
  if (!existsSync(resolvedProtoPath)) {
    throw new Error(`Customer proto file not found at: ${resolvedProtoPath}`);
  }
  const protoStats = statSync(resolvedProtoPath);
  console.log(`[CustomerMain] Loading customer proto from: ${resolvedProtoPath} (size: ${protoStats.size} bytes, modified: ${protoStats.mtime.toISOString()})`);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      host: `0.0.0.0`,
      url: `0.0.0.0:${port}`,
      package: 'customer.v1',
      protoPath: customerProtoPath,
    },
  });

  await app.startAllMicroservices();
  await app.listen(port);
  Logger.log(
    `Customer service is running on: http://localhost:${port}/${globalPrefix} (gRPC on ${port})`,
  );
}

bootstrap();
