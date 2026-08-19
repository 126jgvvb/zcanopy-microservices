import { Controller, Logger } from '@nestjs/common';
import { AuthService, LoginResponse, CustomerSessionResponse, ValidateCustomerSessionResponse, GetCustomerSessionResponse, BrokerSessionResponse, ValidateBrokerSessionResponse, GetBrokerSessionResponse } from './auth.service';
import { LoginDto, RefreshTokenDto, BrokerLoginDto, BrokerSetupDto } from './dtos/auth.dto';
import { GrpcMethod } from '@nestjs/microservices';

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @GrpcMethod('AuthService', 'Login')
  async Login(dto: LoginDto): Promise<LoginResponse> {
    this.logger.log(`Login attempt for ${dto.email} as ${dto.type}`);
    return this.authService.login(dto);
  }

  @GrpcMethod('AuthService', 'LoginBroker')
  async LoginBroker(dto: BrokerLoginDto): Promise<any> {
    this.logger.log(`Broker login attempt for code ${dto.brokerCode}`);
    return this.authService.loginBroker(dto);
  }

  @GrpcMethod('AuthService', 'SetupBroker')
  async SetupBroker(dto: BrokerSetupDto): Promise<any> {
    this.logger.log(`Broker account setup for code ${dto.brokerCode}`);
    return this.authService.setupBroker(dto);
  }

  @GrpcMethod('AuthService', 'RefreshToken')
  async Refresh(dto: RefreshTokenDto): Promise<LoginResponse> {
    this.logger.log('Refresh token attempt');
    return this.authService.refreshToken(dto.token);
  }

  @GrpcMethod('AuthService', 'ValidateToken')
  async ValidateToken(dto: { token: string }): Promise<{ valid: boolean; userId: string; email: string; role: string; type: string }> {
    this.logger.log(`ValidateToken attempt`);
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
  async IssueCustomerSession(dto: { deviceId: string; ttlSeconds?: number,sessionId?:string}): Promise<CustomerSessionResponse> {
    if (!dto.deviceId) {
      this.logger.warn(`IssueCustomerSession called without deviceId. Full DTO: ${JSON.stringify(dto)}`);
    }
    if(dto.sessionId){
        this.logger.warn('But the sessionId parameter was found....continuing with it');
        dto.deviceId=dto.sessionId;
      }

    this.logger.log(`Issuing customer session for device ${dto.deviceId || '(missing)'}`);
    return this.authService.createCustomerSession(dto);
  }

  @GrpcMethod('AuthService', 'ValidateCustomerSession')
  async ValidateCustomerSession(dto: { sessionToken: string }): Promise<ValidateCustomerSessionResponse> {
    this.logger.log(`ValidateCustomerSession attempt for token ${dto.sessionToken}`);
    return this.authService.validateCustomerSession(dto.sessionToken);
  }

  @GrpcMethod('AuthService', 'GetCustomerSession')
  async GetCustomerSession(dto: { sessionToken: string }): Promise<GetCustomerSessionResponse> {
    this.logger.log(`GetCustomerSession attempt for token ${dto.sessionToken}`);
    return this.authService.getCustomerSession(dto.sessionToken);
  }

  @GrpcMethod('AuthService', 'UpdateCustomerLocation')
  async UpdateCustomerLocation(dto: { sessionToken: string; lat: number; lng: number }) {
    this.logger.log(`UpdateCustomerLocation for token ${dto.sessionToken}`);
    return this.authService.updateCustomerLocation(dto);
  }

  @GrpcMethod('AuthService', 'RevokeCustomerSession')
  async RevokeCustomerSession(dto: { sessionToken: string }) {
    this.logger.log(`RevokeCustomerSession for token ${dto.sessionToken}`);
    return this.authService.revokeCustomerSession(dto.sessionToken);
  }

  @GrpcMethod('AuthService', 'IssueBrokerSession')
  async IssueBrokerSession(dto: { brokerCode: string; deviceId: string; ttlSeconds?: number }): Promise<BrokerSessionResponse> {
    this.logger.log(`Issuing broker session for broker ${dto.brokerCode} on device ${dto.deviceId || ''}`);
    return this.authService.createBrokerSession(dto);
  }

  @GrpcMethod('AuthService', 'ValidateBrokerSession')
  async ValidateBrokerSession(dto: { sessionToken: string }): Promise<ValidateBrokerSessionResponse> {
    this.logger.log(`ValidateBrokerSession attempt for token ${dto.sessionToken}`);
    return this.authService.validateBrokerSession(dto.sessionToken);
  }

  @GrpcMethod('AuthService', 'GetBrokerSession')
  async GetBrokerSession(dto: { sessionToken: string }): Promise<GetBrokerSessionResponse> {
    this.logger.log(`GetBrokerSession attempt for token ${dto.sessionToken}`);
    return this.authService.getBrokerSession(dto.sessionToken);
  }

  @GrpcMethod('AuthService', 'RevokeBrokerSession')
  async RevokeBrokerSession(dto: { sessionToken: string }) {
    this.logger.log(`RevokeBrokerSession for token ${dto.sessionToken}`);
    return this.authService.revokeBrokerSession(dto.sessionToken);
  }

  @GrpcMethod('AuthService','GetActiveCustomerSessions')
  async GetActiveCustomerSessions(dto:{}): Promise<{ sessions: Array<{ sessionId: string; deviceId: string; createdAt: number; lastActivityAt: number; locationLat?: number; locationLng?: number; locationUpdatedAt?: number; ttlSecondsRemaining?: number }>; total: number }> {
    this.logger.log('GetActiveCustomerSessions request');
    return this.authService.getActiveCustomerSessions();
  }

}



