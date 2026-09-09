import {
  Controller,
  Logger,
  Get,
  Post,
  Body,
  Query,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { lastValueFrom } from 'rxjs';

@ApiTags('payment')
@Controller('payment')
export class PaymentLegacyController {
  private readonly logger = new Logger(PaymentLegacyController.name);
  private readonly iotecBaseUrl = process.env.IOTEC_SERVICE_URL || 'http://localhost:2000';

  constructor(
    private readonly proxyService: ProxyService,
    private readonly httpService: HttpService,
  ) {}

  /*confirmed*/
  @Post('initiate_payment')
  @ApiOperation({ summary: 'Initiate a mobile-money payment' })
  async initiatePayment(@Body() body: any) {
    this.logger.log('Initiate customer payment request via gateway');
    return this.proxyService.forwardToPayment('ProcessCustomerPayment', {
      phoneNumber: body.phoneNumber,
      amount: Number(body.amount) || 0,
      userId: body.userId ?? body.userID,
    });
  }

  @Get('get_transaction_records')//confirmed
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

  @Get('get_payment_status')//confirmed
  @ApiOperation({ summary: 'Get the status of a payment transaction' })
  async getPaymentStatus(@Query('transaction_id') transactionId: string) {
    this.logger.log(`Get payment status for ${transactionId}`);
    return this.proxyService.forwardToPayment('GetTransactions', {
      page: 1,
      limit: 50,
      brokerId: transactionId,
    });
  }

  @Get('access-token') //confirmed
  @ApiOperation({ summary: 'Get iotec access token' })
  async getAccessToken() {
    this.logger.log('Get iotec access token');
    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.iotecBaseUrl}/payment/access-token`),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to get access token: ${error.message}`);
      throw error;
    }
  }
}
