import { Controller, Get, Query, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

@ApiTags('customer')
@Controller('customer')
export class CustomerController {
  constructor(private readonly proxyService: ProxyService) {}

  private mapSessionId(query: any): any {
    if (query.sessionID && !query.sessionToken) {
      return { ...query, sessionToken: query.sessionID };
    }
    return query;
  }

  @Get('properties')
  @ApiOperation({ summary: 'Get nearby properties for customer' })
  async getCustomerProperties(@Query() query: any) {
    const mapped = this.mapSessionId(query);
    return this.proxyService.forwardToProperty('GetCustomerProperties', mapped);
  }

  @Post('properties/access-payment')
  @ApiOperation({ summary: 'Initiate payment for broker property access' })
  async initiatePropertyAccessPayment(@Body() body: any) {
    if (body.sessionID && !body.sessionToken) {
      body = { ...body, sessionToken: body.sessionID };
    }
    return this.proxyService.forwardToProperty('InitiatePropertyAccessPayment', body);
  }

  @Get('broker-properties')
  @ApiOperation({ summary: 'Get broker properties for authorized customer' })
  async getBrokerPropertiesForCustomer(@Query() query: any) {
    const mapped = this.mapSessionId(query);
    return this.proxyService.forwardToProperty('GetBrokerPropertiesForCustomer', mapped);
  }

  @Post('bookings')
  @ApiOperation({ summary: 'Create customer booking' })
  async createCustomerBooking(@Body() body: any) {
    if (body.sessionID && !body.sessionToken) {
      body = { ...body, sessionToken: body.sessionID };
    }
    return this.proxyService.forwardToProperty('CreateCustomerBooking', body);
  }

  @Get('properties/:id/details')
  @ApiOperation({ summary: 'Get property details for customer' })
  async getPropertyDetailsForCustomer(@Query() query: any) {
    const mapped = this.mapSessionId(query);
    return this.proxyService.forwardToProperty('GetPropertyDetailsForCustomer', mapped);
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Get customer bookings by session' })
  async getCustomerBookings(@Query() query: any) {
    const mapped = this.mapSessionId(query);
    return this.proxyService.forwardToProperty('GetCustomerBookings', mapped);
  }

  @Get('bookings/code/:transactionCode')
  @ApiOperation({ summary: 'Get booking by invoice code' })
  async getBookingByCode(@Param('transactionCode') transactionCode: string) {
    return this.proxyService.forwardToProperty('GetBookingByCode', { transactionCode });
  }

  @Get('bookings/phone')
  @ApiOperation({ summary: 'Get bookings by phone number (for reinstall)' })
  async getBookingsByPhone(@Query() query: any) {
    return this.proxyService.forwardToProperty('GetBookingsByPhone', query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search properties by broker title' })
  async searchPropertiesByBrokerTitle(@Query() query: any) {
    return this.proxyService.forwardToProperty('SearchPropertiesByBrokerTitle', query);
  }
}
