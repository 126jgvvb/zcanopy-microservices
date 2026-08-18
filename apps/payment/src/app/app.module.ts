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
    ConfigModule.forRoot({ isGlobal: true, envFilePath: 'apps/payment/.env' }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST') || 'localhost',
        port: parseInt(config.get<string>('DB_PORT') || '5432'),
        username: config.get<string>('DB_USERNAME') || 'postgres',
        password: config.get<string>('DB_PASSWORD') || 'password',
        database: config.get<string>('DB_DATABASE') || 'payment_server',
        extra: config.get<string>('DB_HOST') !== 'localhost'
          ? { ssl: { rejectUnauthorized: false } }
          : {},
        entities: [TransactionEntity],
        synchronize: true,
        logging: true,
      }),
    }),
    TypeOrmModule.forFeature([TransactionEntity]),
    HttpModule,
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
    ]),
  ],
  controllers: [AppController, PaymentController],
  providers: [AppService, PaymentService],
})
export class AppModule {}