import { Controller, Logger, Post, Body, Get, UseGuards, Res, HttpCode, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Response } from 'express';
import { ProxyService } from './proxy.service';

@ApiTags('web-auth')
@Controller('web/auth')
export class WebAuthController {
  private readonly logger = new Logger(WebAuthController.name);

  constructor(
    private readonly proxyService: ProxyService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Web session login (returns session token)' })
  async webLogin(@Body() body: { email: string; password: string; type: 'admin' | 'broker' | 'customer' }) {
    this.logger.log(`Web auth login attempt for ${body.email}`);
    const authResponse = await this.proxyService.forwardToAuth('Login', {
      email: body.email,
      password: body.password,
      type: body.type || 'broker',
    });

    const payload = {
      sub: authResponse.id,
      email: authResponse.email,
      role: body.type,
      username: authResponse.username,
    };

    const token = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      ...authResponse,
      token,
    };
  }

  @Post('broker/login')
  @ApiOperation({ summary: 'Web broker login by broker code' })
  async webBrokerLogin(@Body() body: { brokerCode: string; password: string; email?: string; deviceId?: string }) {
    this.logger.log(`Web broker login attempt for brokerCode=${body.brokerCode} email=${body.email}`);
    const authResponse = await this.proxyService.forwardToAuth('Login', {
      brokerCode: body.brokerCode,
      password: body.password,
      deviceId: body.deviceId || 'web-dashboard',
      email: body.email,
    });

    const payload = {
      sub: authResponse.id,
      email: authResponse.email,
      role: 'broker',
      username: authResponse.username,
      brokerCode: authResponse.brokerCode,
    };

    const token = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      ...authResponse,
      token,
    };
  }

  @Post('broker/setup')
  @ApiOperation({ summary: 'Web broker account setup' })
  async webBrokerSetup(@Body() body: any) {
    this.logger.log(`Web broker setup for brokerCode=${body.brokerCode}`);
    return this.proxyService.forwardToAuth('SetupBroker', body);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh web session token' })
  async webRefresh(@Body() body: { token: string }) {
    this.logger.log('Web session refresh request');
    const refreshResponse = await this.proxyService.forwardToAuth('RefreshToken', {
      token: body.token,
    });

    const payload = {
      sub: refreshResponse.id,
      email: refreshResponse.email,
      role: refreshResponse.role,
      username: refreshResponse.username,
    };

    const token = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      ...refreshResponse,
      token,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current web session user' })
  async webMe(@Req() req: any) {
    this.logger.log('Web auth me request');
    const user = req.user;
    return {
      id: user?.sub,
      email: user?.email,
      role: user?.role,
      username: user?.username,
      brokerCode: user?.brokerCode,
    };
  }
}
