import {
  Controller,
  Logger,
  Post,
  Body,
  Get,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

@ApiTags('gate-way')
@Controller('gate-way')
export class GateWayController {
  private readonly logger = new Logger(GateWayController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Post('check-session-id-validity')
  @ApiOperation({ summary: 'Check whether a broker session id is still valid' })
  async checkSessionValidity(@Body() body: any) {
    this.logger.log('Check session validity request via gateway');
    try {
      return await this.proxyService.forwardToAuth('ValidateBrokerSession', {
        sessionToken: body.sessionID ?? body.sessionToken,
      });
    } catch (error) {
      return { success: false, valid: false, message: 'Session invalid' };
    }
  }

  @Get('get-current-location')
  @ApiOperation({ summary: 'Resolve a human-readable location from coordinates' })
  async getCurrentLocation(
    @Query('lat') lat: string,
    @Query('longitude') lng: string,
  ) {
    this.logger.log(`Get current location for lat=${lat} lng=${lng}`);
    throw new NotFoundException(
      'Reverse-geocoding is not provided by the current backend',
    );
  }
}
