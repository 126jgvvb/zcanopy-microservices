import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SpacesService } from './spaces.service';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly spacesService: SpacesService) {}

  @Post('presign')
  @ApiOperation({ summary: 'Generate a presigned upload URL for DigitalOcean Spaces' })
  async presign(@Body() body: { filename: string; contentType: string; folder?: string }) {
    if (!body.filename || !body.contentType) {
      throw new BadRequestException('filename and contentType are required');
    }

    return this.spacesService.generateUploadUrl(body.filename, body.contentType, body.folder || 'properties');
  }
}
