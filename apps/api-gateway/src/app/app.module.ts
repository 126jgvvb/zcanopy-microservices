import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth.controller';
import { BrokerController } from './broker.controller';
import { PropertyController } from './property.controller';
import { PaymentController } from './payment.controller';
import { AdminController } from './admin.controller';
import { CustomerController } from './customer.controller';
import { ListingsController } from './listings.controller';
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { EncryptionService } from './encryption/encryption.service';
import { CryptoService } from './encryption/crypto.service';
import { EncryptionInterceptor } from './encryption/encryption.interceptor';
import { EncryptionMiddleware } from './encryption/encryption.middleware';
import { join } from 'path';

/*
const workspaceRoot = (() => {
  try {
    return require('path').resolve(__dirname, '../../../../');
  } catch {
    return process.cwd();
  }
})();
*/

// This bypasses the dist/ folders entirely and points straight to your source directory
const getProtoPath = (fileName: string) => {
  return join(process.cwd(), 'proto', fileName);
};



@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'zcanopy-secret-key-change-in-production',
      signOptions: { expiresIn: '15m' },
    }),
    ClientsModule.register([
      {
        name: 'AUTH_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.AUTH_SERVICE_URL || 'localhost:50050',
          package: 'auth',
          protoPath: getProtoPath('auth.proto'),
        },
      },
      {
        name: 'BROKER_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.BROKER_SERVICE_URL || 'localhost:50051',
          package: 'broker',
          protoPath: getProtoPath('broker.proto'),
        },
      },
      {
        name: 'PROPERTY_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.PROPERTY_SERVICE_URL || 'localhost:50052',
          package: 'property',
          protoPath: getProtoPath('property.proto'),
        },
      },
      {
        name: 'PAYMENT_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.PAYMENT_SERVICE_URL || 'localhost:50053',
          package: 'payment',
          protoPath: getProtoPath('payment.proto'),
        },
      },
      {
        name: 'ADMIN_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.ADMIN_SERVICE_URL || 'localhost:50054',
          package: 'admin',
          protoPath: getProtoPath('admin.proto'),
        },
      },
      {
        name: 'NOTIFICATION_CLIENT',
        transport: Transport.REDIS,
        options: {
          host: process.env.NOTIFICATION_SERVICE_HOST || 'localhost',
          port: Number(process.env.NOTIFICATION_SERVICE_PORT) || 6379,
        },
      },
    ]),
  ],
  controllers: [AppController, AuthController, BrokerController, PropertyController, PaymentController, AdminController, CustomerController, ListingsController],
  providers: [AppService, EncryptionInterceptor, EncryptionMiddleware, ProxyService, JwtAuthGuard, EncryptionService, CryptoService],
})
export class AppModule {}

/*
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'zcanopy-secret-key-change-in-production',
      signOptions: { expiresIn: '15m' },
    }),
    ClientsModule.register([
      {
        name: 'AUTH_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.AUTH_SERVICE_URL || 'localhost:50050',
          package: 'auth',
          protoPath: require('path').join(workspaceRoot, 'apps/auth-server/src/proto/auth.proto'),
        },
      },
      {
        name: 'BROKER_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.BROKER_SERVICE_URL || 'localhost:50051',
          package: 'broker',
          protoPath: require('path').join(workspaceRoot, 'apps/broker/src/proto/broker.proto'),
        },
      },
      {
        name: 'PROPERTY_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.PROPERTY_SERVICE_URL || 'localhost:50052',
          package: 'property',
          protoPath: require('path').join(workspaceRoot, 'apps/property/src/proto/property.proto'),
        },
      },
      {
        name: 'PAYMENT_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.PAYMENT_SERVICE_URL || 'localhost:50053',
          package: 'payment',
          protoPath: require('path').join(workspaceRoot, 'apps/payment/src/proto/payment.proto'),
        },
      },
      {
        name: 'ADMIN_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.ADMIN_SERVICE_URL || 'localhost:50054',
          package: 'admin',
          protoPath: require('path').join(workspaceRoot, 'apps/admin/src/proto/admin.proto'),
        },
      },
      {
        name: 'NOTIFICATION_CLIENT',
        transport: Transport.REDIS,
        options: {
          host: process.env.NOTIFICATION_SERVICE_HOST || 'localhost',
          port: Number(process.env.NOTIFICATION_SERVICE_PORT) || 6379,
        },
      },
    ]),
  ],
  controllers: [AppController, AuthController, BrokerController, PropertyController, PaymentController, AdminController],
  providers: [AppService, ProxyService, JwtAuthGuard, EncryptionService, CryptoService, EncryptionInterceptor],
})
export class AppModule {}
*/