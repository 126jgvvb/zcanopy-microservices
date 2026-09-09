import { Controller, Logger, Get, Post, Put, Delete, Body, Query, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('web-customer')
@Controller('web/customer')
export class WebCustomerController {
  private readonly logger = new Logger(WebCustomerController.name);

  constructor(private readonly proxyService: ProxyService) {}

  private getSessionToken(req: any): string {
    return req?.session?.sessionId || req?.headers?.['x-session-id'] || 'public-web';
  }

  @Get('properties')
  @ApiOperation({ summary: 'Public property listings for customer web dashboard' })
  async getPublicProperties(@Query() query: any, @Req() req: any) {
    this.logger.log(`Web customer public properties request sessionId=${this.getSessionToken(req)}`);
    return this.proxyService.forwardToProperty('GetCustomerProperties', {
      sessionToken: this.getSessionToken(req),
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 12,
      lat: query.lat ? Number(query.lat) : undefined,
      lng: query.lng ? Number(query.lng) : undefined,
      radiusKm: query.radiusKm ? Number(query.radiusKm) : undefined,
      propertyType: query.propertyType,
    });
  }

  @Get('properties/:id')
  @ApiOperation({ summary: 'Public property details for customer web dashboard' })
  async getPropertyDetails(@Param('id') id: string, @Req() req: any) {
    this.logger.log(`Web customer property details request for ${id} sessionId=${this.getSessionToken(req)}`);
    return this.proxyService.forwardToProperty('GetPropertyDetailsForCustomer', {
      sessionToken: this.getSessionToken(req),
      propertyId: id,
    });
  }

  @Get('broker/:brokerCode/properties')
  @ApiOperation({ summary: 'Get broker properties for customer web dashboard' })
  async getBrokerProperties(@Query() query: any, @Param('brokerCode') brokerCode: string, @Req() req: any) {
    this.logger.log(`Web customer broker properties request for ${brokerCode} sessionId=${this.getSessionToken(req)}`);
    return this.proxyService.forwardToProperty('GetBrokerPropertiesForCustomer', {
      sessionToken: this.getSessionToken(req),
      brokerCode,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 12,
    });
  }

  @Get('search')
  @ApiOperation({ summary: 'Search properties for customer web dashboard' })
  async searchProperties(@Query() query: any, @Req() req: any) {
    this.logger.log(`Web customer property search request for query=${query.q} sessionId=${this.getSessionToken(req)}`);
    return this.proxyService.forwardToProperty('SearchPropertiesByBrokerTitle', {
      query: query.q || '',
      sessionToken: this.getSessionToken(req),
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 12,
      lat: query.lat ? Number(query.lat) : undefined,
      lng: query.lng ? Number(query.lng) : undefined,
      radiusKm: query.radiusKm ? Number(query.radiusKm) : undefined,
    });
  }

  @Post('search/record')
  @ApiOperation({ summary: 'Record customer search from web dashboard' })
  async recordSearch(@Body() body: any) {
    this.logger.log(`Web customer record search request for session ${body.sessionToken}`);
    return this.proxyService.forwardToProperty('RecordCustomerSearch', body);
  }

  @Get('searches')
  @ApiOperation({ summary: 'Get customer searches from web dashboard' })
  async getSearches(@Req() req: any, @Query() query: any) {
    this.logger.log(`Web customer get searches request`);
    return this.proxyService.forwardToProperty('GetCustomerSearches', {
      sessionToken: this.getSessionToken(req),
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 10,
    });
  }

  @Post('favorites/toggle')
  @ApiOperation({ summary: 'Toggle favorite from web dashboard' })
  async toggleFavorite(@Body() body: any) {
    this.logger.log(`Web customer toggle favorite request for property ${body.propertyId}`);
    return this.proxyService.forwardToProperty('ToggleFavorite', body);
  }

  @Get('favorites')
  @ApiOperation({ summary: 'Get customer favorites from web dashboard' })
  async getFavorites(@Req() req: any, @Query() query: any) {
    this.logger.log(`Web customer get favorites request`);
    return this.proxyService.forwardToProperty('GetCustomerFavorites', {
      sessionToken: this.getSessionToken(req),
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 10,
    });
  }

  @Post('comments')
  @ApiOperation({ summary: 'Add property comment from web dashboard' })
  async addComment(@Body() body: any) {
    this.logger.log(`Web customer add comment request for property ${body.propertyId}`);
    return this.proxyService.forwardToProperty('AddComment', body);
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
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List customer bookings for web dashboard' })
  async getBookings(@Req() req: any, @Query() query: any) {
    this.logger.log(`Web customer bookings request for user ${req.user?.sub}`);
    return this.proxyService.forwardToProperty('GetCustomerBookings', {
      sessionToken: req.user?.sub,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 20,
    });
  }

  @Post('properties/access-payment')
  @ApiOperation({ summary: 'Initiate payment for property access from web dashboard (creates booking + viewer record with transaction code)' })
  async initiatePropertyAccessPayment(@Req() req: any, @Body() body: any) {
    this.logger.log(`Web customer initiate property access payment sessionId=${this.getSessionToken(req)} brokerCode=${body.brokerCode}`);
    return this.proxyService.forwardToProperty('CreateCustomerBooking', {
      sessionToken: this.getSessionToken(req),
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
    this.logger.log(`Web customer create booking request sessionId=${this.getSessionToken(req)}`);
    return this.proxyService.forwardToProperty('CreateCustomerBooking', {
      sessionToken: this.getSessionToken(req),
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

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer profile for web dashboard' })
  async getProfile(@Req() req: any) {
    this.logger.log(`Web customer profile request for user ${req.user?.sub}`);
    return this.proxyService.forwardToAuth('GetUserProfile', { userId: req.user?.sub });
  }
}
