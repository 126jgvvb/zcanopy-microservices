import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
}
