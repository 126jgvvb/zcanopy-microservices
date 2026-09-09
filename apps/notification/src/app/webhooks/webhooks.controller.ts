import { Controller, Post, Body, HttpCode, HttpStatus, Logger, Req } from '@nestjs/common';
import { NotificationService } from '../otp/notification.service';
import { createHmac } from 'crypto';

@Controller('api/webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly signingSecret: string;

  constructor(private readonly notificationService: NotificationService) {
    this.signingSecret = process.env.SIGN_SECRET || '';
  }

  @Post('inbound')
  @HttpCode(HttpStatus.OK)
  async handleInboundEmail(@Req() req: any, @Body() payload: any) {
    try {
      const body = this.getRequestBody(req, payload);

      if (!this.verifyResendSignature(req, body)) {
        this.logger.warn('Rejected inbound webhook: invalid Resend signature');
        return { received: false, error: 'Invalid signature' };
      }

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
      this.logger.error('Failed to parse inbound webhook:', error.stack);
      return { received: false, error: error.message };
    }
  }

  private getRequestBody(req: any, parsedBody: any): any {
    if (Buffer.isBuffer(parsedBody)) {
      try {
        return JSON.parse(parsedBody.toString('utf8'));
      } catch {
        return parsedBody;
      }
    }
    return parsedBody || {};
  }

  private verifyResendSignature(req: any, body: any): boolean {
    if (!this.signingSecret) {
      this.logger.warn('Skipping Resend signature verification: SIGN_SECRET is not configured');
      return true;
    }

    const signature = req.headers['resend-signature'] || req.headers['Resend-Signature'];
    if (!signature) {
      this.logger.warn('Missing Resend-Signature header');
      return false;
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(body);
    const hmac = createHmac('sha256', this.signingSecret);
    hmac.update(rawBody);
    const expectedSignature = hmac.digest('hex');

    if (signature !== expectedSignature) {
      this.logger.warn('Resend signature mismatch');
      return false;
    }

    return true;
  }
}
