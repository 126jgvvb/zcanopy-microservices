import { Controller,Param, Logger, Get, Query, UseGuards, Put, Body, Delete, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('properties')
@Controller('properties')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PropertyController {
  private readonly logger = new Logger(PropertyController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Get()
  @ApiOperation({ summary: 'Get all properties' })
  async getProperties(@Query() query: any) {
    return this.proxyService.forwardToProperty('GetProperties', query);
  }

  @Get('locations')
  @ApiOperation({ summary: 'Get property locations for map' })
  async getPropertyLocations() {
    return this.proxyService.forwardToProperty('GetPropertyLocations', {});
  }

  @Get('resolve-location-name')
  @ApiOperation({ summary: 'Resolve sub-county/district from coordinates' })
  async resolveLocationName(@Query('lat') lat: string, @Query('long') long: string) {
    return this.proxyService.forwardToProperty('ResolveLocationName', {
      lat: Number(lat),
      lng: Number(long),
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create property' })
  async createProperty(@Body() body: any) {
    return this.proxyService.forwardToProperty('CreateProperty', body);
  }

  @Get('bookings/:brokerCode')
  @ApiOperation({ summary: 'Get broker bookings' })
  async getBrokerBookings(@Param('brokerCode') brokerCode: string) {
    return this.proxyService.forwardToProperty('GetBrokerBookings', { brokerCode });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update property details' })
  async updateProperty(@Param('id') id: string, @Body() body: any) {
    return this.proxyService.forwardToProperty('UpdateProperty', { id, ...body });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete property' })
  async deleteProperty(@Param('id') id: string) {
    return this.proxyService.forwardToProperty('DeleteProperty', { id });
  }

  @Post(':id/delete')
  @ApiOperation({ summary: 'Delete property (POST alias)' })
  async deletePropertyPost(@Param('id') id: string) {
    return this.proxyService.forwardToProperty('DeleteProperty', { id });
  }
}
