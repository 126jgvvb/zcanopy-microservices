import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { join } from 'path';
import * as crypto from 'crypto';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: 'apps/auth-server/.env' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'venom@1234',
      signOptions: { expiresIn: '15m' },
    }),
    ClientsModule.registerAsync([
      {
        name: 'ADMIN_CLIENT',
        useFactory: () => ({
          transport: Transport.GRPC,
          options: {
            url: process.env.ADMIN_SERVICE_URL || 'localhost:3006',
            package: 'admin.v1',
            protoPath: join(__dirname, './proto/admin.proto'),
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
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AppModule {
  private readonly logger = new Logger(AppModule.name);

  onModuleInit() {
    const secret = process.env.JWT_SECRET || 'zcanopy-secret-key-change-in-production';
    const hash = crypto.createHash('sha256').update(secret).digest('hex').slice(0, 16);
    this.logger.log(`JWT_SECRET configured length=${secret.length}, hash=${hash}, fallback=${!process.env.JWT_SECRET}`);
  }
}
