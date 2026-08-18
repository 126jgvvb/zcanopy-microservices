import { Controller, Logger, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('admin')
@Controller('admin')
@ApiBearerAuth()
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Get('commissions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get commission rates' })
  async getCommissions() {
    this.logger.log('Get commissions request');
    return this.proxyService.forwardToAdmin('GetCommissions', {});
  }

  @Get('broker-commissions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get commission per broker' })
  async getBrokerCommissions() {
    this.logger.log('Get broker commissions request');
    return this.proxyService.forwardToAdmin('GetBrokerCommissions', {});
  }

  @Get('brokers')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all brokers' })
  async getAllBrokers(@Query() query: any) {
    this.logger.log(`Get all brokers request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToAdmin('GetAllBrokers', query);
  }

  @Get('pending/verifications')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get pending verifications' })
  async getPendingVerifications(@Query() query: any) {
    this.logger.log(`Get pending verifications request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToAdmin('GetPendingVerifications', query);
  }

  @Get('properties')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get properties' })
  async getProperties(@Query() query: any) {
    this.logger.log(`Get properties request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToAdmin('GetProperties', query);
  }

  @Get('recent/signups')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get recent signups' })
  async getRecentSignups(@Query() query: any) {
    this.logger.log(`Get recent signups request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToAdmin('GetRecentSignups', query);
  }

  @Get('property/locations')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get property locations' })
  async getPropertyLocations() {
    this.logger.log('Get property locations request');
    return this.proxyService.forwardToAdmin('GetPropertyLocations', {});
  }

  @Get('admins')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all admins' })
  async getAllAdmins() {
    this.logger.log('Get all admins request');
    return this.proxyService.forwardToAdmin('GetAllAdmins', {});
  }

  @Post('admins')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add admin' })
  async addAdmin(@Body() body: any) {
    this.logger.log(`Add admin request for ${body.email}`);
    return this.proxyService.forwardToAdmin('AddAdmin', body);
  }

  @Delete('admins/:adminId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete admin' })
  async deleteAdmin(@Param('adminId') adminId: string, @Body() body: any) {
    this.logger.log(`Delete admin request for ${adminId}`);
    return this.proxyService.forwardToAdmin('DeleteAdmin', { adminId, ...body });
  }

  @Put('admins/:adminId/freeze')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Freeze/unfreeze admin' })
  async freezeAdmin(@Param('adminId') adminId: string, @Body() body: any) {
    this.logger.log(`Freeze admin request for ${adminId}`);
    return this.proxyService.forwardToAdmin('FreezeAdmin', { adminId, ...body });
  }

  @Get('system/messages')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get system messages' })
  async getSystemMessages(@Query() query: any) {
    this.logger.log(`Get system messages request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToAdmin('GetSystemMessages', query);
  }

  @Get('client/messages')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get client messages' })
  async getClientMessages(@Query() query: any) {
    this.logger.log(`Get client messages request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToAdmin('GetClientMessages', query);
  }

  @Get('brokers/:brokerId/details')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get broker details' })
  async getBrokerDetails(@Param('brokerId') brokerId: string) {
    this.logger.log(`Get broker details request for ${brokerId}`);
    return this.proxyService.forwardToAdmin('GetBrokerDetails', { brokerId });
  }

  @Get('brokers/:brokerId/properties')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get broker properties' })
  async getBrokerProperties(@Param('brokerId') brokerId: string, @Query() query: any) {
    this.logger.log(`Get broker properties request for ${brokerId}`);
    return this.proxyService.forwardToAdmin('GetBrokerProperties', { brokerId, ...query });
  }

  @Get('income/monthly')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get monthly income' })
  async getMonthlyIncome() {
    this.logger.log('Get monthly income request');
    return this.proxyService.forwardToAdmin('GetMonthlyIncome', {});
  }

  @Get('commission/current')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current commission' })
  async getCurrentCommission() {
    this.logger.log('Get current commission request');
    return this.proxyService.forwardToAdmin('GetCurrentCommission', {});
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get transactions' })
  async getTransactions(@Query() query: any) {
    this.logger.log(`Get transactions request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToAdmin('GetTransactions', query);
  }

  @Get('logs')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get logs' })
  async getLogs(@Query() query: any) {
    this.logger.log(`Get logs request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToAdmin('GetLogs', query);
  }

  @Post('messages/send')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send message' })
  async sendMessage(@Body() body: any) {
    this.logger.log(`Send message request from admin ${body.adminId}`);
    return this.proxyService.forwardToAdmin('SendMessage', body);
  }

  @Put('email')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update admin email' })
  async updateAdminEmail(@Body() body: any) {
    this.logger.log(`Update admin email request for ${body.adminId}`);
    return this.proxyService.forwardToAdmin('UpdateAdminEmail', body);
  }

  @Put('sms')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update admin SMS' })
  async updateAdminSms(@Body() body: any) {
    this.logger.log(`Update admin SMS request for ${body.adminId}`);
    return this.proxyService.forwardToAdmin('UpdateAdminSms', body);
  }

  @Get('customers/active-sessions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get active customer sessions from Redis' })
  async getActiveCustomerSessions() {
    this.logger.log('Get active customer sessions request');
    return this.proxyService.forwardToAdmin('GetActiveCustomerSessions', {});
  }

  @Post('login')
  @ApiOperation({ summary: 'Admin login (returns base64 token)' })
  async loginAdmin(@Body() body: any) {
    this.logger.log(`Admin login request for ${body.email}`);
    return this.proxyService.forwardToAdmin('LoginAdmin', body);
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new admin via invitation code' })
  async registerAdmin(@Body() body: any) {
    this.logger.log(`Register admin request for ${body.email}`);
    return this.proxyService.forwardToAdmin('RegisterAdmin', body);
  }

  @Post('invitation-code')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Generate an invitation code (super admin only)' })
  async generateInvitationCode(@Body() body: any, @Req() req: any) {
    const adminId = req.user?.sub || req.user?.id;
    this.logger.log(`Generate invitation code request from admin ${adminId}`);
    return this.proxyService.forwardToAdmin('GenerateInvitationCode', {
      ...body,
      superAdminId: adminId,
    });
  }

  @Get('pending/documents')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get pending broker verification documents' })
  async getPendingDocuments() {
    this.logger.log('Get pending documents request');
    return this.proxyService.forwardToAdmin('GetPendingDocuments', {});
  }

  @Post('brokers/:brokerId/approve-document')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Approve/reject a broker document' })
  async approveBrokerDocument(
    @Param('brokerId') brokerId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const adminId = req.user?.sub || req.user?.id;
    this.logger.log(`Approve broker document request for broker ${brokerId} by admin ${adminId}`);
    return this.proxyService.forwardToAdmin('ApproveBrokerDocument', {
      brokerId,
      adminId,
      ...body,
    });
  }

  @Delete('brokers/:brokerId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a broker (super admin only)' })
  async deleteBroker(
    @Param('brokerId') brokerId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const adminId = req.user?.sub || req.user?.id;
    this.logger.log(`Delete broker request for ${brokerId} by admin ${adminId}`);
    return this.proxyService.forwardToAdmin('DeleteBroker', {
      brokerId,
      adminId,
    });
  }

  @Put('brokers/:brokerId/tier')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Edit a broker subscription tier (super admin only)' })
  async editBrokerTier(
    @Param('brokerId') brokerId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const adminId = req.user?.sub || req.user?.id;
    this.logger.log(`Edit broker tier request for ${brokerId} by admin ${adminId}`);
    return this.proxyService.forwardToAdmin('EditBrokerTier', {
      brokerId,
      adminId,
      tier: body.tier,
    });
  }

  @Post('pending/verifications/approve-all')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Approve all pending broker verifications' })
  async approveAllPendingVerifications(@Body() body: any, @Req() req: any) {
    const adminId = req.user?.sub || req.user?.id;
    this.logger.log(`Approve all pending verifications request by admin ${adminId}`);
    return this.proxyService.forwardToAdmin('ApproveAllPendingVerifications', {
      adminId,
    });
  }

  @Get('notifications')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get sent admin notifications/messages' })
  async getNotifications(@Query() query: any) {
    this.logger.log(`Get notifications request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToAdmin('GetNotifications', query);
  }

  @Get('wallet')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get platform commission wallet' })
  async getWallet(@Query() query: any) {
    this.logger.log(`Get wallet request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToAdmin('GetWallet', query);
  }

  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Withdraw from platform commission wallet' })
  async withdraw(@Body() body: any) {
    this.logger.log(`Admin withdraw request: amount=${body.amount}`);
    return this.proxyService.forwardToAdmin('Withdraw', body);
  }

  @Get('invoices')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get broker subscription invoices' })
  async getInvoices(@Query() query: any) {
    this.logger.log(`Get invoices request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToAdmin('GetInvoices', query);
  }

  @Delete('invoices/batch-delete')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete multiple invoices' })
  async deleteInvoices(@Body() body: { invoiceIds: string[] }) {
    this.logger.log(`Delete invoices request for ${body.invoiceIds?.length ?? 0} ids`);
    return this.proxyService.forwardToAdmin('DeleteInvoices', { invoiceIds: body?.invoiceIds ?? [] });
  }

  @Delete('invoices/:invoiceId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a single invoice' })
  async deleteInvoice(@Param('invoiceId') invoiceId: string) {
    this.logger.log(`Delete invoice request for ${invoiceId}`);
    return this.proxyService.forwardToAdmin('DeleteInvoice', { invoiceId });
  }
}
