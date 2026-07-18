import {
  Controller,
  Logger,
  Get,
  Post,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

@ApiTags('payment')
@Controller('payment')
export class PaymentLegacyController {
  private readonly logger = new Logger(PaymentLegacyController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Post('initiate_payment')
  @ApiOperation({ summary: 'Initiate a mobile-money payment' })
  async initiatePayment(@Body() body: any) {
    this.logger.log('Initiate payment request via gateway');
    return this.proxyService.forwardToPayment('ProcessSubscriptionPayment', {
      phoneNumber: body.phoneNumber,
      tier: body.tier,
      amount: Number(body.amount) || 0,
      brokerId: body.userId ?? body.brokerId,
      brokerCode: body.brokerCode,
    });
  }

  @Get('get_transaction_records')
  @ApiOperation({ summary: "Get a user's transaction records" })
  async getTransactionRecords(
    @Query('user_id') userId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    this.logger.log(`Get transaction records for ${userId}`);
    return this.proxyService.forwardToPayment('GetTransactions', {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      brokerId: userId,
    });
  }

  @Get('get_payment_status')
  @ApiOperation({ summary: 'Get the status of a payment transaction' })
  async getPaymentStatus(@Query('transaction_id') transactionId: string) {
    this.logger.log(`Get payment status for ${transactionId}`);
    return this.proxyService.forwardToPayment('GetTransactions', {
      page: 1,
      limit: 50,
      brokerId: transactionId,
    });
  }
}
