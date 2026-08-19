import { Controller, Logger, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

@ApiTags('brokers')
@Controller('broker')
export class BrokerPublicController {
  private readonly logger = new Logger(BrokerPublicController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new broker (public)' })
  async registerBroker(@Body() body: any) {
    this.logger.log(`Public broker register request for ${body.email}`);
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
