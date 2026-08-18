import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PropertyController } from './property.controller';
import { PropertyService } from './property.service';
import { PropertyEntity } from './entity/property.entity';
import { CustomerSearchEntity } from './entity/customer-search.entity';
import { CustomerPropertyAccessEntity } from './entity/customer-property-access.entity';
import { join } from 'path';

@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot({ isGlobal: true, envFilePath: 'apps/property/.env' }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST') || 'localhost',
        port: parseInt(config.get<string>('DB_PORT') || '5432'),
        username: config.get<string>('DB_USERNAME') || 'rental',
        password: config.get<string>('DB_PASSWORD') || 'rental123',
        database: config.get<string>('DB_DATABASE') || 'rentaldb',
        entities: [PropertyEntity, CustomerSearchEntity, CustomerPropertyAccessEntity],
        synchronize: true,
      }),
    }),
    TypeOrmModule.forFeature([PropertyEntity, CustomerSearchEntity, CustomerPropertyAccessEntity]),
    
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
]),
  ],
  controllers: [AppController, PropertyController],
  providers: [AppService, PropertyService],
})
export class AppModule {}