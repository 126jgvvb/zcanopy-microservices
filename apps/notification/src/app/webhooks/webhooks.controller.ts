import { Controller, Post, HttpCode, HttpStatus, Logger, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { NotificationService } from '../otp/notification.service';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly resend: Resend;
  private readonly webhookSecret: string;

  constructor(
    private readonly notificationService: NotificationService,
    configService: ConfigService,
  ) {
    this.resend = new Resend(configService.get<string>('RESEND_API_KEY') || '');
    this.webhookSecret = configService.get<string>('SIGN_SECRET') || '';
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
        const textContent = emailData.text;
        const htmlContent = emailData.html;
        const recipientInbox = Array.isArray(emailData.to) ? emailData.to[0] : emailData.to;

        this.logger.log(`Received support email to ${recipientInbox} from ${customerEmail}`);

        await this.notificationService.recordSupportMessage({
          customerEmail,
          subject,
          textContent,
          htmlContent,
          recipientInbox,
        });
      }

      return { received: true };
    } catch (error) {
      this.logger.error('Failed to process inbound webhook:', (error as Error).stack);
      return { received: false, error: (error as Error).message };
    }
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
