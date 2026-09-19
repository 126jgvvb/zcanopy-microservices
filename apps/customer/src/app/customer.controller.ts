import { Controller, Logger, Get, Post, Put, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CustomerService } from './customer.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  RegisterCustomerDto,
  LoginCustomerDto,
  ConfirmOtpDto,
  UpdatePhoneDto,
  VideoToursQueryDto,
  AllPropertiesQueryDto,
  ExplorerQueryDto,
  GetPropertyDetailsDto,
  SimilarPropertiesQueryDto,
  SearchQueryDto,
  InitiateTransactionDto,
  RecordSearchDto,
} from './dtos/customer.dto';

@ApiTags('customer')
@Controller('customer')
export class CustomerController {
  private readonly logger = new Logger(CustomerController.name);

  constructor(private readonly customerService: CustomerService) {}

  private getSessionToken(req: any): string {
    return req?.headers?.['x-session-id'] || req?.session?.sessionId || 'public-customer';
  }

  @Post('register')
  @ApiOperation({ summary: 'Register customer with email and password' })
  async register(@Body() dto: RegisterCustomerDto) {
    this.logger.log(`Register request for email=${dto.email}`);
    return this.customerService.registerCustomer(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login customer with email and password' })
  async login(@Body() dto: LoginCustomerDto) {
    this.logger.log(`Login request for email=${dto.email}`);
    return this.customerService.loginCustomer(dto);
  }

  @Post('login/google')
  @ApiOperation({ summary: 'Login customer with Google' })
  async loginGoogle(@Body() dto: { googleId: string; email?: string; firstName?: string; lastName?: string }) {
    this.logger.log(`Google login request for googleId=${dto.googleId}`);
    return this.customerService.loginCustomerGoogle(dto);
  }

  @Post('confirm-otp')
  @ApiOperation({ summary: 'Confirm OTP sent to email' })
  async confirmOtp(@Body() dto: ConfirmOtpDto) {
    this.logger.log(`Confirm OTP request for email=${dto.email}`);
    return this.customerService.confirmOtp(dto);
  }

  @Put('profile/phone')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update customer phone number' })
  async updatePhone(@Req() req: any, @Body() dto: UpdatePhoneDto) {
    const customerId = req.user?.customerId;
    this.logger.log(`Update phone request for customer=${customerId}`);
    return this.customerService.updatePhoneNumber(customerId, dto.phoneNumber);
  }

  @Get('video-tours')
  @ApiOperation({ summary: 'Get properties with videos near customer location' })
  async videoTours(@Query() query: VideoToursQueryDto, @Req() req: any) {
    const sessionToken = this.getSessionToken(req);
    this.logger.log(`Video tours request sessionId=${sessionToken}`);
    return this.customerService.videoTours(sessionToken, query);
  }

  @Get('all-properties')
  @ApiOperation({ summary: 'Get all properties near customer location' })
  async allProperties(@Query() query: AllPropertiesQueryDto, @Req() req: any) {
    const sessionToken = this.getSessionToken(req);
    this.logger.log(`All properties request sessionId=${sessionToken}`);
    return this.customerService.getAllProperties(sessionToken, query);
  }

  @Get('explorer')
  @ApiOperation({ summary: 'Get explorer properties with video count metadata' })
  async explorer(@Query() query: ExplorerQueryDto, @Req() req: any) {
    const sessionToken = this.getSessionToken(req);
    this.logger.log(`Explorer request sessionId=${sessionToken}`);
    return this.customerService.explorer(sessionToken, query);
  }

  @Get('properties')
  @ApiOperation({ summary: 'Get property details' })
  async getPropertyDetails(@Query() query: GetPropertyDetailsDto, @Req() req: any) {
    const sessionToken = this.getSessionToken(req);
    this.logger.log(`Get property details request for ${query.propertyId} sessionId=${sessionToken}`);
    return this.customerService.getPropertyDetails(sessionToken, query.propertyId);
  }

  @Get('properties/similar')
  @ApiOperation({ summary: 'Get similar properties based on price, location, and type' })
  async getSimilarProperties(@Query() query: SimilarPropertiesQueryDto, @Req() req: any) {
    const sessionToken = this.getSessionToken(req);
    this.logger.log(`Get similar properties request for ${query.propertyId} sessionId=${sessionToken}`);
    return this.customerService.getSimilarProperties(sessionToken, query.propertyId);
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer transactions' })
  async getTransactions(@Req() req: any, @Query() query: any) {
    const customerId = req.user?.customerId;
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 10, 50);
    this.logger.log(`Get transactions request for customer=${customerId}`);
    return this.customerService.getTransactions(customerId, page, limit);
  }

  @Get('invoices')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer invoices' })
  async getInvoices(@Req() req: any, @Query() query: any) {
    const customerId = req.user?.customerId;
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 10, 50);
    this.logger.log(`Get invoices request for customer=${customerId}`);
    return this.customerService.getInvoices(customerId, page, limit);
  }

  @Get('messages')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer messages' })
  async getMessages(@Req() req: any, @Query() query: any) {
    const customerId = req.user?.customerId;
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 10, 50);
    this.logger.log(`Get messages request for customer=${customerId}`);
    return this.customerService.getMessages(customerId, page, limit);
  }

  @Post('transactions/initiate')
  @ApiOperation({ summary: 'Initiate property booking transaction' })
  async initiateTransaction(@Body() dto: InitiateTransactionDto, @Req() req: any) {
    const sessionToken = this.getSessionToken(req);
    this.logger.log(`Initiate transaction request sessionId=${sessionToken} phone=${dto.phoneNumber}`);
    return this.customerService.initiateTransaction({
      customerId: req.user?.customerId || '',
      phoneNumber: dto.phoneNumber,
      email: dto.email,
      customerName: dto.customerName,
      propertyId: dto.propertyId,
      reason: dto.reason,
      amount: dto.amount ? Number(dto.amount) : undefined,
    });
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer profile' })
  async getProfile(@Req() req: any) {
    const customerId = req.user?.customerId;
    this.logger.log(`Get profile request for customer=${customerId}`);
    return this.customerService.getProfile(customerId);
  }

  @Get('wallet')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer wallet balance' })
  async getWallet(@Req() req: any) {
    const customerId = req.user?.customerId;
    this.logger.log(`Get wallet request for customer=${customerId}`);
    return this.customerService.getWalletBalance(customerId);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout customer' })
  async logout(@Req() req: any) {
    const sessionToken = req.headers?.authorization?.split(' ')[1];
    this.logger.log(`Logout request for customer=${req.user?.customerId}`);
    return this.customerService.logout(sessionToken);
  }

  @Post('unsubscribe')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Unsubscribe customer' })
  async unsubscribe(@Req() req: any) {
    const customerId = req.user?.customerId;
    this.logger.log(`Unsubscribe request for customer=${customerId}`);
    return this.customerService.unsubscribe(customerId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search properties' })
  async search(@Query() query: SearchQueryDto, @Req() req: any) {
    const sessionToken = this.getSessionToken(req);
    this.logger.log(`Search request sessionId=${sessionToken}`);
    return this.customerService.search({
      sessionToken,
      query: query.query,
      location: query.location,
      radius: query.radius ? Number(query.radius) : undefined,
      propertyType: query.propertyType,
      subCounty: query.subCounty,
      district: query.district,
      minPrice: query.minPrice ? Number(query.minPrice) : undefined,
      maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      lat: query.lat ? Number(query.lat) : undefined,
      lng: query.lng ? Number(query.lng) : undefined,
      radiusKm: query.radiusKm ? Number(query.radiusKm) : undefined,
    });
  }

  @Post('search/record')
  @ApiOperation({ summary: 'Record customer search' })
  async recordSearch(@Body() dto: RecordSearchDto) {
    this.logger.log(`Record search request for session=${dto.sessionToken}`);
    return this.customerService.recordSearch({
      sessionToken: dto.sessionToken,
      query: dto.query,
      location: dto.location,
      radius: dto.radius ? Number(dto.radius) : undefined,
      propertyType: dto.propertyType,
      minPrice: dto.minPrice ? Number(dto.minPrice) : undefined,
      maxPrice: dto.maxPrice ? Number(dto.maxPrice) : undefined,
      subCounty: dto.subCounty,
      district: dto.district,
      hadResults: dto.hadResults,
      resultPropertyIds: dto.resultPropertyIds ? dto.resultPropertyIds.split(',').filter(Boolean) : undefined,
      resultCount: dto.resultCount ? Number(dto.resultCount) : undefined,
    });
  }

  @Get('searches')
  @ApiOperation({ summary: 'Get customer searches' })
  async getSearches(@Query() query: any, @Req() req: any) {
    const sessionToken = this.getSessionToken(req);
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 10, 50);
    this.logger.log(`Get searches request sessionId=${sessionToken}`);
    return this.customerService.getCustomerSearches(sessionToken, page, limit);
  }

  @Get('notifications')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get customer notifications' })
  async getNotifications(@Req() req: any, @Query() query: any) {
    const customerId = req.user?.customerId;
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 50);
    this.logger.log(`Get notifications request for customer=${customerId}`);
    return this.customerService.getNotifications(customerId, page, limit);
  }
}
