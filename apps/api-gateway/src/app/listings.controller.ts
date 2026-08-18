import { Controller, Logger, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  private readonly logger = new Logger(ListingsController.name);

  constructor(private readonly proxyService: ProxyService) {}

  private mapSessionId(query: any): any {
    if (query.sessionID && !query.sessionToken) {
      return { ...query, sessionToken: query.sessionID };
    }
    return query;
  }

  @Get('nearby') //confirmed
  @ApiOperation({ summary: 'Get nearby properties (legacy)' })
  async getNearbyProperties(@Query() query: any) {
    const mapped = this.mapSessionId(query);
    this.logger.log(`Get nearby properties request`);
    return this.proxyService.forwardToProperty('FindNearbyProperties', mapped);
  }

  @Get('get-nearby-properties')
  @ApiOperation({ summary: 'Get nearby properties (legacy alt)' })
  async getNearbyPropertiesAlt(@Query() query: any) {
    const mapped = this.mapSessionId(query);
    this.logger.log(`Get nearby properties alt request`);
    return this.proxyService.forwardToProperty('FindNearbyProperties', mapped);
  }

  @Get('get_property_by_id') //confirmed
  @ApiOperation({ summary: 'Get property by ID (legacy)' })
  async getPropertyById(@Query() query: any) {
    this.logger.log(`Get property by ID request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToProperty('GetProperties', query);
  }

  @Get('get-user-properties')
  @ApiOperation({ summary: 'Get user properties (legacy)' })
  async getUserProperties(@Query() query: any) {
    this.logger.log(`Get user properties request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToProperty('GetProperties', query);
  }

  /*confirmed*/
  @Get('search')
  @ApiOperation({ summary: 'Search properties by broker title' })
  async searchProperties(@Query() query: any) {
    this.logger.log(`Search properties request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToProperty('SearchPropertiesByBrokerTitle', query);
  }

  @Get('get_property_clients') //confirmed
  @ApiOperation({ summary: 'Get property clients' })
  async getPropertyClients(@Query() query: any) {
    this.logger.log(`Get property clients request: ${JSON.stringify(query)}`);
    return this.proxyService.forwardToProperty('GetPropertyClients', query);
  }

  @Get('get-nearby-properties-to-plot')
  @ApiOperation({ summary: 'Get nearby properties to plot on map' })
  async getNearbyPropertiesToPlot(@Query() query: any) {
    const mapped = this.mapSessionId(query);
    this.logger.log(`Get nearby properties to plot request`);
    return this.proxyService.forwardToProperty('FindNearbyProperties', mapped);
  }

  @Get('get-item-details')
  @ApiOperation({ summary: 'Get property item details (legacy)' })
  async getItemDetails(@Query() query: any) {
    const { 'item-id': itemId, ...rest } = query;
    this.logger.log(`Get item details request for id=${itemId}`);
    return this.proxyService.forwardToProperty('GetProperties', { ...rest, id: itemId });
  }
}
