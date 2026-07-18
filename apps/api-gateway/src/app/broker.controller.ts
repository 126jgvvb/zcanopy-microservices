import { Controller, Logger, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
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
    return this.proxyService.forwardToBroker('GetAllBrokers', query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get broker by ID' })
  async getBrokerById(@Param('id') id: string) {
    return this.proxyService.forwardToBroker('GetBrokerById', { id });
  }

  @Post()
  @ApiOperation({ summary: 'Create broker' })
  async createBroker(@Body() body: any) {
    return this.proxyService.forwardToBroker('CreateBroker', body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update broker' })
  async updateBroker(@Param('id') id: string, @Body() body: any) {
    return this.proxyService.forwardToBroker('UpdateBroker', { id, ...body });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete broker' })
  async deleteBroker(@Param('id') id: string) {
    return this.proxyService.forwardToBroker('DeleteBroker', { id });
  }

  @Get('pending/verifications')
  @ApiOperation({ summary: 'Get pending verifications' })
  async getPendingVerifications(@Query() query: any) {
    return this.proxyService.forwardToBroker('GetPendingVerifications', query);
  }

  @Get('recent/signups')
  @ApiOperation({ summary: 'Get recent signups' })
  async getRecentSignups(@Query() query: any) {
    return this.proxyService.forwardToBroker('GetRecentSignups', query);
  }

  @Get('dashboard/:brokerId')
  @ApiOperation({ summary: 'Get broker dashboard' })
  async getBrokerDashboard(@Param('brokerId') brokerId: string) {
    return this.proxyService.forwardToBroker('GetBrokerDashboard', { brokerId });
  }

  @Get('search')
  @ApiOperation({ summary: 'Search brokers by title or username' })
  async searchBrokers(@Query('q') q: string) {
    return this.proxyService.forwardToBroker('SearchBrokers', { query: q });
  }

  @Post(':id/subscribe')
  @ApiOperation({ summary: 'Subscribe broker to a tier via mobile money' })
  async subscribeBroker(
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.proxyService.forwardToBroker('ProcessSubscriptionPayment', {
      brokerId: id,
      tier: body.tier,
      phoneNumber: body.phoneNumber,
    });
  }

  @Post('feedback/submit')
  @ApiOperation({ summary: 'Submit broker feedback' })
  async submitFeedback(@Body() body: any) {
    return this.proxyService.forwardToBroker('SubmitBrokerFeedback', body);
  }
}
