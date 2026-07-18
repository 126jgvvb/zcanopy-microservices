import { Controller, Logger, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  private readonly logger = new Logger(BookingsController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Get('get_bookings')
  @ApiOperation({ summary: "Get a broker's property bookings" })
  async getBookings(@Query('user_id') userId: string) {
    this.logger.log(`Get bookings request for broker ${userId}`);
    return this.proxyService.forwardToProperty('GetBrokerBookings', {
      brokerCode: userId,
    });
  }
}
