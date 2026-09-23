import { Controller, Logger, Get, Query, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('customer')
@Controller('customer')
export class CustomerController {
  private readonly logger = new Logger(CustomerController.name);

  constructor(private readonly proxyService: ProxyService) {}

  private getSessionToken(req: any): string {
    return req?.headers?.['x-session-id'] || req?.session?.sessionId || '';
  }

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
  async getCustomerProperties(@Query() query: any, @Req() req: any) {
    const sessionToken = this.getSessionToken(req);
    this.logger.log(`Get customer properties request sessionId=${sessionToken}`);
    return this.proxyService.forwardToProperty('GetCustomerProperties', {
      sessionToken,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 12,
      lat: query.lat ? Number(query.lat) : undefined,
      lng: query.lng ? Number(query.lng) : undefined,
      radiusKm: query.radiusKm ? Number(query.radiusKm) : undefined,
      propertyType: query.propertyType,
    });
  }

  @Post('properties/access-payment')//confirmed
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Initiate payment for broker property access' })
  async initiatePropertyAccessPayment(@Req() req: any, @Body() body: any) {
    const customerId = req.user?.customerId;
    this.logger.log(`Initiate property access payment for customer=${customerId} broker=${body.brokerCode}`);
    return this.proxyService.forwardToProperty('CreateCustomerBooking', {
      customerId,
      propertyId: body.propertyId,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      customerEmail: body.customerEmail,
      date: body.date || new Date().toISOString(),
      amount: body.amount,
      reason: body.reason || 'property_access',
      status: body.status || 'pending',
    });
  }

  @Get('broker-properties') //confirmed
  @ApiOperation({ summary: 'Get broker properties for authorized customer' })
  async getBrokerPropertiesForCustomer(@Query() query: any, @Req() req: any) {
    const sessionToken = this.getSessionToken(req);
    this.logger.log(`Get broker properties for customer request sessionId=${sessionToken}`);
    return this.proxyService.forwardToProperty('GetBrokerPropertiesForCustomer', {
      sessionToken,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 12,
      brokerCode: query.brokerCode,
    });
  }

  @Post('bookings') //confirmed
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create customer booking' })
  async createCustomerBooking(@Req() req: any, @Body() body: any) {
    const customerId = req.user?.customerId;
    this.logger.log(`Create customer booking request for customer=${customerId} property=${body.propertyId}`);
    return this.proxyService.forwardToProperty('CreateCustomerBooking', {
      customerId,
      propertyId: body.propertyId,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      customerEmail: body.customerEmail,
      date: body.date || new Date().toISOString(),
      amount: body.amount,
      reason: body.reason || 'property_access',
      status: body.status || 'pending',
    });
  }

  @Post('bookings/retrieve')//confirmed
  @ApiOperation({ summary: 'Retrieve booking by transaction code and phone' })
  async retrieveBooking(@Body() body: any) {
    if (body.code) body.transactionCode = body.code;
    if (body.phoneNumber) body.customerPhone = body.phoneNumber;
    this.logger.log(`Retrieve booking request for code=${body.transactionCode ?? body.code}`);
    return this.proxyService.forwardToProperty('GetBookingByCode', body);
  }

  @Post('bookings/retrieve-by-code')
  @ApiOperation({ summary: 'Retrieve booking by 6-digit booking code and phone number' })
  async retrieveBookingByCode(@Body() body: any) {
    this.logger.log(`Retrieve booking by booking code request code=${body.bookingCode} phone=${body.customerPhone}`);
    return this.proxyService.forwardToProperty('GetBookingByBookingCode', body);
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

  @Get('properties/details') //confirmed
  @ApiOperation({ summary: 'Get property details for customer' })
  async getPropertyDetailsForCustomer(@Query() query: any, @Req() req: any) {
    const sessionToken = this.getSessionToken(req);
    this.logger.log(`Get property details request for property ${query.propertyId} and sessionId=${sessionToken}`);
    return this.proxyService.forwardToProperty('GetPropertyDetailsForCustomer', {
      sessionToken,
      propertyId: query.propertyId,
    });
  }

  @Get('bookings')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer bookings by session' })
  async getCustomerBookings(@Req() req: any, @Query() query: any) {
    const customerId = req.user?.customerId;
    this.logger.log(`Get customer bookings request for customer=${customerId}`);
    return this.proxyService.forwardToProperty('GetCustomerBookings', {
      customerId,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 10,
    });
  }

  @Get('bookings/code/:transactionCode')
  @ApiOperation({ summary: 'Get booking by invoice code' })
  async getBookingByCode(@Param('transactionCode') transactionCode: string) {
    this.logger.log(`Get booking by code request for ${transactionCode}`);
    return this.proxyService.forwardToProperty('GetBookingByCode', { transactionCode });
  }

  @Get('bookings/phone')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get bookings by phone number (for reinstall)' })
  async getBookingsByPhone(@Req() req: any, @Query() query: any) {
    const customerId = req.user?.customerId;
    this.logger.log(`Get bookings by phone request for customer=${customerId} phone=${query.customerPhone}`);
    return this.proxyService.forwardToProperty('GetBookingsByPhone', {
      customerPhone: query.customerPhone,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 10,
    });
  }

  @Get('search')
  @ApiOperation({ summary: 'Search properties by broker title' })
  async searchPropertiesByBrokerTitle(@Query() query: any, @Req() req: any) {
    this.logger.log(`Search properties by broker title request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToProperty('SearchProperties', {
      query: query.q || '',
      sessionToken: this.getSessionToken(req),
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 12,
      location: query.location,
      radius: query.radius ? Number(query.radius) : undefined,
      propertyType: query.propertyType,
      subCounty: query.subCounty,
      district: query.district,
      minPrice: query.minPrice ? Number(query.minPrice) : undefined,
      maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
      lat: query.lat ? Number(query.lat) : undefined,
      lng: query.lng ? Number(query.lng) : undefined,
      radiusKm: query.radiusKm ? Number(query.radiusKm) : undefined,
    });
  }

  @Post('search/record')
  @ApiOperation({ summary: 'Record customer search' })
  async recordSearch(@Body() body: any) {
    this.logger.log(`Record search request for session ${body.sessionToken}`);
    return this.proxyService.forwardToProperty('RecordCustomerSearch', body);
  }

  @Get('searches')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer searches' })
  async getCustomerSearches(@Req() req: any, @Query() query: any) {
    const customerId = req.user?.customerId;
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 10, 50);
    this.logger.log(`Get customer searches request for customer=${customerId}`);
    return this.proxyService.forwardToProperty('GetCustomerSearches', {
      customerId,
      page,
      limit,
    });
  }

  @Post('searches/retrieve')
  @ApiOperation({ summary: 'Retrieve customer searches by session token' })
  async retrieveSearches(@Body() body: any) {
    this.logger.log(`Retrieve searches request for session ${body.sessionToken}`);
    return this.proxyService.forwardToProperty('GetCustomerSearches', {
      sessionToken: body.sessionToken,
      page: Number(body.page) || 1,
      limit: Number(body.limit) || 10,
    });
  }

  @Post('favorites/toggle')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Toggle customer favorite' })
  async toggleFavorite(@Req() req: any, @Body() body: any) {
    const customerId = req.user?.customerId;
    this.logger.log(`Toggle favorite request for customer=${customerId} property=${body.propertyId}`);
    return this.proxyService.forwardToProperty('ToggleFavorite', {
      customerId,
      propertyId: body.propertyId,
      propertyTitle: body.propertyTitle,
      propertyLocation: body.propertyLocation,
      brokerCode: body.brokerCode,
      imageUrl: body.imageUrl,
      price: body.price,
    });
  }

  @Get('favorites')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer favorites' })
  async getCustomerFavorites(@Req() req: any, @Query() query: any) {
    const customerId = req.user?.customerId;
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 10, 50);
    this.logger.log(`Get customer favorites request for customer=${customerId}`);
    return this.proxyService.forwardToProperty('GetCustomerFavorites', {
      customerId,
      page,
      limit,
    });
  }

  @Post('comments')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add property comment and rating' })
  async addComment(@Req() req: any, @Body() body: any) {
    const customerId = req.user?.customerId;
    this.logger.log(`Add comment request for customer=${customerId} property=${body.propertyId}`);
    return this.proxyService.forwardToProperty('AddComment', {
      customerId,
      propertyId: body.propertyId,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      customerEmail: body.customerEmail,
      comment: body.comment,
      rating: body.rating,
    });
  }

  @Get('properties/:id/comments')
  @ApiOperation({ summary: 'Get property comments' })
  async getPropertyComments(@Param('id') propertyId: string, @Query() query: any) {
    this.logger.log(`Get property comments request for ${propertyId}`);
    return this.proxyService.forwardToProperty('GetPropertyComments', {
      propertyId,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 10,
    });
  }

  @Get('admin/comments')
  @ApiOperation({ summary: 'Get all comments for admin' })
  async getAllComments(@Query() query: any) {
    this.logger.log(`Get all comments request`);
    return this.proxyService.forwardToProperty('GetAllComments', {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 20,
      propertyId: query.propertyId || '',
    });
  }
}
