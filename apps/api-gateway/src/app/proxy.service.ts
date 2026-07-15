import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    @Inject('BROKER_CLIENT') private readonly brokerClient: ClientProxy,
    @Inject('PROPERTY_CLIENT') private readonly propertyClient: ClientProxy,
    @Inject('PAYMENT_CLIENT') private readonly paymentClient: ClientProxy,
    @Inject('ADMIN_CLIENT') private readonly adminClient: ClientProxy,
    @Inject('NOTIFICATION_CLIENT') private readonly notificationClient: ClientProxy,
    @Inject('AUTH_CLIENT') private readonly authClient: ClientProxy,
  ) {}

  async forwardToBroker(method: string, data: any) {
    return this.forward(this.brokerClient, method, data);
  }

  async forwardToProperty(method: string, data: any) {
    return this.forward(this.propertyClient, method, data);
  }

  async forwardToPayment(method: string, data: any) {
    return this.forward(this.paymentClient, method, data);
  }

  async forwardToAdmin(method: string, data: any) {
    return this.forward(this.adminClient, method, data);
  }

  async forwardToNotification(method: string, data: any) {
    return this.forward(this.notificationClient, method, data);
  }

  async forwardToAuth(method: string, data: any) {
    return this.forward(this.authClient, method, data);
  }

  private async forward(client: ClientProxy, method: string, data: any) {
    try {
      return await lastValueFrom(client.send(method, data));
    } catch (error) {
      this.logger.error(`Failed to forward to ${method}: ${error}`);
      throw new NotFoundException('Service unavailable');
    }
  }
}
