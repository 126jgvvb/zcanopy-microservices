import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminController } from './admin.controller';
import { AdminService, REDIS_CLIENT_PROVIDER } from './admin.service';
import { DashaordEntity } from '../entity/dashboard.entity';
import { AdminEntity } from '../entity/admin.entity';
import { InvitationCodeEntity } from '../entity/invitation-code.entity';
import { LogEntity } from '../entity/log.entity';
import { AdminMessageEntity } from '../entity/admin-message.entity';
import { join } from 'path';
import Redis from 'ioredis';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST') || 'localhost',
        port: parseInt(config.get<string>('DB_PORT') || '5432'),
        username: config.get<string>('DB_USERNAME') || 'postgres',
        password: config.get<string>('DB_PASSWORD') || 'password',
        database: config.get<string>('DB_DATABASE') || 'admin_db',
        entities: [DashaordEntity, AdminEntity, InvitationCodeEntity, LogEntity, AdminMessageEntity],
        synchronize: config.get<string>('DB_SYNCHRONIZE') !== 'false',
        logging: config.get<string>('DB_LOGGING') === 'true',
      }),
    }),
    TypeOrmModule.forFeature([DashaordEntity, AdminEntity, InvitationCodeEntity, LogEntity, AdminMessageEntity]),
    ClientsModule.registerAsync([
      {
        name: 'REDIS_CLIENT',
        useFactory: () => ({
          transport: Transport.REDIS,
          options: {
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
          },
        }),
      },
      {
        name: 'BROKER_CLIENT',
        useFactory: () => ({
          transport: Transport.GRPC,
          options: {
            url: process.env.BROKER_SERVICE_URL || 'localhost:50051',
            package: 'broker',
            protoPath: join(__dirname, '../../broker/src/proto/broker.proto'),
          },
        }),
      },
      {
        name: 'PROPERTY_CLIENT',
        useFactory: () => ({
          transport: Transport.GRPC,
          options: {
            url: process.env.PROPERTY_SERVICE_URL || 'localhost:50052',
            package: 'property',
            protoPath: join(__dirname, '../../property/src/proto/property.proto'),
          },
        }),
      },
      {
        name: 'PAYMENT_CLIENT',
        useFactory: () => ({
          transport: Transport.GRPC,
          options: {
            url: process.env.PAYMENT_SERVICE_URL || 'localhost:50053',
            package: 'payment',
            protoPath: join(__dirname, '../../payment/src/proto/payment.proto'),
          },
        }),
      },
      {
        name: 'AUTH_CLIENT',
        useFactory: () => ({
          transport: Transport.GRPC,
          options: {
            url: process.env.AUTH_SERVICE_URL || 'localhost:50050',
            package: 'auth',
            protoPath: join(__dirname, '../../auth-server/src/proto/auth.proto'),
          },
        }),
      },
    ]),
  ],
  controllers: [AppController, AdminController],
  providers: [
    AppService,
    AdminService,
    {
      provide: REDIS_CLIENT_PROVIDER,
      useFactory: () =>
        new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
        }),
    },
  ],
})
export class AppModule {}