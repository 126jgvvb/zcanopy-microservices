import { Controller, Logger, Post, Body, UnauthorizedException, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { JwtService } from '@nestjs/jwt';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly proxyService: ProxyService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('login')
  async login(@Body() dto: any) {
    this.logger.log('Login request via gateway');
    return this.proxyService.forwardToAuth('Login', { ...dto, type: 'admin' });
  }

  @Post('broker/login')
  async brokerLogin(@Body() dto: any) {
    this.logger.log('Broker login request via gateway');
    return this.proxyService.forwardToAuth('Login', { ...dto, type: 'broker' });
  }

  @Post('broker/setup')
  async brokerSetup(@Body() dto: any) {
    this.logger.log('Broker account setup request via gateway');
    return this.proxyService.forwardToAuth('SetupBroker', dto);
  }

  @Post('refresh')
  async refresh(@Body() dto: any) {
    this.logger.log('Refresh token request via gateway');
    return this.proxyService.forwardToAuth('RefreshToken', dto);
  }

  @Post('dev-login')
  async devLogin(@Body() body: { email: string; password: string }) {
    this.logger.warn(`Dev login attempt for ${body.email}`);
    const accounts = [
      { email: 'superadmin@zcanopy.dev', password: 'superadmin123', role: 'super_admin', username: 'Super Admin' },
      { email: 'admin@zcanopy.dev', password: 'admin123', role: 'admin', username: 'Admin' },
      { email: 'support@zcanopy.dev', password: 'support123', role: 'support', username: 'Support' },
    ];
    const match = accounts.find(
      (a) => a.email === body.email && a.password === body.password,
    );
    if (!match) {
      throw new UnauthorizedException('Invalid dev credentials');
    }
    const payload = {
      sub: `dev-${match.role}-1`,
      email: match.email,
      role: match.role,
    };
    const token = this.jwtService.sign(payload);
    return {
      id: payload.sub,
      username: match.username,
      email: match.email,
      role: match.role,
      token,
    };
  }
}

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Get('get-user-by-id')
  @ApiOperation({ summary: 'Get user by ID' })
  async getUserById(@Query('id') id: string) {
    this.logger.log(`Get user by ID: ${id}`);
    return this.proxyService.forwardToAuth('GetBrokerSession', { sessionToken: id });
  }

  @Get('get-user-by-email')
  @ApiOperation({ summary: 'Get user by email' })
  async getUserByEmail(@Query('email') email: string) {
    this.logger.log(`Get user by email: ${email}`);
    return this.proxyService.forwardToBroker('SearchBrokers', { query: email });
  }

  @Get('get-user-by-username')
  @ApiOperation({ summary: 'Get user by username' })
  async getUserByUsername(@Query('username') username: string) {
    this.logger.log(`Get user by username: ${username}`);
    return this.proxyService.forwardToBroker('SearchBrokers', { query: username });
  }

  @Get('get-user-profile')
  @ApiOperation({ summary: 'Get user profile data for edit profile' })
  async getUserProfile(@Query('userId') userId: string) {
    this.logger.log(`Get user profile for userId: ${userId}`);
    return this.proxyService.forwardToAuth('GetUserProfile', { userId });
  }

  @Post('save-user-info')
  @ApiOperation({ summary: 'Save user information' })
  async saveUserInfo(@Body() body: any) {
    this.logger.log(`Save user info for ${body.userId}`);
    return this.proxyService.forwardToBroker('SaveUserInfo', body);
  }

  @Post('update-user-field')
  @ApiOperation({ summary: 'Update a specific user field' })
  async updateUserField(@Body() body: any) {
    this.logger.log(`Update user ${body.id} field`);
    return this.proxyService.forwardToBroker('UpdateUserField', body);
  }

  @Post('update_fcm_token')
  @ApiOperation({ summary: 'Update FCM push notification token' })
  async updateFcmToken(@Body() body: any) {
    this.logger.log(`Update FCM token for user ${body.userId}`);
    return this.proxyService.forwardToBroker('SaveBrokerFcmToken', {
      brokerCode: body.userId,
      fcmToken: body.fcmToken,
      deviceId: body.deviceId,
    });
  }

  @Post('logout-user')
  @ApiOperation({ summary: 'Logout user/customer' })
  async logoutUser(@Body() body: any) {
    this.logger.log(`Logout user ${body.userID}`);
    try {
      return await this.proxyService.forwardToAuth('RevokeCustomerSession', {
        sessionToken: body.userID,
      });
    } catch (error) {
      return { success: false, message: 'Session invalid' };
    }
  }

  @Post('request-reset-password-otp')
  @ApiOperation({ summary: 'Request password reset OTP' })
  async requestResetPasswordOtp(@Body() body: any) {
    this.logger.log(`Request reset password OTP for ${body.email}`);
    return this.proxyService.forwardToBroker('ResendOtp', {
      email: body.email,
      channel: 'email',
    });
  }

  @Post('request-account-deletion-otp')
  @ApiOperation({ summary: 'Request account deletion OTP' })
  async requestAccountDeletionOtp(@Body() body: any) {
    this.logger.log(`Request account deletion OTP for ${body.userId}`);
    return this.proxyService.forwardToBroker('RequestUnsubscribeOtp', {
      brokerCode: body.userId,
    });
  }

  @Post('get-account-deletion-code')
  @ApiOperation({ summary: 'Get account deletion code for broker' })
  async getAccountDeletionCode(@Body() body: any) {
    this.logger.log(`Get account deletion code for ${body.email ?? body.userID}`);
    return this.proxyService.forwardToBroker('RequestUnsubscribeOtp', {
      brokerCode: body.userId ?? body.userID ?? body.email,
    });
  }
}
