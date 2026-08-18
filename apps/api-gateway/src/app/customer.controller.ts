import { Controller, Logger, Get, Query, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

@ApiTags('customer')
@Controller('customer')
export class CustomerController {
  private readonly logger = new Logger(CustomerController.name);

  constructor(private readonly proxyService: ProxyService) {}

  private mapSessionId(query: any): any {
    if (query.sessionID && !query.sessionToken) {
      return { ...query, sessionToken: query.sessionID };
    }
    return query;
  }

  @Post('session')
  @ApiOperation({ summary: 'Issue an anonymous customer session (no login required)' })
  async issueCustomerSession(@Body() body: any) {
    const deviceId = body?.deviceId ?? body?.device_id ?? body?.deviceID ?? '';
    this.logger.log(`Issue customer session request for device ${deviceId}`);
    return this.proxyService.forwardToAuth('IssueCustomerSession', {
      deviceId,
      ttlSeconds: body?.ttlSeconds,
    });
  }

  @Get('properties') //confirmed
  @ApiOperation({ summary: 'Get nearby properties for customer' })
  async getCustomerProperties(@Query() query: any) {
    const mapped = this.mapSessionId(query);
    this.logger.log(`Get customer properties request`);
    return this.proxyService.forwardToProperty('GetCustomerProperties', mapped);
  }

  @Post('properties/access-payment')//confirmed
  @ApiOperation({ summary: 'Initiate payment for broker property access' })
  async initiatePropertyAccessPayment(@Body() body: any) {
    if (body.sessionID && !body.sessionToken) {
      body = { ...body, sessionToken: body.sessionID };
    }
    this.logger.log(`Initiate property access payment for broker ${body.brokerCode}`);
    return this.proxyService.forwardToProperty('InitiatePropertyAccessPayment', body);
  }

  @Get('broker-properties') //confirmed
  @ApiOperation({ summary: 'Get broker properties for authorized customer' })
  async getBrokerPropertiesForCustomer(@Query() query: any) {
    const mapped = this.mapSessionId(query);
    this.logger.log(`Get broker properties for customer request`);
    return this.proxyService.forwardToProperty('GetBrokerPropertiesForCustomer', mapped);
  }

  @Post('bookings') //confirmed
  @ApiOperation({ summary: 'Create customer booking' })
  async createCustomerBooking(@Body() body: any) {
    if (body.sessionID && !body.sessionToken) {
      body = { ...body, sessionToken: body.sessionID };
    }
    this.logger.log(`Create customer booking request for property ${body.propertyId}`);
    return this.proxyService.forwardToProperty('CreateCustomerBooking', body);
  }

  @Post('bookings/retrieve')//confirmed
  @ApiOperation({ summary: 'Retrieve booking by code and phone' })
  async retrieveBooking(@Body() body: any) {
    if (body.code) body.transactionCode = body.code;
    if (body.phoneNumber) body.customerPhone = body.phoneNumber;
    this.logger.log(`Retrieve booking request for code=${body.transactionCode ?? body.code}`);
    return this.proxyService.forwardToProperty('GetBookingByCode', body);
  }

  @Post('payments/retrieve')//confirmed
  @ApiOperation({ summary: 'Retrieve payment by code and phone' })
  async retrievePayment(@Body() body: any) {
    this.logger.log(`Retrieve payment request for broker ${body.code}`);
    return this.proxyService.forwardToPayment('GetTransactions', {
      page: 1,
      limit: 10,
      brokerId: body.code,
    });
  }

  @Get('properties/:id/details') //confirmed
  @ApiOperation({ summary: 'Get property details for customer' })
  async getPropertyDetailsForCustomer(@Query() query: any) {
    const mapped = this.mapSessionId(query);
    this.logger.log(`Get property details request for property ${query.propertyId} and after mapping: ${JSON.stringify(mapped)}`);
    return this.proxyService.forwardToProperty('GetPropertyDetailsForCustomer', mapped);
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Get customer bookings by session' })
  async getCustomerBookings(@Query() query: any) {
    const mapped = this.mapSessionId(query);
    this.logger.log(`Get customer bookings request`);
    return this.proxyService.forwardToProperty('GetCustomerBookings', mapped);
  }

  @Get('bookings/code/:transactionCode')
  @ApiOperation({ summary: 'Get booking by invoice code' })
  async getBookingByCode(@Param('transactionCode') transactionCode: string) {
    this.logger.log(`Get booking by code request for ${transactionCode}`);
    return this.proxyService.forwardToProperty('GetBookingByCode', { transactionCode });
  }

  @Get('bookings/phone')
  @ApiOperation({ summary: 'Get bookings by phone number (for reinstall)' })
  async getBookingsByPhone(@Query() query: any) {
    this.logger.log(`Get bookings by phone request for ${query.customerPhone}`);
    return this.proxyService.forwardToProperty('GetBookingsByPhone', query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search properties by broker title' })
  async searchPropertiesByBrokerTitle(@Query() query: any) {
    this.logger.log(`Search properties by broker title request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToProperty('SearchPropertiesByBrokerTitle', query);
  }
}
