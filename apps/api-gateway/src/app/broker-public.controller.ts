import { Controller, Logger, Post, Body, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ProxyService } from './proxy.service';

@ApiTags('brokers')
@Controller('broker')
export class BrokerPublicController {
  private readonly logger = new Logger(BrokerPublicController.name);

  constructor(
    private readonly proxyService: ProxyService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Verifies a Google ID token against Google's tokeninfo endpoint and returns
   * the verified profile. Verification always happens here on the server — the
   * client-side decode is only for pre-filling the form.
   */
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

    if (!sub) {
      throw new UnauthorizedException('Google credential is invalid');
    }
    if (expectedAudience && audience !== expectedAudience) {
      this.logger.warn('Google credential audience mismatch');
      throw new UnauthorizedException('Google credential audience mismatch');
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

  @Post('register')
  @ApiOperation({ summary: 'Register a new broker (public)' })
  async registerBroker(@Body() body: any) {
    this.logger.log(`Public broker register request for ${body.email}`);

    // A Google credential may accompany the registration (broker signed up via
    // Google). It is verified server-side and replaced with the verified Google
    // `sub` so the account can be matched at Google sign-in time — the raw ID
    // token is short-lived and never stored.
    if (body?.googleId) {
      const googleProfile = await this.verifyGoogleCredential(String(body.googleId));
      body = { ...body, googleId: googleProfile.sub };
    }

    return this.proxyService.forwardToBroker('RegisterBroker', body);
  }

  @Post('otp/send')
  @ApiOperation({ summary: 'Send OTP to broker email and phone (public)' })
  async sendBrokerOtp(@Body() body: any) {
    this.logger.log(`Public broker OTP send request for ${body.email}`);
    return this.proxyService.forwardToBroker('SendBrokerOtp', body);
  }

  @Post('otp/verify')
  @ApiOperation({ summary: 'Verify broker email and phone OTP (public)' })
  async verifyBrokerOtp(@Body() body: any) {
    this.logger.log(`Public broker OTP verify request for ${body.email}`);
    return this.proxyService.forwardToBroker('VerifyBrokerOtp', body);
  }
}
