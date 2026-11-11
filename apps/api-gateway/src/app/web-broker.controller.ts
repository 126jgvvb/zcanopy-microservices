import { Controller, Logger, Get, Post, Put, Delete, Body, Query, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('web-broker')
@Controller('web/broker')
@UseGuards(JwtAuthGuard)
export class WebBrokerController {
  private readonly logger = new Logger(WebBrokerController.name);

  constructor(private readonly proxyService: ProxyService) {}

  private getBrokerCode(req: any): string {
    return req.user?.brokerCode || req.user?.username || req.session?.brokerCode || '';
  }

  /**
   * Accept both the Spaces origin (`<bucket>.<region>.digitaloceanspaces.com`)
   * and the Spaces CDN (`<bucket>.<region>.cdn.digitaloceanspaces.com`).
   *
   * New uploads are returned as CDN URLs, while older broker records still
   * store origin URLs, so both must count as uploaded documents.
   */
  private isSpacesMediaUrl(url: unknown): boolean {
    if (typeof url !== 'string' || !url) {
      return false;
    }

    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === 'https:' &&
        (parsed.hostname === 'digitaloceanspaces.com' ||
          parsed.hostname.endsWith('.digitaloceanspaces.com'))
      );
    } catch {
      return false;
    }
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Web broker dashboard summary' })
  async getDashboard(@Req() req: any) {
    this.logger.log(`Web broker dashboard request for ${this.getBrokerCode(req)}`);
    const brokerCode = this.getBrokerCode(req);
    const broker = await this.proxyService.forwardToBroker('GetBrokerByCode', { brokerCode });
    const properties = await this.proxyService.forwardToProperty('GetProperties', { page: 1, limit: 100, brokerCode });
    const bookings = await this.proxyService.forwardToProperty('GetBrokerBookings', { brokerCode });
    const wallet = await this.proxyService.forwardToBroker('GetWallet', { walletId: brokerCode });

    return {
      broker,
      properties,
      bookings,
      wallet,
    };
  }

  @Get('properties')
  @ApiOperation({ summary: 'List broker properties or get single property details for web dashboard' })
  async getProperties(@Req() req: any, @Query() query: any) {
    this.logger.log(`Web broker properties request for ${this.getBrokerCode(req)} query=${JSON.stringify(query)}`);
    if (query.id) {
      const result = await this.proxyService.forwardToProperty('GetPublicPropertyDetails', {
        propertyId: query.id,
      });
      return result;
    }
    return this.proxyService.forwardToProperty('GetProperties', {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 12,
      brokerCode: this.getBrokerCode(req),
      location: query.location,
      sortBy: query.sortBy || 'createdAt',
      sortOrder: query.sortOrder || 'DESC',
    });
  }

  @Get('properties/:id')
  @ApiOperation({ summary: 'Get single property details for web dashboard by path param' })
  async getProperty(@Req() req: any, @Param('id') id: string) {
    this.logger.log(`Web broker property detail request for ${this.getBrokerCode(req)} id=${id}`);
    const result = await this.proxyService.forwardToProperty('GetPublicPropertyDetails', {
      propertyId: id,
    });
    return result;
  }

  @Get('properties/:id')
  @ApiOperation({ summary: 'Get single property details for web dashboard' })
  async getPropertyN(@Req() req: any, @Param('id') id: string) {
    this.logger.log(`Web broker property detail request for ${this.getBrokerCode(req)} id=${id}`);
    const result = await this.proxyService.forwardToProperty('GetProperties', {
      id,
      brokerCode: this.getBrokerCode(req),
      page: 1,
      limit: 1,
    });
    const properties = (result as any)?.properties || [];
    return properties[0] || null;
  }

  
  @Post('properties')
  @ApiOperation({ summary: 'Create property from web dashboard' })
  async createProperty(@Req() req: any, @Body() body: any) {
    this.logger.log(`Web broker create property for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToProperty('CreateProperty', {
      ...body,
      brokersUniqueCode: this.getBrokerCode(req),
    });
  }

  @Put('properties/:id')
  @ApiOperation({ summary: 'Update property from web dashboard' })
  async updateProperty(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    this.logger.log(`Web broker update property ${id} for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToProperty('UpdateProperty', {
      id,
      ...body,
    });
  }

  @Put('properties/:id/availability')
  @ApiOperation({ summary: 'Update property availability from web dashboard' })
  async updatePropertyAvailability(@Req() req: any, @Param('id') id: string, @Body() body: { isAvailable: boolean }) {
    this.logger.log(`Web broker update property availability ${id} for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToProperty('UpdateProperty', {
      id,
      isAvailable: body.isAvailable,
    });
  }

  @Delete('properties/:id')
  @ApiOperation({ summary: 'Delete property from web dashboard' })
  async deleteProperty(@Req() req: any, @Param('id') id: string) {
    this.logger.log(`Web broker delete property ${id} for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToProperty('DeleteProperty', { id });
  }

  @Get('bookings')
  @ApiOperation({ summary: 'List broker bookings for web dashboard' })
  async getBookings(@Req() req: any, @Query() query: any) {
    this.logger.log(`Web broker bookings request for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToProperty('GetBrokerBookings', {
      brokerCode: this.getBrokerCode(req),
    });
  }

  @Put('bookings/:id/status')
  @ApiOperation({ summary: 'Update booking status for web dashboard' })
  async updateBookingStatus(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    this.logger.log(`Web broker update booking status ${id} for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToProperty('UpdateBookingStatus', {
      bookingId: id,
      status: body.status,
    });
  }

  @Get('wallet')
  @ApiOperation({ summary: 'Get broker wallet for web dashboard' })
  async getWallet(@Req() req: any) {
    this.logger.log(`Web broker wallet request for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('GetWallet', { walletId: this.getBrokerCode(req) });
  }

  @Get('wallet/transactions')
  @ApiOperation({ summary: 'Get broker wallet transactions for web dashboard' })
  async getWalletTransactions(@Req() req: any, @Query() query: any) {
    this.logger.log(`Web broker wallet transactions request for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('GetWalletTransactions', {
      brokerCode: this.getBrokerCode(req),
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 20,
    });
  }

  @Get('messages')
  @ApiOperation({ summary: 'Get broker messages for web dashboard' })
  async getMessages(@Req() req: any, @Query() query: any) {
    this.logger.log(`Web broker messages request for ${this.getBrokerCode(req)}`);
    const broker = await this.proxyService.forwardToBroker('GetBrokerByCode', { brokerCode: this.getBrokerCode(req) });
    return this.proxyService.forwardToBroker('GetBrokerMessages', {
      brokerId: broker.id,
    });
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw broker wallet funds to mobile money (requires landlord OTP)' })
  async withdraw(@Req() req: any, @Body() body: any) {
    this.logger.log(`Web broker withdraw request for ${this.getBrokerCode(req)}, amount=${body.amount}`);
    return this.proxyService.forwardToBroker('Withdraw', {
      amount: Number(body.amount),
      phoneNumber: body.phoneNumber,
      provider: body.provider,
      payeeName: body.payeeName,
      otp: body.otp,
      brokerCode: this.getBrokerCode(req),
    });
  }

  @Post('withdraw/request-otp')
  @ApiOperation({ summary: 'Request an authorisation OTP sent to the landlord for a withdrawal' })
  async requestWithdrawalOtp(@Req() req: any) {
    this.logger.log(`Web broker withdrawal OTP request for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('RequestLandlordWithdrawalOtp', {
      brokerCode: this.getBrokerCode(req),
    });
  }

  /* ---- Landlord & title (UgNLIS) verification ---- */

  @Post('landlord-details')
  @ApiOperation({ summary: 'Submit landlord identity and property title details for UgNLIS title search' })
  async submitLandlordDetails(@Req() req: any, @Body() body: any) {
    this.logger.log(`Web broker submit landlord details for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('SubmitLandlordDetails', {
      brokerCode: this.getBrokerCode(req),
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
    this.logger.log(`Web broker send landlord broker OTPs for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('SendLandlordBrokerOtps', {
      brokerCode: this.getBrokerCode(req),
      fullName: body.fullName,
      nin: body.nin,
      phoneNumber: body.phoneNumber,
    });
  }

  @Post('landlord-details/authorization-otp')
  @ApiOperation({ summary: 'Send an authorisation OTP to a landlord already verified for another broker' })
  async sendLandlordAuthorizationOtp(@Req() req: any, @Body() body: any) {
    this.logger.log(`Web broker send landlord authorisation OTP for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('SendLandlordAuthorizationOtp', {
      brokerCode: this.getBrokerCode(req),
      verificationId: body.verificationId || '',
    });
  }

  @Post('landlord-details/verify-authorization')
  @ApiOperation({
    summary: 'Confirm the landlord authorisation OTP and the landlord NIN for the requesting broker',
  })
  async verifyLandlordAuthorization(@Req() req: any, @Body() body: any) {
    this.logger.log(`Web broker verify landlord authorisation for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('VerifyLandlordAuthorization', {
      brokerCode: this.getBrokerCode(req),
      verificationId: body.verificationId || '',
      otp: body.otp || '',
      landlordNin: body.landlordNin ?? body.brokerNin ?? '',
    });
  }

  @Get('landlord-details/status')
  @ApiOperation({ summary: 'Get the landlord & title verification status for the authenticated broker' })
  async getLandlordDetailsStatus(@Req() req: any) {
    this.logger.log(`Web broker landlord details status for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('GetLandlordDetailsStatus', {
      brokerCode: this.getBrokerCode(req),
    });
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Get broker subscription details (tier, expiry, limits)' })
  async getSubscription(@Req() req: any) {
    this.logger.log(`Web broker subscription details request for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('GetSubscriptionDetails', {
      brokerCode: this.getBrokerCode(req),
    });
  }

  @Get('subscription/packages')
  @ApiOperation({ summary: 'Get available subscription packages/tiers' })
  async getSubscriptionPackages() {
    this.logger.log('Web broker subscription packages request');
    return this.proxyService.forwardToBroker('GetAvailableTiers', {});
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe the authenticated broker to a tier via mobile money' })
  async subscribe(@Req() req: any, @Body() body: any) {
    this.logger.log(`Web broker subscribe request for ${this.getBrokerCode(req)}, tier=${body.tier}`);
    return this.proxyService.forwardToBroker('ProcessSubscriptionPayment', {
      brokerId: this.getBrokerCode(req),
      tier: body.tier,
      phoneNumber: body.phoneNumber,
    });
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get broker notifications for web dashboard' })
  async getNotifications(@Req() req: any, @Query() query: any) {
    this.logger.log(`Web broker notifications request for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToNotification('get_notifications', {
      brokerCode: this.getBrokerCode(req),
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 20,
      type: query.type,
      read: query.read,
    });
  }

  @Post('notifications/mark-read')
  @ApiOperation({ summary: 'Mark broker notifications as read' })
  async markNotificationsRead(@Req() req: any, @Body() body: any) {
    this.logger.log(`Web broker mark notifications read for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToNotification('mark_as_read', {
      brokerCode: this.getBrokerCode(req),
      id: body.id,
      ids: body.ids,
      all: body.all,
    });
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get broker profile for web dashboard' })
  async getProfile(@Req() req: any) {
    this.logger.log(`Web broker profile request for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('GetBrokerByCode', { brokerCode: this.getBrokerCode(req) });
  }

  @Post('profile')
  @ApiOperation({ summary: 'Update broker profile for web dashboard' })
  async updateProfile(@Req() req: any, @Body() body: any) {
    this.logger.log(`Web broker update profile for ${this.getBrokerCode(req)}`);
    const broker = await this.proxyService.forwardToBroker('GetBrokerByCode', { brokerCode: this.getBrokerCode(req) });
  
    console.log(`broker JSON:${JSON.stringify(broker)}`);
  
    return this.proxyService.forwardToBroker('SaveUserInfo', {
      userId: (broker as any).broker.id,
      ...body,
    });
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change broker password for web dashboard (requires OTP)' })
  async changePassword(@Req() req: any, @Body() body: any) {
    this.logger.log(`Web broker change password for ${this.getBrokerCode(req)}`);
    const broker = await this.proxyService.forwardToBroker('GetBrokerByCode', { brokerCode: this.getBrokerCode(req) });
    const brokerData = (broker as any).broker;

    if (!brokerData?.email) {
      return { success: false, message: 'Broker email not found' };
    }

    if (body.newPassword !== body.confirmPassword) {
      this.logger.warn(
        `Password mismatch for broker ${this.getBrokerCode(req)}: ` +
        `newPassword=${JSON.stringify(body.newPassword)} (type=${typeof body.newPassword}), ` +
        `confirmPassword=${JSON.stringify(body.confirmPassword)} (type=${typeof body.confirmPassword})`,
      );
      return { success: false, message: 'Passwords do not match' };
    }

    const otpValid = await this.proxyService.forwardToBroker('VerifyOtp', {
      email: brokerData.email,
      otp: body.emailOtp,
    });  

    if (!otpValid?.success) {
      return { success: false, message: 'Invalid or expired OTP' };
    }

    return this.proxyService.forwardToBroker('UpdateUserField', {
      id: brokerData.id,
      fields: { password: body.newPassword },
    });
  }

  @Post('change-password/request-otp')
  @ApiOperation({ summary: 'Request OTP for broker password change' })
  async requestChangePasswordOtp(@Req() req: any) {
    this.logger.log(`Web broker request change password OTP for ${this.getBrokerCode(req)}`);
    const broker = await this.proxyService.forwardToBroker('GetBrokerByCode', { brokerCode: this.getBrokerCode(req) });
    const brokerData = (broker as any).broker;

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
  @ApiOperation({ summary: 'Submit broker feedback/help request for web dashboard' })
  async submitHelp(@Req() req: any, @Body() body: any) {
    this.logger.log(`Web broker help request for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('SubmitBrokerFeedback', {
      brokerCode: this.getBrokerCode(req),
      email: body.email,
      phone: body.phone,
      content: body.message,
    });
  }

  @Post('account/delete')
  @ApiOperation({ summary: 'Delete broker account for web dashboard' })
  async deleteAccount(@Req() req: any, @Body() body: any) {
    this.logger.log(`Web broker account deletion for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('UnsubscribeBroker', {
      brokerCode: this.getBrokerCode(req),
      sessionId: body.sessionId,
      emailOtp: body.emailOtp,
    });
  }

  @Post('account/delete/request-otp')
  @ApiOperation({ summary: 'Request OTP to confirm broker account deletion' })
  async requestDeleteAccountOtp(@Req() req: any) {
    this.logger.log(`Web broker request delete account OTP for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('RequestUnsubscribeOtp', {
      brokerCode: this.getBrokerCode(req),
    });
  }

  @Post('logout')
  @ApiOperation({ summary: 'Log broker out of the web dashboard' })
  async logout(@Req() req: any, @Body() body: any) {
    this.logger.log(`Web broker logout for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('LogoutBroker', {
      brokerCode: this.getBrokerCode(req),
      sessionId: body.sessionId,
    });
  }

  @Get('verification/status')
  @ApiOperation({ summary: 'Get broker verification status for web dashboard' })
  async getVerificationStatus(@Req() req: any) {
    this.logger.log(`Web broker verification status request for ${this.getBrokerCode(req)}`);
    const broker = await this.proxyService.forwardToBroker('GetBrokerByCode', { brokerCode: this.getBrokerCode(req) });
    const Data = broker as any;
    const brokerData=Data.broker;

    this.logger.log(`Broker raw ninImages: ${JSON.stringify(brokerData.ninImages)}`);
    console.log(`[WebBrokerController] raw broker data for verification:`, JSON.stringify(brokerData));

    const ninImages = Array.isArray(brokerData.ninImages) ? brokerData.ninImages : [];
    const hasUploadedDocuments =
      ninImages.length >= 2 && ninImages.every((url: string) => this.isSpacesMediaUrl(url));

    const verificationStatus = brokerData.isVerified ? 'approved' : hasUploadedDocuments ? 'pending' : 'unsubmitted';

    return {
      isVerified: brokerData.isVerified || false,
      idFrontUrl: ninImages[0] || null,
      idBackUrl: ninImages[1] || null,
      verificationStatus,
    };
  }

  @Post('verification/documents')
  @ApiOperation({ summary: 'Submit broker ID documents for verification' })
  async submitVerificationDocuments(@Req() req: any, @Body() body: any) {
    this.logger.log(`Web broker submit verification documents for ${this.getBrokerCode(req)}`);
    return this.proxyService.forwardToBroker('SubmitVerificationDocuments', {
      brokerCode: this.getBrokerCode(req),
      idFrontUrl: body.idFrontUrl,
      idBackUrl: body.idBackUrl,
    });
  }
}
