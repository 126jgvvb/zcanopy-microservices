import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class SpacesService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly cdnBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('DO_SPACES_ENDPOINT');
    const region = this.configService.get<string>('DO_SPACES_REGION') || 'nyc3';
    const accessKey = this.configService.get<string>('DO_SPACES_ACCESS_KEY');
    const secretKey = this.configService.get<string>('DO_SPACES_SECRET_KEY');
    this.bucket = this.configService.get<string>('DO_SPACES_BUCKET') || 'zcanopy-properties';
    this.cdnBaseUrl = this.configService.get<string>('DO_SPACES_CDN_URL') || `https://${this.bucket}.${region}.digitaloceanspaces.com`;

    if (!endpoint || !accessKey || !secretKey) {
      throw new BadRequestException('DigitalOcean Spaces is not configured');
    }

    this.s3 = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });
  }

  async generateUploadUrl(filename: string, contentType: string, folder = 'properties') {
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${filename.replace(/\s+/g, '-')}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ACL: 'public-read',
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 3600 });

    return {
      uploadUrl,
      key,
      publicUrl: `${this.cdnBaseUrl}/${key}`,
    };
  }
}
