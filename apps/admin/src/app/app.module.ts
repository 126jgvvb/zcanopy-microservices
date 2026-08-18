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
    ConfigModule.forRoot({ isGlobal: true, envFilePath: 'apps/admin/.env' }),
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
            url: process.env.BROKER_SERVICE_URL || 'localhost:3003',
            package: 'broker.v1',
            protoPath: join(process.cwd(), 'apps/broker/src/proto/broker.proto'),
          },
        }),
      },
      {
        name: 'PROPERTY_CLIENT',
        useFactory: () => ({
          transport: Transport.GRPC,
          options: {
            url: process.env.PROPERTY_SERVICE_URL || 'localhost:3004',
            package: 'property.v1',
            protoPath: join(process.cwd(), 'apps/property/src/proto/property.proto'),
          },
        }),
      },
      {
        name: 'PAYMENT_CLIENT',
        useFactory: () => ({
          transport: Transport.GRPC,
          options: {
            url: process.env.PAYMENT_SERVICE_URL || 'localhost:3005',
            package: 'payment.v1',
            protoPath: join(process.cwd(), 'apps/payment/src/proto/payment.proto'),
          },
        }),
      },
      {
        name: 'AUTH_CLIENT',
        useFactory: () => ({
          transport: Transport.GRPC,
          options: {
            url: process.env.AUTH_SERVICE_URL || 'localhost:3002',
            package: 'auth.v1',
            protoPath: join(process.cwd(), 'apps/auth-server/src/proto/auth.proto'),
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