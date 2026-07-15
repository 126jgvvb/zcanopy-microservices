import { Controller, Logger, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Get('commissions')
  @ApiOperation({ summary: 'Get commission rates' })
  async getCommissions() {
    return this.proxyService.forwardToAdmin('GetCommissions', {});
  }

  @Get('brokers')
  @ApiOperation({ summary: 'Get all brokers' })
  async getAllBrokers(@Query() query: any) {
    return this.proxyService.forwardToAdmin('GetAllBrokers', query);
  }

  @Get('pending/verifications')
  @ApiOperation({ summary: 'Get pending verifications' })
  async getPendingVerifications(@Query() query: any) {
    return this.proxyService.forwardToAdmin('GetPendingVerifications', query);
  }

  @Get('properties')
  @ApiOperation({ summary: 'Get properties' })
  async getProperties(@Query() query: any) {
    return this.proxyService.forwardToAdmin('GetProperties', query);
  }

  @Get('recent/signups')
  @ApiOperation({ summary: 'Get recent signups' })
  async getRecentSignups(@Query() query: any) {
    return this.proxyService.forwardToAdmin('GetRecentSignups', query);
  }

  @Get('property/locations')
  @ApiOperation({ summary: 'Get property locations' })
  async getPropertyLocations() {
    return this.proxyService.forwardToAdmin('GetPropertyLocations', {});
  }

  @Get('admins')
  @ApiOperation({ summary: 'Get all admins' })
  async getAllAdmins() {
    return this.proxyService.forwardToAdmin('GetAllAdmins', {});
  }

  @Post('admins')
  @ApiOperation({ summary: 'Add admin' })
  async addAdmin(@Body() body: any) {
    return this.proxyService.forwardToAdmin('AddAdmin', body);
  }

  @Delete('admins/:adminId')
  @ApiOperation({ summary: 'Delete admin' })
  async deleteAdmin(@Param('adminId') adminId: string, @Body() body: any) {
    return this.proxyService.forwardToAdmin('DeleteAdmin', { adminId, ...body });
  }

  @Put('admins/:adminId/freeze')
  @ApiOperation({ summary: 'Freeze/unfreeze admin' })
  async freezeAdmin(@Param('adminId') adminId: string, @Body() body: any) {
    return this.proxyService.forwardToAdmin('FreezeAdmin', { adminId, ...body });
  }

  @Get('system/messages')
  @ApiOperation({ summary: 'Get system messages' })
  async getSystemMessages(@Query() query: any) {
    return this.proxyService.forwardToAdmin('GetSystemMessages', query);
  }

  @Get('client/messages')
  @ApiOperation({ summary: 'Get client messages' })
  async getClientMessages(@Query() query: any) {
    return this.proxyService.forwardToAdmin('GetClientMessages', query);
  }

  @Get('brokers/:brokerId/details')
  @ApiOperation({ summary: 'Get broker details' })
  async getBrokerDetails(@Param('brokerId') brokerId: string) {
    return this.proxyService.forwardToAdmin('GetBrokerDetails', { brokerId });
  }

  @Get('brokers/:brokerId/properties')
  @ApiOperation({ summary: 'Get broker properties' })
  async getBrokerProperties(@Param('brokerId') brokerId: string, @Query() query: any) {
    return this.proxyService.forwardToAdmin('GetBrokerProperties', { brokerId, ...query });
  }

  @Get('income/monthly')
  @ApiOperation({ summary: 'Get monthly income' })
  async getMonthlyIncome() {
    return this.proxyService.forwardToAdmin('GetMonthlyIncome', {});
  }

  @Get('commission/current')
  @ApiOperation({ summary: 'Get current commission' })
  async getCurrentCommission() {
    return this.proxyService.forwardToAdmin('GetCurrentCommission', {});
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get transactions' })
  async getTransactions(@Query() query: any) {
    return this.proxyService.forwardToAdmin('GetTransactions', query);
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get logs' })
  async getLogs(@Query() query: any) {
    return this.proxyService.forwardToAdmin('GetLogs', query);
  }

  @Post('messages/send')
  @ApiOperation({ summary: 'Send message' })
  async sendMessage(@Body() body: any) {
    return this.proxyService.forwardToAdmin('SendMessage', body);
  }

  @Put('email')
  @ApiOperation({ summary: 'Update admin email' })
  async updateAdminEmail(@Body() body: any) {
    return this.proxyService.forwardToAdmin('UpdateAdminEmail', body);
  }

  @Put('sms')
  @ApiOperation({ summary: 'Update admin SMS' })
  async updateAdminSms(@Body() body: any) {
    return this.proxyService.forwardToAdmin('UpdateAdminSms', body);
  }
}
