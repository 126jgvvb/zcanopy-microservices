import { Controller, Logger, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

/**
 * Session-based broker endpoints used by the mobile app. The broker app
 * authenticates with its `sessionID` (rather than a JWT bearer token), so
 * these routes intentionally live outside the JWT-guarded `BrokerController`.
 */
@ApiTags('brokers-session')
@Controller('brokers')
export class BrokerSessionController {
  private readonly logger = new Logger(BrokerSessionController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Post('logout-user')
  @ApiOperation({ summary: 'Log the broker out and revoke the active session' })
  async logoutBroker(@Body() body: any) {
    return this.proxyService.forwardToBroker('LogoutBroker', {
      brokerCode: body.brokerCode,
      sessionId: body.sessionId,
    });
  }

  @Post('unsubscribe-user/request-otp')
  @ApiOperation({ summary: 'Send a confirmation OTP to the broker email before unsubscribing' })
  async requestUnsubscribeOtp(@Body() body: any) {
    return this.proxyService.forwardToBroker('RequestUnsubscribeOtp', {
      brokerCode: body.brokerCode,
    });
  }

  @Post('unsubscribe-user')
  @ApiOperation({ summary: 'Unsubscribe (deactivate) the broker account after email OTP confirmation' })
  async unsubscribeBroker(@Body() body: any) {
    return this.proxyService.forwardToBroker('UnsubscribeBroker', {
      brokerCode: body.brokerCode,
      password: body.password,
      googleId: body.googleId,
      sessionId: body.sessionId,
      emailOtp: body.emailOtp,
    });
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw broker wallet funds to mobile money' })
  async withdrawBroker(@Body() body: any) {
    return this.proxyService.forwardToBroker('Withdraw', {
      amount: Number(body.amount),
      phoneNumber: body.phoneNumber,
      provider: body.provider,
      payeeName: body.payeeName,
    });
  }
}
