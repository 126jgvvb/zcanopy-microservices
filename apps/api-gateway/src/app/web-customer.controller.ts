import { Controller, Logger, Get, Post, Put, Delete, Body, Query, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('web-customer')
@Controller('web/customer')
@UseGuards(JwtAuthGuard)
export class WebCustomerController {
  private readonly logger = new Logger(WebCustomerController.name);

  constructor(private readonly proxyService: ProxyService) {}

  private getCustomerId(req: any): string {
    return req.user?.customerId;
  }

  @Get('broker/:brokerCode/properties')
  @ApiOperation({ summary: 'Get broker properties for customer web dashboard' })
  async getBrokerProperties(@Query() query: any, @Param('brokerCode') brokerCode: string, @Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer broker properties request for ${brokerCode} customerId=${customerId}`);
    return this.proxyService.forwardToProperty('GetBrokerPropertiesForCustomer', {
      customerId,
      brokerCode,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 12,
    });
  }

  @Get('search')
  @ApiOperation({ summary: 'Search properties for customer web dashboard' })
  async searchProperties(@Query() query: any, @Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer property search request for query=${query.q} customerId=${customerId}`);
    return this.proxyService.forwardToProperty('SearchProperties', {
      query: query.q || '',
      customerId,
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
  @ApiOperation({ summary: 'Record customer search from web dashboard' })
  async recordSearch(@Body() body: any, @Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer record search request for customer ${customerId}`);
    return this.proxyService.forwardToProperty('RecordCustomerSearch', {
      ...body,
      customerId,
    });
  }

  @Get('searches')
  @ApiOperation({ summary: 'Get customer searches from web dashboard' })
  async getSearches(@Req() req: any, @Query() query: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer get searches request for customer ${customerId}`);
    return this.proxyService.forwardToProperty('GetCustomerSearches', {
      customerId,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 10,
    });
  }

  @Post('favorites/toggle')
  @ApiOperation({ summary: 'Toggle favorite from web dashboard' })
  async toggleFavorite(@Body() body: any, @Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer toggle favorite request for property ${body.propertyId} customer=${customerId}`);
    return this.proxyService.forwardToProperty('ToggleFavorite', {
      ...body,
      customerId,
    });
  }

  @Get('favorites')
  @ApiOperation({ summary: 'Get customer favorites from web dashboard' })
  async getFavorites(@Req() req: any, @Query() query: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer get favorites request for customer ${customerId}`);
    return this.proxyService.forwardToProperty('GetCustomerFavorites', {
      customerId,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 10,
    });
  }

  @Post('comments')
  @ApiOperation({ summary: 'Add property comment from web dashboard' })
  async addComment(@Body() body: any, @Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer add comment request for property ${body.propertyId} customer=${customerId}`);
    return this.proxyService.forwardToProperty('AddComment', {
      ...body,
      customerId,
    });
  }

  @Get('properties/:id/comments')
  @ApiOperation({ summary: 'Get property comments from web dashboard' })
  async getComments(@Param('id') propertyId: string, @Query() query: any) {
    this.logger.log(`Web customer get comments request for ${propertyId}`);
    return this.proxyService.forwardToProperty('GetPropertyComments', {
      propertyId,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 10,
    });
  }

  @Get('bookings')
  @ApiOperation({ summary: 'List customer bookings for web dashboard' })
  async getBookings(@Req() req: any, @Query() query: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer bookings request for customer=${customerId}`);
    return this.proxyService.forwardToProperty('GetCustomerBookings', {
      customerId,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 20,
    });
  }

  @Post('properties/access-payment')
  @ApiOperation({ summary: 'Initiate payment for property access from web dashboard (creates booking + viewer record with transaction code)' })
  async initiatePropertyAccessPayment(@Req() req: any, @Body() body: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer initiate property access payment customerId=${customerId} brokerCode=${body.brokerCode}`);
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

  @Post('bookings')
  @ApiOperation({ summary: 'Create booking from customer web dashboard' })
  async createBooking(@Req() req: any, @Body() body: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer create booking request customerId=${customerId}`);
    return this.proxyService.forwardToProperty('CreateCustomerBooking', {
      customerId,
      propertyId: body.propertyId,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      customerEmail: body.customerEmail,
      date: body.date,
      amount: body.amount,
      reason: body.reason,
      status: body.status || 'pending',
    });
  }

  @Post('bookings/retrieve-by-code')
  @ApiOperation({ summary: 'Retrieve booking by 6-digit booking code and phone number' })
  async retrieveBookingByCode(@Body() body: any) {
    this.logger.log(`Web customer retrieve booking by code request code=${body.bookingCode} phone=${body.customerPhone}`);
    return this.proxyService.forwardToProperty('GetBookingByBookingCode', {
      bookingCode: body.bookingCode,
      customerPhone: body.customerPhone,
    });
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get customer profile for web dashboard' })
  async getProfile(@Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer profile request for user ${customerId}`);
    return this.proxyService.forwardToCustomer('GetProfile', { customerId });
  }
}