import { Controller, Logger, Get, Post, Put, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './public.decorator';

@ApiTags('web-customer')
@Controller('web/customer')
@UseGuards(JwtAuthGuard)
export class CustomerWebController {
  private readonly logger = new Logger(CustomerWebController.name);

  constructor(private readonly proxyService: ProxyService) {}

  private getCustomerId(req: any): string {
    return req.user?.customerId;
  }

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register customer with email and password from web dashboard' })
  async register(@Body() body: any) {
    this.logger.log(`Web customer register request for email=${body.email}`);
    return this.proxyService.forwardToCustomer('RegisterCustomer', body);
  }

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'Login customer with email and password from web dashboard' })
  async login(@Body() body: any) {
    this.logger.log(`Web customer login request for email=${body.email}`);
    return this.proxyService.forwardToCustomer('LoginCustomer', body);
  }

  @Post('login/google')
  @ApiOperation({ summary: 'Login customer with Google from web dashboard' })
  async loginGoogle(@Body() body: any) {
    this.logger.log(`Web customer Google login request for googleId=${body.googleId}`);
    return this.proxyService.forwardToCustomer('LoginCustomerGoogle', body);
  }

  @Post('confirm-otp')
  @ApiOperation({ summary: 'Confirm OTP from web dashboard' })
  async confirmOtp(@Body() body: any) {
    this.logger.log(`Web customer confirm OTP request for email=${body.email}`);
    return this.proxyService.forwardToCustomer('ConfirmOtp', body);
  }

  @Put('profile/phone')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update customer phone number from web dashboard' })
  async updatePhone(@Req() req: any, @Body() body: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer update phone request for user=${customerId}`);
    return this.proxyService.forwardToCustomer('UpdatePhoneNumber', { customerId, phoneNumber: body.phoneNumber });
  }

  @Get('video-tours')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get video tours from web dashboard' })
  async videoTours(@Query() query: any, @Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer video tours request customerId=${customerId}`);
    return this.proxyService.forwardToProperty('GetCustomerProperties', {
      customerId,
      page: Number(query.page) || 1,
      limit: Math.min(Number(query.limit) || 12, 12),
      lat: query.lat ? Number(query.lat) : undefined,
      lng: query.lng ? Number(query.lng) : undefined,
      radiusKm: query.radiusKm ? Number(query.radiusKm) : undefined,
      propertyType: query.propertyType,
    });
  }

  @Get('all-properties')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all properties from web dashboard' })
  async allProperties(@Query() query: any, @Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer all properties request customerId=${customerId}`);
    return this.proxyService.forwardToProperty('GetCustomerProperties', {
      customerId,
      page: Number(query.page) || 1,
      limit: Math.min(Number(query.limit) || 12, 12),
      lat: query.lat ? Number(query.lat) : undefined,
      lng: query.lng ? Number(query.lng) : undefined,
      radiusKm: query.radiusKm ? Number(query.radiusKm) : undefined,
      propertyType: query.propertyType,
    });
  }

  @Get('explorer')
  @ApiOperation({ summary: 'Get explorer properties from web dashboard' })
  async explorer(@Query() query: any, @Req() req: any) {
    const sessionToken = req?.headers?.['x-session-id'] || req?.session?.sessionId || 'public-web';
    this.logger.log(`Web customer explorer request sessionToken=${sessionToken}`);
    return this.proxyService.forwardToProperty('GetCustomerProperties', {
      sessionToken,
      page: Number(query.page) || 1,
      limit: Math.min(Number(query.limit) || 12, 12),
      propertyType: query.propertyType,
      location: query.location,
      brokerCode: query.brokerCode,
      brokerBrandName: query.brokerBrandName,
      subCounty: query.subCounty,
      district: query.district,
      minPrice: query.minPrice ? Number(query.minPrice) : undefined,
      maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
  }

  @Get('properties')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get property details from web dashboard' })
  async getPropertyDetails(@Query() query: any, @Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer property details request for ${query.propertyId} customerId=${customerId}`);
    return this.proxyService.forwardToProperty('GetPropertyDetailsForCustomer', {
      customerId,
      propertyId: query.propertyId,
    });
  }

  @Get('properties/similar')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get similar properties from web dashboard' })
  async getSimilarProperties(@Query() query: any, @Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer similar properties request for ${query.propertyId} customerId=${customerId}`);
    return this.proxyService.forwardToProperty('GetSimilarProperties', {
      customerId,
      propertyId: query.propertyId,
      limit: Number(query.limit) || 10,
    });
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer transactions from web dashboard' })
  async getTransactions(@Req() req: any, @Query() query: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer transactions request for user=${customerId}`);
    return this.proxyService.forwardToPayment('GetTransactions', {
      page: Number(query.page) || 1,
      limit: Math.min(Number(query.limit) || 10, 50),
      brokerId: customerId,
    });
  }

  @Get('invoices')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer invoices from web dashboard' })
  async getInvoices(@Req() req: any, @Query() query: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer invoices request for user=${customerId}`);
    return this.proxyService.forwardToPayment('GetTransactions', {
      page: Number(query.page) || 1,
      limit: Math.min(Number(query.limit) || 10, 50),
      brokerId: customerId,
    });
  }

  @Get('messages')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer messages from web dashboard' })
  async getMessages(@Req() req: any, @Query() query: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer messages request for user=${customerId}`);
    return this.proxyService.forwardToCustomer('GetMessages', {
      customerId,
      page: Number(query.page) || 1,
      limit: Math.min(Number(query.limit) || 10, 50),
    });
  }

  @Post('transactions/initiate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Initiate transaction from web dashboard' })
  async initiateTransaction(@Req() req: any, @Body() body: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer initiate transaction request customerId=${customerId}`);
    return this.proxyService.forwardToProperty('CreateCustomerBooking', {
      customerId,
      propertyId: body.propertyId || '',
      customerName: body.customerName || '',
      customerPhone: body.phoneNumber,
      customerEmail: body.email,
      date: new Date().toISOString(),
      amount: Number(body.amount) || 0,
      reason: body.reason || 'property_access',
      status: 'pending',
    });
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer profile from web dashboard' })
  async getProfile(@Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer profile request for user=${customerId}`);
    return this.proxyService.forwardToCustomer('GetProfile', { customerId });
  }

  @Get('wallet')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer wallet balance from web dashboard' })
  async getWallet(@Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer wallet request for user=${customerId}`);
    return this.proxyService.forwardToCustomer('GetWalletBalance', { customerId });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout customer from web dashboard' })
  async logout(@Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer logout request for user=${customerId}`);
    return this.proxyService.forwardToCustomer('Logout', { customerId });
  }

  @Post('unsubscribe')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Unsubscribe customer from web dashboard' })
  async unsubscribe(@Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer unsubscribe request for user=${customerId}`);
    return this.proxyService.forwardToCustomer('Unsubscribe', { customerId });
  }

  @Get('search')
  @ApiOperation({ summary: 'Search properties from web dashboard' })
  async search(@Query() query: any, @Req() req: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer search request customerId=${customerId}`);
    return this.proxyService.forwardToCustomer('Search', {
      customerId,
      query: query.query || '',
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 12,
      location: query.location || '',
      radius: query.radius ? Number(query.radius) : undefined,
      propertyType: query.propertyType || '',
      subCounty: query.subCounty || '',
      district: query.district || '',
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
    this.logger.log(`Web customer record search request for customer=${customerId}`);
    return this.proxyService.forwardToProperty('RecordCustomerSearch', {
      customerId,
      query: body.query || '',
      location: body.location || '',
      radius: Number(body.radius) || 0,
      propertyType: body.propertyType || '',
      filters: {},
      resultPropertyIds: body.resultPropertyIds || [],
      resultCount: Number(body.resultCount) || 0,
      minPrice: Number(body.minPrice) || 0,
      maxPrice: Number(body.maxPrice) || 0,
      subCounty: body.subCounty || '',
      district: body.district || '',
    });
  }

  @Get('searches')
  @ApiOperation({ summary: 'Get customer searches from web dashboard' })
  async getSearches(@Req() req: any, @Query() query: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer get searches request customerId=${customerId}`);
    return this.proxyService.forwardToProperty('GetCustomerSearches', {
      customerId,
      page: Number(query.page) || 1,
      limit: Math.min(Number(query.limit) || 10, 50),
    });
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get customer notifications from web dashboard' })
  async getNotifications(@Req() req: any, @Query() query: any) {
    const customerId = this.getCustomerId(req);
    this.logger.log(`Web customer notifications request for user=${customerId}`);
    return this.proxyService.forwardToCustomer('GetNotifications', {
      customerId,
      page: Number(query.page) || 1,
      limit: Math.min(Number(query.limit) || 20, 50),
    });
  }
}