import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

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
    this.bucket =
      this.configService.get<string>('DO_SPACES_BUCKET') ||
      'zcanopy-properties';
    this.cdnBaseUrl =
      this.configService.get<string>('DO_SPACES_CDN_URL') ||
      `https://${this.bucket}.${region}.cdn.digitaloceanspaces.com`;

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

  async generateUploadUrl(
    filename: string,
    contentType: string,
    folder = 'properties',
  ) {
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

  async uploadBuffer(
    filename: string,
    contentType: string,
    buffer: Buffer,
    folder = 'properties',
  ) {
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${filename.replace(/\s+/g, '-')}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
    });

    await this.s3.send(command);

    return {
      key,
      publicUrl: `${this.cdnBaseUrl}/${key}`,
    };
  }

  publicUrlFor(key: string): string {
    return `${this.cdnBaseUrl}/${key}`;
  }

  /**
   * Stream an object from Spaces to a local file. Returns the object size so
   * callers can enforce limits before doing expensive work.
   */
  async downloadToFile(
    key: string,
    destination: string,
    maxBytes = Number.POSITIVE_INFINITY,
  ): Promise<number> {
    const response = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    const body = response.Body as Readable | undefined;
    if (!body) {
      throw new Error(`Object ${key} has no body`);
    }

    const size = Number(response.ContentLength ?? 0);
    if (size > maxBytes) {
      body.destroy();
      throw new Error(
        `Source video is too large to transcode (${(size / (1024 * 1024)).toFixed(1)} MB)`,
      );
    }

    await pipeline(body, createWriteStream(destination));
    return size;
  }

  /**
   * Upload a local file, replacing the object stored at `key`.
   *
   * Transcoding keeps the original object key so the URL handed to the client
   * after upload stays valid. The original bytes are overwritten in place and
   * every subsequent request is served the optimised MP4.
   */
  async replaceObjectFromFile(
    key: string,
    filePath: string,
    contentType: string,
    cacheControl = 'public, max-age=31536000, immutable',
  ): Promise<string> {
    const { size } = await stat(filePath);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: size,
        ContentType: contentType,
        CacheControl: cacheControl,
        ACL: 'public-read',
      }),
    );

    return this.publicUrlFor(key);
  }
}
