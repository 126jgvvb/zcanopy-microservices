import { Controller, Logger, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  private readonly logger = new Logger(BookingsController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Get('get_bookings')
  @ApiOperation({ summary: "Get a broker's property bookings (legacy)" })
  async getBookings(@Query('user_id') userId: string) {
    this.logger.log(`Get bookings request for broker ${userId}`);
    return this.proxyService.forwardToProperty('GetBrokerBookings', {
      brokerCode: userId,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get broker bookings by session token' })
  async getBrokerBookings(@Query('sessionToken') sessionToken: string) {
    this.logger.log(`Get broker bookings by session ${sessionToken}`);
    return this.proxyService.forwardToProperty('GetCustomerBookings', {
      sessionToken,
      page: 1,
      limit: 50,
    });
  }
}
