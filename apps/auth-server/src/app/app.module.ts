import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'zcanopy-secret-key-change-in-production',
      signOptions: { expiresIn: '15m' },
    }),
    ClientsModule.registerAsync([
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
      {
        name: 'BROKER_CLIENT',
        useFactory: () => ({
          transport: Transport.GRPC,
          options: {
            url: process.env.BROKER_SERVICE_URL || 'localhost:50054',
            package: 'broker',
            protoPath: join(__dirname, '../../broker/src/proto/broker.proto'),
          },
        }),
      },
    ]),
  ],
  controllers: [AppController, AuthController],
  providers: [AppService, AuthService],
})
export class AppModule {}
