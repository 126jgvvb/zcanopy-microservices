import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { ClientProxy, ClientGrpc } from '@nestjs/microservices';
import type { ClientGrpc as ClientGrpcType } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    @Inject('BROKER_CLIENT') private readonly brokerClient: ClientGrpcType,
    @Inject('PROPERTY_CLIENT') private readonly propertyClient: ClientGrpcType,
    @Inject('PAYMENT_CLIENT') private readonly paymentClient: ClientGrpcType,
    @Inject('ADMIN_CLIENT') private readonly adminClient: ClientGrpcType,
    @Inject('NOTIFICATION_CLIENT') private readonly notificationClient: ClientProxy,
    @Inject('AUTH_CLIENT') private readonly authClient: ClientGrpcType,
    @Inject('CUSTOMER_CLIENT') private readonly customerClient: ClientGrpcType,
  ) {}

  async forwardToBroker(method: string, data: any) {
    return this.forwardGrpc(this.brokerClient, 'BrokerService', method, data);
  }

  async forwardToProperty(method: string, data: any) {
    return this.forwardGrpc(this.propertyClient, 'PropertyService', method, data);
  }

  async forwardToPayment(method: string, data: any) {
    return this.forwardGrpc(this.paymentClient, 'PaymentService', method, data);
  }

  async forwardToAdmin(method: string, data: any) {
    return this.forwardGrpc(this.adminClient, 'AdminService', method, data);
  }

  async forwardToNotification(method: string, data: any) {
    return this.forwardRedis(this.notificationClient, method, data);
  }

  async forwardToAuth(method: string, data: any) {
    return this.forwardGrpc(this.authClient, 'AuthService', method, data);
  }

  async forwardToCustomer(method: string, data: any) {
    this.logger.log(`Proxy forwarding to CustomerService.${method} with data: ${JSON.stringify(data)}`);
    try {
      const result = await this.forwardGrpc(this.customerClient, 'CustomerService', method, data);
      this.logger.log(`Proxy received from CustomerService.${method}: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to forward to CustomerService.${method}: ${error}`);
      throw new NotFoundException('Service unavailable');
    }
  }

  private async forwardGrpc(
    client: ClientGrpc,
    serviceName: string,
    method: string,
    data: any,
  ) {
    try {
      const service = client.getService<any>(serviceName);
      return await lastValueFrom(service[method](data));
    } catch (error) {
      this.logger.error(`Failed to forward to ${serviceName}.${method}: ${error}`);
      throw new NotFoundException('Service unavailable');
    }
  }

  private async forwardRedis(
    client: ClientProxy,
    method: string,
    data: any,
  ) {
    try {
      return await lastValueFrom(client.send(method, data));
    } catch (error) {
      this.logger.error(`Failed to forward to ${method}: ${error}`);
      throw new NotFoundException('Service unavailable');
    }
  }
}