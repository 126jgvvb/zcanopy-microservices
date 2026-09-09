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

  // FindNearbyProperties expects `lng`, but clients send `long`. Map it so
  // the geo-radius filter actually receives the longitude.
  private mapNearbyQuery(query: any): any {
    const mapped = { ...this.mapSessionId(query) };
    if (mapped.long != null) {
      mapped.lng = Number(mapped.long);
      delete mapped.long;
    }
    return mapped;
  }

  @Get('nearby') //confirmed
  @ApiOperation({ summary: 'Get nearby properties (legacy)' })
  async getNearbyProperties(@Query() query: any) {
    const mapped = this.mapNearbyQuery(query);
    this.logger.log(`Get nearby properties request`);
    return this.proxyService.forwardToProperty('FindNearbyProperties', mapped);
  }

  @Get('get-nearby-properties')
  @ApiOperation({ summary: 'Get nearby properties (legacy alt)' })
  async getNearbyPropertiesAlt(@Query() query: any) {
    const mapped = this.mapNearbyQuery(query);
    this.logger.log(`Get nearby properties alt request`);
    return this.proxyService.forwardToProperty('FindNearbyProperties', mapped);
  }

  @Get('get_property_by_id')
  @ApiOperation({ summary: 'Get a single property by id owned by the calling broker' })
  async getPropertyById(@Query() query: any) {
    const { id, brokerCode } = query;
    this.logger.log(`Get property by id=${id} for broker=${brokerCode}`);
    if (!id || !brokerCode) {
      return { success: false, message: 'id and brokerCode are required' };
    }
    const result: any = await this.proxyService.forwardToProperty('GetProperties', {
      id,
      brokerCode,
      page: 1,
      limit: 1,
    });
    const properties = result?.properties ?? [];
    if (!properties.length) {
      return { success: false, message: 'Property not found or does not belong to this broker' };
    }
    return { success: true, property: properties[0] };
  }

  @Get('get_properties')
  @ApiOperation({ summary: 'Get all properties belonging to a broker (homescreen)' })
  async getProperties(@Query() query: any) {
    const { user_id, page, limit } = query;
    this.logger.log(`Get properties for broker=${user_id}`);
    if (!user_id) {
      return { success: false, message: 'user_id (broker code) is required' };
    }
    return this.proxyService.forwardToProperty('GetProperties', {
      brokerCode: user_id,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
    });
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
    const mapped = this.mapNearbyQuery(query);
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
