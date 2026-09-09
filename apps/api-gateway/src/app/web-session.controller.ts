import { Controller, Post, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

@ApiTags('web-session')
@Controller('web/session')
export class WebSessionController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('validate')
  @ApiOperation({ summary: 'Validate a web sessionId (broker or customer) from x-session-id header' })
  async validateSession(@Headers('x-session-id') sessionId: string) {
    if (!sessionId) {
      throw new HttpException('x-session-id header is required', HttpStatus.UNAUTHORIZED);
    }

    const brokerResult: any = await this.proxyService.forwardToAuth('ValidateBrokerSession', {
      sessionToken: sessionId,
    });

    if (brokerResult?.valid) {
      return {
        valid: true,
        type: 'broker',
        brokerCode: brokerResult.brokerCode,
        userId: brokerResult.userId,
        email: brokerResult.email,
        deviceId: brokerResult.deviceId,
        expiresAt: brokerResult.expiresAt,
      };
    }

    const customerResult: any = await this.proxyService.forwardToAuth('ValidateCustomerSession', {
      sessionToken: sessionId,
    });

    if (customerResult?.valid) {
      return {
        valid: true,
        type: 'customer',
        userId: customerResult.userId,
        deviceId: customerResult.deviceId,
        expiresAt: customerResult.expiresAt,
      };
    }

    throw new HttpException('Invalid or expired sessionId', HttpStatus.UNAUTHORIZED);
  }
}
