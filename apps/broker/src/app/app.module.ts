import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BrokerService } from './broker.service';
import { BrokerEntity } from '../entity/broker.entity';
import { PayoutsEntity } from '../entity/payouts.entity';
import { BrokerWalletTransactionEntity } from '../entity/broker-wallet-transaction.entity';
import { BrokerFeedbackEntity } from '../entity/broker-feedback.entity';
import { BrokerFcmTokenEntity } from '../entity/broker-fcm-token.entity';
import {TypeOrmModule} from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule,Transport } from '@nestjs/microservices';
import { OtpStoreService } from './otp/otp-store.service';
import { redisOtpProvider } from './otp/redis-otp.provider';
import { join } from 'path';

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
        database: config.get<string>('DB_DATABASE') || 'broker_db',
        entities: [BrokerEntity, PayoutsEntity, BrokerWalletTransactionEntity, BrokerFeedbackEntity, BrokerFcmTokenEntity],
        synchronize: config.get<string>('DB_SYNCHRONIZE') !== 'false',
        logging: config.get<string>('DB_LOGGING') === 'true',
      }),
    }),
    TypeOrmModule.forFeature([BrokerEntity, PayoutsEntity, BrokerWalletTransactionEntity, BrokerFeedbackEntity, BrokerFcmTokenEntity]),
    ClientsModule.registerAsync([
      {
        name: 'REDIS_CLIENT',
        useFactory: () => ({
          transport: Transport.REDIS,
          options: {
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT) || 6379,
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
            url: process.env.PAYMENT_SERVICE_URL || 'localhost:50051',
            package: 'payment',
            protoPath: join(__dirname, '../../payment/src/proto/payment.proto'),
          },
        }),
      },
      {
        name: 'ADMIN_CLIENT',
        useFactory: () => ({
          transport: Transport.GRPC,
          options: {
            url: process.env.ADMIN_SERVICE_URL || 'localhost:50053',
            package: 'admin',
            protoPath: join(__dirname, '../../admin/src/proto/admin.proto'),
          },
        }),
      },
    ]),
  ],
  controllers: [AppController],
  providers: [AppService, BrokerService, OtpStoreService, redisOtpProvider],
})
export class AppModule {}