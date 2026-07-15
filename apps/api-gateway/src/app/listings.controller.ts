import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly proxyService: ProxyService) {}

  private mapSessionId(query: any): any {
    if (query.sessionID && !query.sessionToken) {
      return { ...query, sessionToken: query.sessionID };
    }
    return query;
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Get nearby properties (legacy)' })
  async getNearbyProperties(@Query() query: any) {
    const mapped = this.mapSessionId(query);
    return this.proxyService.forwardToProperty('FindNearbyProperties', mapped);
  }

  @Get('get-nearby-properties')
  @ApiOperation({ summary: 'Get nearby properties (legacy alt)' })
  async getNearbyPropertiesAlt(@Query() query: any) {
    const mapped = this.mapSessionId(query);
    return this.proxyService.forwardToProperty('FindNearbyProperties', mapped);
  }

  @Get('get_property_by_id')
  @ApiOperation({ summary: 'Get property by ID (legacy)' })
  async getPropertyById(@Query() query: any) {
    return this.proxyService.forwardToProperty('GetProperties', query);
  }

  @Get('get-user-properties')
  @ApiOperation({ summary: 'Get user properties (legacy)' })
  async getUserProperties(@Query() query: any) {
    return this.proxyService.forwardToProperty('GetProperties', query);
  }
}
