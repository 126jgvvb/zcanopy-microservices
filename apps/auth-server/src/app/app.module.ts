import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'zcanopy-secret-key-change-in-production',
      signOptions: { expiresIn: '15m' },
    }),
    ClientsModule.register([
      {
        name: 'ADMIN_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.ADMIN_SERVICE_URL || 'localhost:50053',
          package: 'admin',
          protoPath: require('path').join(__dirname, '../../admin/src/proto/admin.proto'),
        },
      },
      {
        name: 'BROKER_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.BROKER_SERVICE_URL || 'localhost:50054',
          package: 'broker',
          protoPath: require('path').join(__dirname, '../../broker/src/proto/broker.proto'),
        },
      },
    ]),
  ],
  controllers: [AppController, AuthController],
  providers: [AppService, AuthService],
})
export class AppModule {}
