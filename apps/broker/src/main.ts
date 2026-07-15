/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3000;

  //gRDC config
app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.GRPC,
  options: {
    host: `0.0.0.0:${port}`,
    package:"broker",
    protoPath: join(__dirname, 'proto/broker.proto'),
  },
},);


//redis configuration
app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.REDIS,
  options: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  },
},);


 // app.startAllMicroservices();
  await app.listen(port);
  Logger.log( `Broker Application is running on: http://localhost:${port}/${globalPrefix}`,);
}

bootstrap();
