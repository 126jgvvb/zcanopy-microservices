import { Controller, Logger, Post, Body, Get, UseGuards, Res, HttpCode, Req, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { HttpService } from '@nestjs/axios';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { ProxyService } from './proxy.service';

@ApiTags('web-auth')
@Controller('web/auth')
export class WebAuthController {
  private readonly logger = new Logger(WebAuthController.name);

  constructor(
    private readonly proxyService: ProxyService,
    private readonly jwtService: JwtService,
    private readonly httpService: HttpService,
  ) {}

  private async verifyGoogleCredential(credential: string): Promise<{ sub: string; email?: string; name?: string }> {
    let response;
    try {
      response = await firstValueFrom(
        this.httpService.get('https://oauth2.googleapis.com/tokeninfo', {
          params: { id_token: credential },
        }),
      );
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      this.logger.error(`Google credential verification request failed (status=${status})`);
      throw new UnauthorizedException('Google credential could not be verified');
    }

    const data = (response?.data || {}) as Record<string, unknown>;
    const sub = typeof data.sub === 'string' ? data.sub : '';
    const audience = typeof data.aud === 'string' ? data.aud : '';
    const expiresAt = Number(data.exp || 0);
    const expectedAudience = process.env.GOOGLE_CLIENT_ID || '';

    this.logger.log(
      `Google credential verified: sub=${sub} aud=${audience} expiresAt=${expiresAt}`,
    );

    if (!sub) {
      throw new UnauthorizedException('Google credential is missing a subject id');
    }

    if (expectedAudience && audience && audience !== expectedAudience) {
      this.logger.warn(`Google credential audience mismatch: expected=${expectedAudience} got=${audience}`);
      throw new UnauthorizedException('Google credential was issued for a different application');
    } else if (!expectedAudience) {
      this.logger.warn(
        'GOOGLE_CLIENT_ID is not configured on the gateway, so the Google credential audience check is being skipped. Set it to the OAuth client id used by the dashboard.',
      );
    }

    if (expiresAt && expiresAt * 1000 < Date.now()) {
      throw new UnauthorizedException('Google credential has expired');
    }

    return {
      sub,
      email: typeof data.email === 'string' ? data.email : undefined,
      name: typeof data.name === 'string' ? data.name : undefined,
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Web session login (returns session token)' })
  async webLogin(@Body() body: { email: string; password: string; type: 'admin' | 'broker' | 'customer' }) {
    this.logger.log(`Web auth login attempt for ${body.email}`);
    const authResponse = await this.proxyService.forwardToAuth('Login', {
      email: body.email,
      password: body.password,
      type: body.type || 'broker',
    });

    const roleParts = (authResponse.role || '').split(',');
    const role = roleParts[0];
    const brokerCodeFromRole = roleParts[1] || '';
    const payload = {
      sub: authResponse.id,
      email: authResponse.email,
      role,
      username: authResponse.username,
      brokerCode: authResponse.brokerCode || brokerCodeFromRole,
    };

    this.logger.log(`Web auth login payload: ${JSON.stringify(payload)} and authResponse: ${JSON.stringify(authResponse)}`);

    const token = this.jwtService.sign(payload, { expiresIn: '7d' });

    this.logger.log(`Web auth login: web token length=${token.length}`);
   
    return {
      token,
      id: authResponse.id,
      email: authResponse.email,
      username: authResponse.username,
      role,
      type: body.type,
      brokerCode: authResponse.brokerCode || brokerCodeFromRole,
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

    this.logger.log(`Web broker login: web token length=${token.length}`);

    return {
      token,
      id: authResponse.id,
      email: authResponse.email,
      username: authResponse.username,
      role: 'broker',
      type: 'broker',
      brokerCode: authResponse.brokerCode,
    };
  }

  @Post('broker/google')
  @ApiOperation({ summary: 'Web broker Google sign-in' })
  async webBrokerGoogleLogin(@Body() body: { googleId: string; deviceId?: string }) {
    this.logger.log('Web broker Google login request');

    if (!body?.googleId) {
      throw new BadRequestException('googleId (Google credential) is required');
    }

    const googleProfile = await this.verifyGoogleCredential(body.googleId);

    const authResponse = await this.proxyService.forwardToAuth('LoginBrokerGoogle', {
      googleId: googleProfile.sub,
      deviceId: body.deviceId || 'web-dashboard',
    });

    const payload = {
      sub: authResponse.id,
      email: authResponse.email,
      role: 'broker',
      username: authResponse.username,
      brokerCode: authResponse.brokerCode,
    };

    const token = this.jwtService.sign(payload, { expiresIn: '7d' });

    this.logger.log(`Web broker Google login: web token length=${token.length}`);

    return {
      token,
      id: authResponse.id,
      email: authResponse.email,
      username: authResponse.username,
      role: 'broker',
      type: 'broker',
      brokerCode: authResponse.brokerCode,
    };
  }

  @Post('broker/email-login')
  @ApiOperation({ summary: 'Web broker login by email and password' })
  async webBrokerEmailLogin(@Body() body: { email: string; password: string; deviceId?: string }) {
    this.logger.log(`Web broker email login attempt for ${body.email}`);
    const authResponse = await this.proxyService.forwardToAuth('Login', {
      email: body.email,
      password: body.password,
      deviceId: body.deviceId || 'web-dashboard',
      type: 'broker',
    });

    const payload = {
      sub: authResponse.id,
      email: authResponse.email,
      role: 'broker',
      username: authResponse.username,
      brokerCode: authResponse.brokerCode,
    };

    const token = this.jwtService.sign(payload, { expiresIn: '7d' });

    this.logger.log(`Web broker email login: web token length=${token.length}`);

    return {
      token,
      id: authResponse.id,
      email: authResponse.email,
      username: authResponse.username,
      role: 'broker',
      type: 'broker',
      brokerCode: authResponse.brokerCode,
    };
  }

  @Post('broker/setup')
  @ApiOperation({ summary: 'Web broker account setup' })
  async webBrokerSetup(@Body() body: any) {
    this.logger.log(`Web broker setup for brokerCode=${body.brokerCode}`);

    const deviceId = body.deviceId || '';
    const brokerBrandName = body.brokerBrandName || '';
    if (brokerBrandName && !deviceId.includes(',')) {
      body.deviceId = `${deviceId},${brokerBrandName}`;
    }

    return this.proxyService.forwardToAuth('SetupBroker', body);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh web session token' })
  async webRefresh(@Body() body: { token: string }) {
    this.logger.log('Web session refresh request');
    const refreshResponse = await this.proxyService.forwardToAuth('RefreshToken', {
      token: body.token,
    });

    const roleParts = (refreshResponse.role || '').split(',');
    const role = roleParts[0];
    const brokerCodeFromRole = roleParts[1] || '';
    const payload = {
      sub: refreshResponse.id,
      email: refreshResponse.email,
      role,
      username: refreshResponse.username,
      brokerCode: refreshResponse.brokerCode || brokerCodeFromRole,
    };

    const token = this.jwtService.sign(payload, { expiresIn: '7d' });

    this.logger.log(`Web refresh: web token length=${token.length}`);

    return {
      token,
      id: refreshResponse.id,
      email: refreshResponse.email,
      username: refreshResponse.username,
      role,
      type: refreshResponse.type,
      brokerCode: refreshResponse.brokerCode || brokerCodeFromRole,
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
