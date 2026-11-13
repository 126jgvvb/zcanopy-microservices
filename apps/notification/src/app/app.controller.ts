import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { NotificationService } from './otp/notification.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService, private readonly notificationService: NotificationService) {}

  @Get()
  getData() {
    return this.appService.getData();
  }

  @Get('support-messages')
  async getSupportMessages(@Query() query: { page?: number; limit?: number; status?: string; customerEmail?: string }) {
    return this.notificationService.getSupportMessages(query);
  }

  /**
   * Records a support message written by a customer in their dashboard so it
   * shows up in the admin console's client messages queue. Inbound email is
   * normally the source of these, but a message typed into the dashboard has
   * to be queued the same way.
   */
  @Post('support-messages')
  async recordSupportMessage(
    @Body()
    body: {
      customerEmail: string;
      subject?: string;
      textContent?: string;
      htmlContent?: string;
      recipientInbox?: string;
      customerName?: string;
    },
  ) {
    return this.notificationService.recordSupportMessage({
      customerEmail: body.customerEmail,
      subject: body.subject,
      textContent: body.textContent,
      htmlContent: body.htmlContent,
      recipientInbox: body.recipientInbox || 'support@zcanopy.com',
    });
  }
}
