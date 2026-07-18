import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
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
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER || 'rental',
      password: process.env.DB_PASSWORD || 'rental123',
      database: process.env.DB_NAME || 'rentaldb',
      entities: [PropertyEntity, CustomerSearchEntity, CustomerPropertyAccessEntity],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([PropertyEntity, CustomerSearchEntity, CustomerPropertyAccessEntity]),
    ClientsModule.register([
      {
        name: 'AUTH_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.AUTH_SERVICE_URL || 'localhost:50055',
          package: 'auth',
          protoPath: join(__dirname, 'proto/auth.proto'),
        },
      },
      {
        name: 'BROKER_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.BROKER_SERVICE_URL || 'localhost:50051',
          package: 'broker',
          protoPath: join(__dirname, 'proto/broker.proto'),
        },
      },
    ]),
  ],
  controllers: [AppController, PropertyController],
  providers: [AppService, PropertyService],
})
export class AppModule {}

/*
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER || 'rental',
      password: process.env.DB_PASSWORD || 'rental123',
      database: process.env.DB_NAME || 'rentaldb',
      entities: [PropertyEntity, CustomerSearchEntity],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([PropertyEntity, CustomerSearchEntity]),
    ClientsModule.register([
      {
        name: 'AUTH_CLIENT',
        transport: Transport.GRPC,
        options: {
          url: process.env.AUTH_SERVICE_URL || 'localhost:50055',
          package: 'auth',
          protoPath: require('path').join(__dirname, '../../auth-server/src/proto/auth.proto'),
        },
      },
    ]),
  ],
  controllers: [AppController, PropertyController],
  providers: [AppService, PropertyService],
})
export class AppModule {}
*/