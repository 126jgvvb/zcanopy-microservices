import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      url: process.env.CUSTOMER_SERVICE_URL || 'localhost:3007',
      package: 'customer.v1',
      protoPath: join(process.cwd(), 'apps/customer/src/proto/customer.proto'),
    },
  });

  await app.listen();
  Logger.log('Customer gRPC microservice is running on localhost:3007');
}

bootstrap();
