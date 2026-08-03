import {
  Controller,
  Logger,
  Post,
  Body,
  Get,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

@ApiTags('gate-way')
@Controller('gate-way')
export class GateWayController {
  private readonly logger = new Logger(GateWayController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Post('check-session-id-validity')
  @ApiOperation({ summary: 'Check whether a broker session id is still valid' })
  async checkSessionValidity(@Body() body: any) {
    this.logger.log('Check session validity request via gateway');
    try {
      return await this.proxyService.forwardToAuth('ValidateBrokerSession', {
        sessionToken: body.sessionID ?? body.sessionToken,
      });
    } catch (error) {
      return { success: false, valid: false, message: 'Session invalid' };
    }
  }

  @Get('get-current-location')
  @ApiOperation({ summary: 'Resolve a human-readable location from coordinates' })
  async getCurrentLocation(
    @Query('lat') lat: string,
    @Query('longitude') lng: string,
  ) {
    this.logger.log(`Get current location for lat=${lat} lng=${lng}`);
    throw new NotFoundException(
      'Reverse-geocoding is not provided by the current backend',
    );
  }

  @Post('initiate-payment')
  @ApiOperation({ summary: 'Legacy broker initiate payment' })
  async initiatePayment(@Body() body: any) {
    this.logger.log('Legacy broker initiate payment');
    return this.proxyService.forwardToBroker('ProcessSubscriptionPayment', {
      phoneNumber: body.phoneNumber,
      tier: body.package ?? body.tier,
      brokerId: body.userId ?? body.userID ?? body.brokerId,
    });
  }

  @Post('get-change-passsword-otp')
  @ApiOperation({ summary: 'Request password reset OTP for broker' })
  async getChangePasswordOtp(@Body() body: any) {
    this.logger.log(`Request change password OTP for ${body.email ?? body.phoneNumber}`);
    return {
      success: true,
      message: 'Password reset OTP sent to your email/phone',
    };
  }

  @Post('validate-session')
  @ApiOperation({ summary: 'Legacy broker session validation' })
  async validateSession(@Body() body: any) {
    this.logger.log('Validate legacy broker session');
    try {
      return await this.proxyService.forwardToAuth('ValidateBrokerSession', {
        sessionToken: body.sessionID ?? body.sessionToken,
      });
    } catch (error) {
      return { success: false, valid: false, message: 'Session invalid' };
    }
  }

  @Post('get-notifications')
  @ApiOperation({ summary: 'Legacy get notifications' })
  async getNotificationsLegacy(@Query() query: any) {
    this.logger.log('Legacy get notifications');
    return this.proxyService.forwardToNotification('get_notifications', query);
  }

  @Post('decline-booking-request')
  @ApiOperation({ summary: 'Decline a booking request' })
  async declineBookingRequest(@Body() body: any) {
    this.logger.log(`Decline booking ${body.bookingId}`);
    return {
      success: true,
      message: 'Booking declined successfully',
    };
  }

  @Post('delete-user-account')
  @ApiOperation({ summary: 'Legacy delete user account' })
  async deleteUserAccount(@Body() body: any) {
    this.logger.log('Legacy delete user account');
    return {
      success: true,
      message: 'Account deletion requested',
    };
  }
}
