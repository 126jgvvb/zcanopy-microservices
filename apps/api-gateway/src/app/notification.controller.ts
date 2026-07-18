import { Controller, Logger, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

/**
 * Notification endpoints exposed to the broker/customer apps. Notifications are
 * keyed by `brokerCode` (or a recipient email/phone), so both fetching and
 * marking-as-read are scoped by that identifier.
 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @Get('get_notifications')
  @ApiOperation({ summary: 'Get notifications for a broker/recipient' })
  async getNotificationsGet(@Query() query: any) {
    return this.proxyService.forwardToNotification('get_notifications', {
      brokerCode: query.brokerCode,
      recipient: query.recipient,
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      status: query.status,
      type: query.type,
      channel: query.channel,
      read: typeof query.read === 'string' ? query.read === 'true' : undefined,
    });
  }

  @Post('get_notifications')
  @ApiOperation({ summary: 'Get notifications for a broker/recipient (POST body)' })
  async getNotifications(@Body() body: any) {
    return this.proxyService.forwardToNotification('get_notifications', {
      brokerCode: body.brokerCode,
      recipient: body.recipient,
      page: body.page,
      limit: body.limit,
      status: body.status,
      type: body.type,
      channel: body.channel,
      read: body.read,
    });
  }

  @Post('mark_as_read')
  @ApiOperation({ summary: 'Mark one, many, or all notifications as read' })
  async markAsRead(@Body() body: any) {
    return this.proxyService.forwardToNotification('mark_as_read', {
      id: body.id,
      ids: body.ids,
      recipient: body.recipient,
      brokerCode: body.brokerCode,
      all: body.all,
    });
  }
}
