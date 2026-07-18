import { Controller, Logger, Post, Body, UnauthorizedException } from '@nestjs/common';
import { ProxyService } from './proxy.service';
import { JwtService } from '@nestjs/jwt';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly proxyService: ProxyService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('login')
  async login(@Body() dto: any) {
    this.logger.log('Login request via gateway');
    return this.proxyService.forwardToAuth('Login', { ...dto, type: 'admin' });
  }

  @Post('broker/login')
  async brokerLogin(@Body() dto: any) {
    this.logger.log('Broker login request via gateway');
    return this.proxyService.forwardToAuth('Login', { ...dto, type: 'broker' });
  }

  @Post('broker/setup')
  async brokerSetup(@Body() dto: any) {
    this.logger.log('Broker account setup request via gateway');
    return this.proxyService.forwardToAuth('SetupBroker', dto);
  }

  @Post('refresh')
  async refresh(@Body() dto: any) {
    this.logger.log('Refresh token request via gateway');
    return this.proxyService.forwardToAuth('RefreshToken', dto);
  }

  @Post('dev-login')
  async devLogin(@Body() body: { email: string; password: string }) {
    this.logger.warn(`Dev login attempt for ${body.email}`);
    const accounts = [
      { email: 'superadmin@zcanopy.dev', password: 'superadmin123', role: 'super_admin', username: 'Super Admin' },
      { email: 'admin@zcanopy.dev', password: 'admin123', role: 'admin', username: 'Admin' },
      { email: 'support@zcanopy.dev', password: 'support123', role: 'support', username: 'Support' },
    ];
    const match = accounts.find(
      (a) => a.email === body.email && a.password === body.password,
    );
    if (!match) {
      throw new UnauthorizedException('Invalid dev credentials');
    }
    const payload = {
      sub: `dev-${match.role}-1`,
      email: match.email,
      role: match.role,
    };
    const token = this.jwtService.sign(payload);
    return {
      id: payload.sub,
      username: match.username,
      email: match.email,
      role: match.role,
      token,
    };
  }
}
