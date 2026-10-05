import { Injectable, Logger, NotFoundException, Inject, HttpException, BadRequestException, UnauthorizedException, ForbiddenException, ConflictException, InternalServerErrorException, ServiceUnavailableException, GatewayTimeoutException } from '@nestjs/common';
import { ClientProxy, ClientGrpc } from '@nestjs/microservices';
import type { ClientGrpc as ClientGrpcType } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

// gRPC status codes (google.rpc.Code) mapped to the HTTP status the gateway
// should surface. Without this every downstream failure looked identical to
// the client, so a rejected password was reported as "Service unavailable".
const GRPC_TO_HTTP: Record<number, (message: string) => HttpException> = {
  3: (m) => new BadRequestException(m || 'Invalid request'),
  5: (m) => new NotFoundException(m || 'Not found'),
  6: (m) => new ConflictException(m || 'Already exists'),
  7: (m) => new ForbiddenException(m || 'Forbidden'),
  8: (m) => new HttpException(m || 'Too many requests', 429),
  9: (m) => new BadRequestException(m || 'Request could not be processed'),
  11: (m) => new BadRequestException(m || 'Value out of range'),
  13: (m) => new InternalServerErrorException(m || 'Internal server error'),
  14: (m) => new ServiceUnavailableException(m || 'Service unavailable'),
  16: (m) => new UnauthorizedException(m || 'Unauthorized'),
};

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
    const result = await this.forwardGrpc(this.customerClient, 'CustomerService', method, data);
    this.logger.log(`Proxy received from CustomerService.${method}: ${JSON.stringify(result)}`);
    return result;
  }

  // Downstream services raise Nest HTTP exceptions, which Nest's gRPC layer
  // converts into a status code plus a `details` message. Re-throw that as a
  // matching HTTP exception so clients can tell a bad password (400) apart from
  // an unreachable service (503) or a genuine outage (500).
  private rethrowAsHttp(error: unknown, serviceName: string, method: string): never {
    const code = typeof (error as { code?: unknown })?.code === 'number' ? ((error as { code: number }).code) : undefined;
    const details =
      (error as { details?: unknown })?.details ??
      (error as { message?: unknown })?.message ??
      undefined;
    const message = typeof details === 'string' && details.trim() ? details.trim() : undefined;

    if (code === undefined) {
      this.logger.error(`Failed to forward to ${serviceName}.${method}: ${error}`);
      throw new NotFoundException('Service unavailable');
    }

    if (code === 4) {
      this.logger.error(`Timeout forwarding to ${serviceName}.${method}`);
      throw new GatewayTimeoutException('Upstream service timed out');
    }

    const factory = GRPC_TO_HTTP[code];
    if (!factory) {
      this.logger.error(`Failed to forward to ${serviceName}.${method} (gRPC code ${code}): ${error}`);
      throw new InternalServerErrorException(message ?? 'Request failed');
    }

    this.logger.warn(`${serviceName}.${method} rejected with gRPC code ${code}: ${message ?? 'no detail'}`);
    throw factory(message ?? '');
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
      this.rethrowAsHttp(error, serviceName, method);
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