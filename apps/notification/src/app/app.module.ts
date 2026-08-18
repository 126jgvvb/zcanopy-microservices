import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OtpNotificationController } from './otp/otp-notification.controller';
import { NotificationService } from './otp/notification.service';
import { NotificationEntity } from './entitty/notification.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: 'apps/notification/.env' }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST') || 'localhost',
        port: parseInt(config.get<string>('DB_PORT') || '5432'),
        username: config.get<string>('DB_USERNAME') || 'postgres',
        password: config.get<string>('DB_PASSWORD') || 'password',
        database: config.get<string>('DB_DATABASE') || 'notification_db',
        entities: [NotificationEntity],
        synchronize: config.get<string>('DB_SYNCHRONIZE') !== 'false',
        logging: config.get<string>('DB_LOGGING') === 'true',
      }),
    }),
    TypeOrmModule.forFeature([NotificationEntity]),
    ClientsModule.registerAsync([
      {
        name: 'REDIS_CLIENT',
        transport: Transport.REDIS,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          host: config.get<string>('REDIS_HOST') || 'localhost',
          port: Number(config.get<string>('REDIS_PORT') || '6379'),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        }),
      },
    ]),
    HttpModule,
  ],
  controllers: [AppController, OtpNotificationController],
  providers: [AppService, NotificationService],
})
export class AppModule {}
