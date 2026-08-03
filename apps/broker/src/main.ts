/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app/app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3003;

  //gRDC config
app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.GRPC,
  options: {
    host: `0.0.0.0:${port}`,
    package:"broker",
    protoPath: join(__dirname, '../../broker/src/proto/broker.proto'),
  },
},);


//redis configuration
app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.REDIS,
  options: {
    host: configService.get<string>('REDIS_HOST') || 'localhost',
    port: Number(configService.get<string>('REDIS_PORT') || '6379'),
    password: configService.get<string>('REDIS_PASSWORD') || undefined,
  },
},);


 // app.startAllMicroservices();
  await app.listen(port);
  Logger.log( `Broker Application is running on: http://localhost:${port}/${globalPrefix}`,);
}

bootstrap();
