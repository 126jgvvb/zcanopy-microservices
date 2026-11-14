import { Controller, Logger, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('brokers')
@Controller('brokers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BrokerController {
  private readonly logger = new Logger(BrokerController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Get()
  @ApiOperation({ summary: 'Get all brokers' })
  async getAllBrokers(@Query() query: any) {
    this.logger.log(`Get all brokers request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToBroker('GetAllBrokers', query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated broker profile' })
  async getMe(@Req() req: any) {
    const brokerCode = req.user?.brokerCode;
    if (!brokerCode) {
      throw new UnauthorizedException('Broker identity not found in token');
    }
    this.logger.log(`Get authenticated broker profile for ${brokerCode}`);
    return this.proxyService.forwardToBroker('GetBrokerByCode', { brokerCode });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get broker by ID' })
  async getBrokerById(@Param('id') id: string) {
    this.logger.log(`Get broker by ID request for ${id}`);
    return this.proxyService.forwardToBroker('GetBrokerById', { id });
  }

  @Post()
  @ApiOperation({ summary: 'Create broker' })
  async createBroker(@Body() body: any) {
    this.logger.log(`Create broker request for ${body.username}`);
    return this.proxyService.forwardToBroker('CreateBroker', body);
  }

  @Put('me')
  @ApiOperation({ summary: 'Update the authenticated broker' })
  async updateMe(@Req() req: any, @Body() body: any) {
    const brokerCode = req.user?.brokerCode;
    if (!brokerCode) {
      throw new UnauthorizedException('Broker identity not found in token');
    }
    this.logger.log(`Update authenticated broker ${brokerCode}`);
    return this.proxyService.forwardToBroker('UpdateBroker', { brokerCode, ...body });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update broker by ID' })
  async updateBroker(@Param('id') id: string, @Body() body: any) {
    this.logger.log(`Update broker request for ${id}`);
    return this.proxyService.forwardToBroker('UpdateBroker', { id, ...body });
  }

  @Delete('me')
  @ApiOperation({ summary: 'Delete the authenticated broker account' })
  async deleteMe(@Req() req: any) {
    const brokerCode = req.user?.brokerCode;
    if (!brokerCode) {
      throw new UnauthorizedException('Broker identity not found in token');
    }
    this.logger.log(`Delete authenticated broker ${brokerCode}`);
    return this.proxyService.forwardToBroker('DeleteBrokerAccount', { brokerCode });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete broker by ID' })
  async deleteBroker(@Param('id') id: string) {
    this.logger.log(`Delete broker request for ${id}`);
    return this.proxyService.forwardToBroker('DeleteBroker', { id });
  }

  @Get('pending/verifications')
  @ApiOperation({ summary: 'Get pending verifications' })
  async getPendingVerifications(@Query() query: any) {
    this.logger.log(`Get pending verifications request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToBroker('GetPendingVerifications', query);
  }

  @Get('recent/signups')
  @ApiOperation({ summary: 'Get recent signups' })
  async getRecentSignups(@Query() query: any) {
    this.logger.log(`Get recent signups request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToBroker('GetRecentSignups', query);
  }

  @Get('dashboard/me')
  @ApiOperation({ summary: 'Get the authenticated broker dashboard' })
  async getMyDashboard(@Req() req: any) {
    const brokerCode = req.user?.brokerCode;
    if (!brokerCode) {
      throw new UnauthorizedException('Broker identity not found in token');
    }
    this.logger.log(`Get authenticated broker dashboard for ${brokerCode}`);
    return this.proxyService.forwardToBroker('GetBrokerDashboard', { brokerCode });
  }

  @Get('dashboard/:brokerId')
  @ApiOperation({ summary: 'Get broker dashboard by ID' })
  async getBrokerDashboard(@Param('brokerId') brokerId: string) {
    this.logger.log(`Get broker dashboard request for ${brokerId}`);
    return this.proxyService.forwardToBroker('GetBrokerDashboard', { brokerId });
  }

  @Get('search')
  @ApiOperation({ summary: 'Search brokers by title or username' })
  async searchBrokers(@Query('q') q: string) {
    this.logger.log(`Search brokers request for query=${q}`);
    return this.proxyService.forwardToBroker('SearchBrokers', { query: q });
  }

  @Post('me/subscribe')
  @ApiOperation({ summary: 'Subscribe the authenticated broker to a tier via mobile money' })
  async subscribeMe(
    @Req() req: any,
    @Body() body: any,
  ) {
    const brokerCode = req.user?.brokerCode;
    if (!brokerCode) {
      throw new UnauthorizedException('Broker identity not found in token');
    }
    this.logger.log(`Subscribe authenticated broker ${brokerCode}, tier=${body.tier}`);
    return this.proxyService.forwardToBroker('ProcessSubscriptionPayment', {
      brokerCode,
      tier: body.tier,
      phoneNumber: body.phoneNumber,
    });
  }

  @Post(':id/subscribe')
  @ApiOperation({ summary: 'Subscribe a broker to a tier via mobile money' })
  async subscribeBroker(
    @Param('id') id: string,
    @Body() body: any,
  ) {
    this.logger.log(`Subscribe broker request for ${id}, tier=${body.tier}`);
    return this.proxyService.forwardToBroker('ProcessSubscriptionPayment', {
      brokerId: id,
      tier: body.tier,
      phoneNumber: body.phoneNumber,
    });
  }

  /* ------------------------------------------------------------------
   * Endpoints added to the broker web dashboard (web/broker/*), mirrored here
   * so the mobile app can use the same flows: the landlord & title
   * verification, the withdrawal/OTP flows, the wallet, bookings, profile
   * and account management.
   * ------------------------------------------------------------------ */

  private getBrokerCode(req: any): string {
    const brokerCode = req.user?.brokerCode;
    if (!brokerCode) {
      throw new UnauthorizedException('Broker identity not found in token');
    }
    return brokerCode;
  }

  private async getBrokerRecord(req: any): Promise<any> {
    const broker = (await this.proxyService.forwardToBroker('GetBrokerByCode', {
      brokerCode: this.getBrokerCode(req),
    })) as any;
    return broker?.broker ?? broker;
  }

  /* ---- Landlord & title (UgNLIS) verification ---- */

  @Post('landlord-details')
  @ApiOperation({ summary: 'Submit landlord identity and property title details for UgNLIS title search' })
  async submitLandlordDetails(@Req() req: any, @Body() body: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Submit landlord details for ${brokerCode}`);
    return this.proxyService.forwardToBroker('SubmitLandlordDetails', {
      brokerCode,
      fullName: body.landlord?.fullName ?? body.fullName,
      nin: body.landlord?.nin ?? body.nin,
      phoneNumber: body.landlord?.phoneNumber ?? body.phoneNumber,
      email: body.landlord?.email ?? body.email,
      mzoDistrict: body.search?.mzoDistrict ?? body.mzoDistrict,
      tenureType: body.search?.tenureType ?? body.tenureType,
      countyDivision: body.search?.location?.countyDivision ?? body.countyDivision,
      blockNumber: body.search?.location?.blockNumber ?? body.blockNumber,
      plotNumber: body.search?.location?.plotNumber ?? body.plotNumber,
      volumeNumber: body.search?.location?.volumeNumber ?? body.volumeNumber,
      folioNumber: body.search?.location?.folioNumber ?? body.folioNumber,
      leaseExpiryDate: body.search?.location?.leaseExpiryDate ?? body.leaseExpiryDate,
      subCountyVillage: body.search?.location?.subCountyVillage ?? body.subCountyVillage,
      ccoRefNumber: body.search?.location?.ccoRefNumber ?? body.ccoRefNumber,
      brokerConfirmations: body.brokerConfirmations || [],
    });
  }

  @Post('landlord-details/send-broker-otps')
  @ApiOperation({ summary: 'Send confirmation OTPs to other brokers linked to the same landlord' })
  async sendLandlordBrokerOtps(@Req() req: any, @Body() body: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Send landlord broker OTPs for ${brokerCode}`);
    return this.proxyService.forwardToBroker('SendLandlordBrokerOtps', {
      brokerCode,
      fullName: body.fullName,
      nin: body.nin,
      phoneNumber: body.phoneNumber,
    });
  }

  @Post('landlord-details/authorization-otp')
  @ApiOperation({ summary: 'Send an authorisation OTP to a landlord already verified for another broker' })
  async sendLandlordAuthorizationOtp(@Req() req: any, @Body() body: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Send landlord authorisation OTP for ${brokerCode}`);
    return this.proxyService.forwardToBroker('SendLandlordAuthorizationOtp', {
      brokerCode,
      verificationId: body.verificationId || '',
    });
  }

  @Post('landlord-details/verify-authorization')
  @ApiOperation({
    summary: 'Confirm the landlord authorisation OTP and the landlord NIN for the requesting broker',
  })
  async verifyLandlordAuthorization(@Req() req: any, @Body() body: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Verify landlord authorisation for ${brokerCode}`);
    return this.proxyService.forwardToBroker('VerifyLandlordAuthorization', {
      brokerCode,
      verificationId: body.verificationId || '',
      otp: body.otp || '',
      landlordNin: body.landlordNin ?? body.brokerNin ?? '',
    });
  }

  @Get('landlord-details/status')
  @ApiOperation({ summary: 'Get the landlord & title verification status for the authenticated broker' })
  async getLandlordDetailsStatus(@Req() req: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Landlord details status for ${brokerCode}`);
    return this.proxyService.forwardToBroker('GetLandlordDetailsStatus', { brokerCode });
  }

  /* ---- Broker verification documents ---- */

  @Get('verification/status')
  @ApiOperation({ summary: 'Get the broker verification status (documents, approved/pending)' })
  async getVerificationStatus(@Req() req: any) {
    const brokerData = await this.getBrokerRecord(req);
    const ninImages = Array.isArray(brokerData?.ninImages) ? brokerData.ninImages : [];
    const hasUploadedDocuments = ninImages.length >= 2;
    const verificationStatus = brokerData?.isVerified
      ? 'approved'
      : hasUploadedDocuments
        ? 'pending'
        : 'unsubmitted';

    return {
      isVerified: brokerData?.isVerified || false,
      idFrontUrl: ninImages[0] || null,
      idBackUrl: ninImages[1] || null,
      verificationStatus,
    };
  }

  @Post('verification/documents')
  @ApiOperation({ summary: 'Submit broker ID documents for verification' })
  async submitVerificationDocuments(@Req() req: any, @Body() body: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Submit verification documents for ${brokerCode}`);
    return this.proxyService.forwardToBroker('SubmitVerificationDocuments', {
      brokerCode,
      idFrontUrl: body.idFrontUrl,
      idBackUrl: body.idBackUrl,
    });
  }

  /* ---- Bookings ---- */

  @Get('bookings')
  @ApiOperation({ summary: 'List the bookings of the authenticated broker' })
  async getBookings(@Req() req: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Get bookings for ${brokerCode}`);
    return this.proxyService.forwardToProperty('GetBrokerBookings', { brokerCode });
  }

  @Put('bookings/:id/status')
  @ApiOperation({ summary: 'Update the status of a booking (approved/rejected)' })
  async updateBookingStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    this.getBrokerCode(req);
    this.logger.log(`Update booking status ${id}`);
    return this.proxyService.forwardToProperty('UpdateBookingStatus', {
      bookingId: id,
      status: body.status,
    });
  }

  /* ---- Wallet ---- */

  @Get('wallet')
  @ApiOperation({ summary: 'Get the wallet of the authenticated broker' })
  async getWallet(@Req() req: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Get wallet for ${brokerCode}`);
    return this.proxyService.forwardToBroker('GetWallet', { walletId: brokerCode });
  }

  @Get('wallet/transactions')
  @ApiOperation({ summary: 'Get the wallet transactions of the authenticated broker' })
  async getWalletTransactions(@Req() req: any, @Query() query: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Get wallet transactions for ${brokerCode}`);
    return this.proxyService.forwardToBroker('GetWalletTransactions', {
      brokerCode,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 20,
    });
  }

  @Get('messages')
  @ApiOperation({ summary: 'Get the messages of the authenticated broker' })
  async getMessages(@Req() req: any) {
    const brokerData = await this.getBrokerRecord(req);
    this.logger.log(`Get messages for broker ${brokerData?.id}`);
    return this.proxyService.forwardToBroker('GetBrokerMessages', {
      brokerId: brokerData?.id,
    });
  }

  /* ---- Withdrawals ---- */

  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw wallet funds to mobile money (needs the landlord OTP)' })
  async withdraw(@Req() req: any, @Body() body: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Withdraw request for ${brokerCode}, amount=${body.amount}`);
    return this.proxyService.forwardToBroker('Withdraw', {
      amount: Number(body.amount),
      phoneNumber: body.phoneNumber,
      provider: body.provider,
      payeeName: body.payeeName,
      otp: body.otp,
      brokerCode,
    });
  }

  @Post('withdraw/request-otp')
  @ApiOperation({ summary: 'Request the authorisation OTP sent to the landlord for a withdrawal' })
  async requestWithdrawalOtp(@Req() req: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Withdrawal OTP request for ${brokerCode}`);
    return this.proxyService.forwardToBroker('RequestLandlordWithdrawalOtp', { brokerCode });
  }

  /* ---- Profile & account ---- */

  @Get('profile')
  @ApiOperation({ summary: 'Get the profile of the authenticated broker' })
  async getProfile(@Req() req: any) {
    const brokerCode = this.getBrokerCode(req);
    return this.proxyService.forwardToBroker('GetBrokerByCode', { brokerCode });
  }

  @Post('profile')
  @ApiOperation({ summary: 'Update the profile of the authenticated broker' })
  async updateProfile(@Req() req: any, @Body() body: any) {
    const brokerCode = this.getBrokerCode(req);
    const brokerData = await this.getBrokerRecord(req);
    return this.proxyService.forwardToBroker('SaveUserInfo', {
      userId: brokerData?.id,
      ...body,
    });
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change the broker password (requires the emailed OTP)' })
  async changePassword(@Req() req: any, @Body() body: any) {
    this.getBrokerCode(req);
    const brokerData = await this.getBrokerRecord(req);

    if (!brokerData?.email) {
      return { success: false, message: 'Broker email not found' };
    }
    if (body.newPassword !== body.confirmPassword) {
      return { success: false, message: 'Passwords do not match' };
    }

    const otpValid = (await this.proxyService.forwardToBroker('VerifyOtp', {
      email: brokerData.email,
      otp: body.emailOtp,
    })) as any;

    if (!otpValid?.success) {
      return { success: false, message: 'Invalid or expired OTP' };
    }

    return this.proxyService.forwardToBroker('UpdateUserField', {
      id: brokerData.id,
      fields: { password: body.newPassword },
    });
  }

  @Post('change-password/request-otp')
  @ApiOperation({ summary: 'Request the OTP that authorises a broker password change' })
  async requestChangePasswordOtp(@Req() req: any) {
    this.getBrokerCode(req);
    const brokerData = await this.getBrokerRecord(req);

    if (!brokerData?.email) {
      return { success: false, message: 'Broker email not found' };
    }

    return this.proxyService.forwardToBroker('ResendOtp', {
      email: brokerData.email,
      channel: 'email',
      purpose: 'password-reset',
    });
  }

  @Post('help')
  @ApiOperation({ summary: 'Submit a help request from the mobile app' })
  async submitHelp(@Req() req: any, @Body() body: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Help request for ${brokerCode}`);
    return this.proxyService.forwardToBroker('SubmitBrokerFeedback', {
      brokerCode,
      email: body.email,
      phone: body.phone,
      content: body.message,
    });
  }

  @Post('account/delete')
  @ApiOperation({ summary: 'Delete the broker account (requires the emailed OTP)' })
  async deleteAccount(@Req() req: any, @Body() body: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Account deletion for ${brokerCode}`);
    return this.proxyService.forwardToBroker('UnsubscribeBroker', {
      brokerCode,
      sessionId: body.sessionId,
      emailOtp: body.emailOtp,
    });
  }

  @Post('account/delete/request-otp')
  @ApiOperation({ summary: 'Request the OTP that confirms an account deletion' })
  async requestDeleteAccountOtp(@Req() req: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Delete account OTP request for ${brokerCode}`);
    return this.proxyService.forwardToBroker('RequestUnsubscribeOtp', { brokerCode });
  }

  @Post('logout')
  @ApiOperation({ summary: 'Log the broker out of the mobile app' })
  async logout(@Req() req: any, @Body() body: any) {
    const brokerCode = this.getBrokerCode(req);
    this.logger.log(`Logout for ${brokerCode}`);
    return this.proxyService.forwardToBroker('LogoutBroker', {
      brokerCode,
      sessionId: body.sessionId,
    });
  }

  @Post('feedback/submit')
  @ApiOperation({ summary: 'Submit broker feedback' })
  async submitFeedback(@Body() body: any) {
    this.logger.log(`Submit broker feedback request for ${body.brokerCode}`);
    return this.proxyService.forwardToBroker('SubmitBrokerFeedback', body);
  }

  @Post('fcm-token')
  @ApiOperation({ summary: 'Save or update broker FCM push token' })
  async saveFcmToken(@Body() body: any) {
    this.logger.log(`Save FCM token request for broker ${body.brokerCode}`);
    return this.proxyService.forwardToBroker('SaveBrokerFcmToken', {
      brokerCode: body.brokerCode,
      fcmToken: body.fcmToken,
      deviceId: body.deviceId,  
    });
  }
}
