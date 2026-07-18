import { Controller, Logger, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';

/**
 * Notification endpoints exposed to the broker app. The broker app
 * authenticates with its session token (rather than a JWT bearer token), so
 * these routes live outside the JWT-guarded controllers. The notification
 * service derives the owning `brokerCode` from the session server-side and
 * ignores any client-supplied owner identifiers, preventing cross-account
 * reads or mutations.
 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(private readonly proxyService: ProxyService) {}

  private extractSession(source: any): { sessionToken?: string; sessionId?: string } {
    return {
      sessionToken: source?.sessionToken ?? source?.sessionID,
      sessionId: source?.sessionId,
    };
  }

  @Get('get_notifications')
  @ApiOperation({ summary: 'Get notifications for the authenticated broker session' })
  async getNotificationsGet(@Query() query: any) {
    return this.proxyService.forwardToNotification('get_notifications', {
      ...this.extractSession(query),
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      status: query.status,
      type: query.type,
      channel: query.channel,
      read: typeof query.read === 'string' ? query.read === 'true' : undefined,
    });
  }

  @Post('get_notifications')
  @ApiOperation({ summary: 'Get notifications for the authenticated broker session (POST body)' })
  async getNotifications(@Body() body: any) {
    return this.proxyService.forwardToNotification('get_notifications', {
      ...this.extractSession(body),
      page: body.page,
      limit: body.limit,
      status: body.status,
      type: body.type,
      channel: body.channel,
      read: body.read,
    });
  }

  @Post('mark_as_read')
  @ApiOperation({ summary: 'Mark one, many, or all of the broker session\'s notifications as read' })
  async markAsRead(@Body() body: any) {
    return this.proxyService.forwardToNotification('mark_as_read', {
      ...this.extractSession(body),
      id: body.id,
      ids: body.ids,
      all: body.all,
    });
  }
}
