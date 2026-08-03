import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth.controller';
import { BrokerController } from './broker.controller';
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
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { EncryptionService } from './encryption/encryption.service';
import { CryptoService } from './encryption/crypto.service';
import { EncryptionInterceptor } from './encryption/encryption.interceptor';
import { EncryptionMiddleware } from './encryption/encryption.middleware';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
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
            url: process.env.AUTH_SERVICE_URL || 'localhost:50050',
            package: 'auth',
            protoPath: join(__dirname, '../../auth-server/src/proto/auth.proto'),
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
        name: 'ADMIN_CLIENT',
        useFactory: () => ({
          transport: Transport.GRPC,
          options: {
            url: process.env.ADMIN_SERVICE_URL || 'localhost:50054',
            package: 'admin',
            protoPath: join(__dirname, '../../admin/src/proto/admin.proto'),
          },
        }),
      },
      {
        name: 'NOTIFICATION_CLIENT',
        useFactory: () => ({
          transport: Transport.REDIS,
          options: {
            host: process.env.NOTIFICATION_SERVICE_HOST || 'localhost',
            port: Number(process.env.NOTIFICATION_SERVICE_PORT) || 6379,
          },
        }),
      },
    ]),
  ],
  controllers: [AppController, AuthController, BrokerController, BrokerSessionController, PropertyController, PaymentController, AdminController, CustomerController, ListingsController, SubscriptionsController, BookingsController, PaymentLegacyController, GateWayController, NotificationController, UsersController],
  providers: [AppService, EncryptionInterceptor, EncryptionMiddleware, ProxyService, JwtAuthGuard, EncryptionService, CryptoService],
})
export class AppModule {}