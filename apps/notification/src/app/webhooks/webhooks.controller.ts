import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Resend } from 'resend';
import { NotificationService } from '../otp/notification.service';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly resend: Resend;
  private readonly webhookSecret: string;
  private readonly ugatextWebhookSecret: string;

  constructor(
    private readonly notificationService: NotificationService,
    configService: ConfigService,
  ) {
    this.resend = new Resend(configService.get<string>('RESEND_API_KEY') || '');
    this.webhookSecret = configService.get<string>('SIGN_SECRET') || '';
    this.ugatextWebhookSecret = configService.get<string>('UGATEXT_WEBHOOK_SECRET') || '';
  }

  @Post('inbound')
  @HttpCode(HttpStatus.OK)
  async handleInboundEmail(@Req() req: any) {
    try {
      const rawBody = this.getRawRequestBody(req);
      const body = this.verifyAndParseWebhook(rawBody, req);

      if (body.type === 'email.received') {
        const emailData = body.data;

        const customerEmail = emailData.from;
        const subject = emailData.subject;
        const recipientInbox = Array.isArray(emailData.to) ? emailData.to[0] : emailData.to;

        this.logger.log(
          `Received support email to ${recipientInbox} from ${customerEmail} (email_id=${emailData.email_id})`,
        );

        // NOTE: Resend's email.received payload carries metadata only - it has no
        // `text`/`html`. The body is fetched separately from the received-emails
        // API using `email_id`.
        const { textContent, htmlContent } = await this.notificationService.fetchEmailBody(emailData.email_id || '');


        this.logger.log(`textContent=${textContent}`);
        this.logger.log(`htmlContent=${htmlContent}`);

        await this.notificationService.recordSupportMessage({
          customerEmail,
          subject,
          recipientInbox,
          textContent,
          htmlContent,
          resendEmailId: emailData.email_id,
        });
      }

      return { received: true };
    } catch (error) {
      this.logger.error('Failed to process inbound webhook:', (error as Error).stack);
      return { received: false, error: (error as Error).message };
    }
  }

  @Post('ugatext')
  @HttpCode(HttpStatus.OK)
  async handleUgaTextWebhook(@Req() req: any) {
    const rawBody = this.getRawRequestBody(req);
    this.verifyUgaTextSignature(rawBody, req);

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    const event = String(payload?.event || req.headers['x-ugatext-event'] || '');
    const data = payload?.data || {};
    const status = this.resolveUgaTextStatus(event, data.status);

    if (!status) {
      this.logger.log(`Ignoring UgaText event=${event} status=${data.status}`);
      return { received: true, ignored: true };
    }

    const messageId = data.message_id;
    if (!messageId) {
      throw new BadRequestException('Missing message_id');
    }

    const error = status === 'failed' ? this.extractUgaTextError(data) : undefined;
    await this.notificationService.updateSmsStatusByProviderMessageId(
      String(messageId),
      status,
      error,
    );

    return { received: true };
  }

  private verifyUgaTextSignature(rawBody: string, req: any): void {
    const signatureHeader = req.headers['x-ugatext-signature'];

    if (!this.ugatextWebhookSecret) {
      throw new UnauthorizedException('UGATEXT_WEBHOOK_SECRET is not configured');
    }

    if (!signatureHeader) {
      throw new UnauthorizedException('Missing UgaText signature');
    }

    const parts: Record<string, string> = {};
    for (const part of String(signatureHeader).split(',')) {
      const [key, ...rest] = part.split('=');
      if (key && rest.length) {
        parts[key.trim()] = rest.join('=').trim();
      }
    }

    const timestamp = parts.t;
    const receivedSignature = parts.v1;
    if (!timestamp || !receivedSignature) {
      throw new UnauthorizedException('Malformed UgaText signature');
    }

    const timestampSeconds = Number(timestamp);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) {
      throw new UnauthorizedException('UgaText signature timestamp expired');
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.ugatextWebhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const receivedBuffer = Buffer.from(receivedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid UgaText signature');
    }
  }

  private resolveUgaTextStatus(
    event: string,
    rawStatus?: string,
  ): 'sent' | 'delivered' | 'failed' | null {
    const normalizedStatus = String(rawStatus || '').toLowerCase();
    if (normalizedStatus === 'sent' || normalizedStatus === 'delivered' || normalizedStatus === 'failed') {
      return normalizedStatus;
    }

    const normalizedEvent = event.toLowerCase();
    if (normalizedEvent.endsWith('delivered')) return 'delivered';
    if (normalizedEvent.endsWith('failed')) return 'failed';
    if (normalizedEvent.endsWith('sent')) return 'sent';
    return null;
  }

  private extractUgaTextError(data: any): string | undefined {
    const candidate =
      data?.error?.message ?? data?.error ?? data?.reason ?? data?.failure_reason ?? data?.status;
    if (!candidate) {
      return undefined;
    }
    return typeof candidate === 'string' ? candidate : JSON.stringify(candidate);
  }

  private getRawRequestBody(req: any): string {
    if (Buffer.isBuffer(req.body)) {
      return req.body.toString('utf8');
    }

    if (typeof req.body === 'string') {
      return req.body;
    }

    throw new Error('Raw webhook body is unavailable');
  }

  private verifyAndParseWebhook(rawBody: string, req: any): any {
    const id = req.headers['svix-id'];
    const timestamp = req.headers['svix-timestamp'];
    const signature = req.headers['svix-signature'];

    if (!this.webhookSecret) {
      throw new Error('RESEND_WEBHOOK_SECRET is not configured');
    }

    if (!id || !timestamp || !signature) {
      throw new Error('Missing Resend webhook headers');
    }

    return this.resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: String(id),
        timestamp: String(timestamp),
        signature: String(signature),
      },
      webhookSecret: this.webhookSecret,
    });
  }
}
