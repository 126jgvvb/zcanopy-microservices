import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { TransactionEntity } from './entity/transaction.entity';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: join(process.cwd(), 'apps/payment/.env') }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('DB_HOST') || 'localhost';
        return {
          type: 'postgres' as const,
          host,
          port: parseInt(config.get<string>('DB_PORT') || '5432'),
          username: config.get<string>('DB_USERNAME') || 'postgres',
          password: config.get<string>('DB_PASSWORD') || 'password',
          database: config.get<string>('DB_DATABASE') || 'payment_server',
          extra: {
            ...(host !== 'localhost' ? { ssl: { rejectUnauthorized: false } } : {}),
            // Keep the pool small: every connection costs memory on the
            // database server, and Railway Postgres has a hard connection cap.
            max: Number(config.get<string>('DB_POOL_MAX') || '5'),
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 15_000,
          },
          entities: [TransactionEntity],
          synchronize: config.get<string>('DB_SYNCHRONIZE') !== 'false',
          // Query logging allocates a string per statement and floods Railway's
          // log pipeline; enable it with DB_LOGGING=true only while debugging.
          logging: config.get<string>('DB_LOGGING') === 'true',
        };
      },
    }),
    TypeOrmModule.forFeature([TransactionEntity]),
    HttpModule,
    ClientsModule.registerAsync([
      {
        name: 'REDIS_CLIENT',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
          const host = config.get<string>('REDIS_HOST') || 'localhost';
          const port = Number(config.get<string>('REDIS_PORT') || '6379');
          const password = config.get<string>('REDIS_PASSWORD') || undefined;
          const db = Number(config.get<string>('REDIS_DB') || '0');
          console.log(`[Redis:module] host=${host} port=${port} db=${db} password=${password ? '*****' : '(none)'}`);
          return {
            transport: Transport.REDIS,
            options: {
              host,
              port,
              password,
              db,
              connectTimeout: 10000,
              retryStrategy: (times) => Math.min(times * 500, 5000),
              maxRetriesPerRequest: 10,
              reconnectOnFailedAttempt: true,
              keepAlive: 60,
            },
          };
        },
      },
      {
        name: 'ADMIN_CLIENT',
        useFactory: () => ({
          transport: Transport.GRPC,
          options: {
            url: process.env.ADMIN_SERVICE_URL || 'localhost:3006',
            package: 'admin.v1',
            protoPath: join(process.cwd(), 'apps/admin/src/proto/admin.proto'),
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
            loader: { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true },
            maxReceiveMessageLength: 16 * 1024 * 1024,
            maxSendMessageLength: 16 * 1024 * 1024,
          },
        }),
      },
    ]),
  ],
  controllers: [AppController, PaymentController],
  providers: [AppService, PaymentService],
})
export class AppModule {}