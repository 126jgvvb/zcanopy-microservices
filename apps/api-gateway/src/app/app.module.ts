import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth.controller';
import { BrokerController } from './broker.controller';
import { BrokerPublicController } from './broker-public.controller';
import { BrokerSessionController } from './broker-session.controller';
import { PropertyController } from './property.controller';
import { PaymentController } from './payment.controller';
import { AdminController } from './admin.controller';
import { CustomerController } from './customer.controller';
import { ListingsController } from './listings.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { BookingsController } from './bookings.controller';
import { PaymentLegacyController } from './payment-legacy.controller';
import { GateWayController } from './gate-way.controller';
import { NotificationController } from './notification.controller';
import { UsersController } from './auth.controller';
import { PublicController } from './public.controller';
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { EncryptionService } from './encryption/encryption.service';
import { CryptoService } from './encryption/crypto.service';
import { EncryptionInterceptor } from './encryption/encryption.interceptor';
import { EncryptionMiddleware } from './encryption/encryption.middleware';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: 'apps/api-gateway/.env' }),
    HttpModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'zcanopy-secret-key-change-in-production',
      signOptions: { expiresIn: '15m' },
    }),
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
  controllers: [AppController, AuthController, BrokerController, BrokerPublicController, BrokerSessionController, PropertyController, PaymentController, AdminController, CustomerController, ListingsController, SubscriptionsController, BookingsController, PaymentLegacyController, GateWayController, NotificationController, UsersController, PublicController],
  providers: [AppService, EncryptionInterceptor, EncryptionMiddleware, ProxyService, JwtAuthGuard, EncryptionService, CryptoService],
})
export class AppModule {}