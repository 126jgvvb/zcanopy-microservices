import { Controller, Logger } from '@nestjs/common';
import { AuthService, LoginResponse, CustomerSessionResponse, ValidateCustomerSessionResponse, GetCustomerSessionResponse, BrokerSessionResponse, ValidateBrokerSessionResponse, GetBrokerSessionResponse } from './auth.service';
import { LoginDto, RefreshTokenDto, BrokerLoginDto } from './dtos/auth.dto';
import { GrpcMethod } from '@nestjs/microservices';

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @GrpcMethod('AuthService', 'Login')
  async login(dto: LoginDto): Promise<LoginResponse> {
    this.logger.log(`Login attempt for ${dto.email} as ${dto.type}`);
    return this.authService.login(dto);
  }

  @GrpcMethod('AuthService', 'LoginBroker')
  async loginBroker(dto: BrokerLoginDto): Promise<any> {
    this.logger.log(`Broker login attempt for code ${dto.brokerCode}`);
    return this.authService.loginBroker(dto);
  }

  @GrpcMethod('AuthService', 'RefreshToken')
  async refresh(dto: RefreshTokenDto): Promise<LoginResponse> {
    this.logger.log('Refresh token attempt');
    return this.authService.refreshToken(dto.token);
  }

  @GrpcMethod('AuthService', 'ValidateToken')
  async validateToken(dto: { token: string }): Promise<{ valid: boolean; userId: string; email: string; role: string; type: string }> {
    const payload = await this.authService.validateToken(dto.token);
    if (!payload) {
      return { valid: false, userId: '', email: '', role: '', type: '' };
    }
    return {
      valid: true,
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      type: payload.type,
    };
  }

  @GrpcMethod('AuthService', 'IssueCustomerSession')
  async issueCustomerSession(dto: { deviceId: string; ttlSeconds?: number }): Promise<CustomerSessionResponse> {
    this.logger.log(`Issuing customer session for device ${dto.deviceId || ''}`);
    return this.authService.createCustomerSession(dto);
  }

  @GrpcMethod('AuthService', 'ValidateCustomerSession')
  async validateCustomerSession(dto: { sessionToken: string }): Promise<ValidateCustomerSessionResponse> {
    return this.authService.validateCustomerSession(dto.sessionToken);
  }

  @GrpcMethod('AuthService', 'GetCustomerSession')
  async getCustomerSession(dto: { sessionToken: string }): Promise<GetCustomerSessionResponse> {
    return this.authService.getCustomerSession(dto.sessionToken);
  }

  @GrpcMethod('AuthService', 'UpdateCustomerLocation')
  async updateCustomerLocation(dto: { sessionToken: string; lat: number; lng: number }) {
    return this.authService.updateCustomerLocation(dto);
  }

  @GrpcMethod('AuthService', 'RevokeCustomerSession')
  async revokeCustomerSession(dto: { sessionToken: string }) {
    return this.authService.revokeCustomerSession(dto.sessionToken);
  }

  @GrpcMethod('AuthService', 'IssueBrokerSession')
  async issueBrokerSession(dto: { brokerCode: string; deviceId: string; ttlSeconds?: number }): Promise<BrokerSessionResponse> {
    this.logger.log(`Issuing broker session for broker ${dto.brokerCode} on device ${dto.deviceId || ''}`);
    return this.authService.createBrokerSession(dto);
  }

  @GrpcMethod('AuthService', 'ValidateBrokerSession')
  async validateBrokerSession(dto: { sessionToken: string }): Promise<ValidateBrokerSessionResponse> {
    return this.authService.validateBrokerSession(dto.sessionToken);
  }

  @GrpcMethod('AuthService', 'GetBrokerSession')
  async getBrokerSession(dto: { sessionToken: string }): Promise<GetBrokerSessionResponse> {
    return this.authService.getBrokerSession(dto.sessionToken);
  }

  @GrpcMethod('AuthService', 'RevokeBrokerSession')
  async revokeBrokerSession(dto: { sessionToken: string }) {
    return this.authService.revokeBrokerSession(dto.sessionToken);
  }
}
