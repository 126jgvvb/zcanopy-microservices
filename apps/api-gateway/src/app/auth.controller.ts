import { Controller, Logger, Post, Body } from '@nestjs/common';
import { ProxyService } from './proxy.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly proxyService: ProxyService) {}

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

  @Post('refresh')
  async refresh(@Body() dto: any) {
    this.logger.log('Refresh token request via gateway');
    return this.proxyService.forwardToAuth('RefreshToken', dto);
  }
}
