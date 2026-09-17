import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CustomerController } from './customer.controller';
import { CustomerGrpcController } from './customer-grpc.controller';
import { CustomerService } from './customer.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CustomerEntity } from './entity/customer.entity';
import { CustomerOtpEntity } from './entity/customer-otp.entity';
import { CustomerMessageEntity } from './entity/customer-message.entity';
import { CustomerNotificationEntity } from './entity/customer-notification.entity';
import { CustomerSearchEntity } from './entity/customer-search.entity';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: 'apps/customer/.env' }),
    HttpModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'zcanopy-secret-key-change-in-production',
      signOptions: { expiresIn: '15m' },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST') || 'localhost',
        port: parseInt(config.get<string>('DB_PORT') || '5432'),
        username: config.get<string>('DB_USERNAME') || 'postgres',
        password: config.get<string>('DB_PASSWORD') || 'password',
        database: config.get<string>('DB_DATABASE') || 'customer_db',
        extra: config.get<string>('DB_HOST') !== 'localhost' ? { ssl: { rejectUnauthorized: false } } : {},
        entities: [CustomerEntity, CustomerOtpEntity, CustomerMessageEntity, CustomerNotificationEntity, CustomerSearchEntity],
        synchronize: true,
        logging: true,
      }),
    }),
    TypeOrmModule.forFeature([CustomerEntity, CustomerOtpEntity, CustomerMessageEntity, CustomerNotificationEntity, CustomerSearchEntity]),
    ClientsModule.registerAsync([
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
        name: 'NOTIFICATION_CLIENT',
        useFactory: () => ({
          transport: Transport.REDIS,
          options: {
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            retryAttempts: 10,
            retryDelay: 3000,
          },
        }),
      },
    ]),
  ],
  controllers: [AppController, CustomerController, CustomerGrpcController],
  providers: [AppService, CustomerService, JwtAuthGuard],
})
export class AppModule {}
