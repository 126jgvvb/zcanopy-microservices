import { Controller, Logger, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Get('transactions')
  @ApiOperation({ summary: 'Get transactions' })
  async getTransactions(@Query() query: any) {
    this.logger.log(`Get transactions request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToPayment('GetTransactions', query);
  }
}
