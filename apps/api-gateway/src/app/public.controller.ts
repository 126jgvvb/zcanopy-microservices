import { Controller, Logger, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

@ApiTags('public')
@Controller('public')
export class PublicController {
  private readonly logger = new Logger(PublicController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Get('properties/featured')
  @ApiOperation({ summary: 'Get featured property listings' })
  async getFeaturedProperties(@Query('limit') limit?: string) {
    this.logger.log(`Get featured properties request with limit=${limit}`);
    return this.proxyService.forwardToProperty('GetFeaturedProperties', { limit: Number(limit) || 6 });
  }
}
