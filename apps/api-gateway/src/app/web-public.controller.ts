import { Controller, Logger, Get, Query, Body, Post, Put, Delete, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('web-public')
@Controller('web/public')
export class WebPublicController {
  private readonly logger = new Logger(WebPublicController.name);

  constructor(private readonly proxyService: ProxyService) {}

  private getSessionToken(req: any): string {
    return req?.session?.sessionId || req?.headers?.['x-session-id'] || 'public-web';
  }

  @Get('properties')
  @ApiOperation({ summary: 'Public property listings for web dashboard' })
  async getPublicProperties(@Query() query: any, @Req() req: any) {
    this.logger.log(`Web public properties request sessionId=${this.getSessionToken(req)}`);
    return this.proxyService.forwardToProperty('GetProperties', {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 12,
      location: query.location,
      propertyType: query.propertyType,
      sortBy: query.sortBy || 'createdAt',
      sortOrder: query.sortOrder || 'DESC',
      minAmount: query.minAmount ? Number(query.minAmount) : undefined,
      maxAmount: query.maxAmount ? Number(query.maxAmount) : undefined,
      sessionToken: this.getSessionToken(req),
    });
  }

  @Get('properties/featured')
  @ApiOperation({ summary: 'Featured property listings for web dashboard' })
  async getFeaturedProperties(@Query('limit') limit?: string, @Req() req?: any) {
    this.logger.log(`Web featured properties request sessionId=${this.getSessionToken(req)}`);
    return this.proxyService.forwardToProperty('GetFeaturedProperties', {
      limit: Number(limit) || 6,
      sessionToken: this.getSessionToken(req),
    });
  }

  @Get('properties/:id')
  @ApiOperation({ summary: 'Public property details for web dashboard' })
  async getPublicPropertyDetails(@Param('id') id: string, @Req() req: any) {
    this.logger.log(`Web public property details request for ${id} sessionId=${this.getSessionToken(req)}`);
    return this.proxyService.forwardToProperty('GetPropertyDetailsForCustomer', {
      sessionToken: this.getSessionToken(req),
      propertyId: id,
    });
  }

  @Get('search')
  @ApiOperation({ summary: 'Search properties for web dashboard' })
  async searchProperties(@Query() query: any, @Req() req: any) {
    this.logger.log(`Web property search request for query=${query.q} sessionId=${this.getSessionToken(req)}`);
    return this.proxyService.forwardToProperty('SearchPropertiesByBrokerTitle', {
      query: query.q || '',
      sessionToken: this.getSessionToken(req),
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 12,
      lat: query.lat ? Number(query.lat) : undefined,
      lng: query.lng ? Number(query.lng) : undefined,
      radiusKm: query.radiusKm ? Number(query.radiusKm) : undefined,
    });
  }
}
