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
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
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
    ClientsModule.register([
      {
        name: 'REDIS_CLIENT',
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT) || 6379,
        },
      },
      {
        name: 'ADMIN_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.ADMIN_SERVICE_URL || 'localhost:50053',
          package: 'admin',
          protoPath: join(__dirname, 'proto/admin.proto'),
        },
      },
    ]),
  ],
  controllers: [AppController, PaymentController],
  providers: [AppService, PaymentService],
})
export class AppModule {}


/*
const workspaceRoot = (() => {
  try {
    return require('path').resolve(__dirname, '../../../../');
  } catch {
    return process.cwd();
  }
})();

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
    ClientsModule.register([
      {
        name: 'REDIS_CLIENT',
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT) || 6379,
        },
      },
      {
        name: 'ADMIN_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.ADMIN_SERVICE_URL || 'localhost:50053',
          package: 'admin',
          protoPath: require('path').join(workspaceRoot, 'apps/admin/src/proto/admin.proto'),
        },
      },
    ]),
  ],
  controllers: [AppController, PaymentController],
  providers: [AppService, PaymentService],
})
export class AppModule {}
*/