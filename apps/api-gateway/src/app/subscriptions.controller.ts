import { Controller, Logger, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  private readonly logger = new Logger(SubscriptionsController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Get('get_packages')
  @ApiOperation({ summary: 'Get available subscription packages/tiers' })
  async getPackages() {
    this.logger.log('Get subscription packages request via gateway');
    return this.proxyService.forwardToBroker('GetAvailableTiers', {});
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Cancel the broker subscription (unsubscribe)' })
  async cancelSubscription(@Body() body: any) {
    this.logger.log('Cancel subscription request via gateway');
    return this.proxyService.forwardToBroker('UnsubscribeBroker', {
      brokerCode: body.brokerCode ?? body.userId,
      password: body.password,
      sessionId: body.sessionId,
    });
  }
}
