import { Injectable, Logger, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import * as admin from 'firebase-admin';
import Resend from 'resend';
import { OtpChannel, OtpNotificationPayload } from './otp-payload.interface';
import { NotificationEntity } from '../entitty/notification.entity';

export interface PaymentNotificationPayload {
  email?: string;
  phoneNumber?: string;
  username?: string;
  invoice: {
    referenceNumber: string;
    transactionId: string;
    tier: string;
    amount: number;
    brokerName: string;
    brokerCode: string;
    date: string;
    proofCode: string;
  };
  purpose?: string;
}

export interface BrokerApprovalPayload {
  brokerId: string;
  username: string;
  email: string;
  phoneNumber: string;
  brokerCode: string;
}

export interface BrokerCreatedPayload {
  brokerId: string;
  username: string;
  email: string;
  phoneNumber?: string;
  brokerCode: string;
  createdAt?: string | Date;
}

export interface PaymentFailedPayload {
  brokerId: string;
  username: string;
  tier: string;
  message: string;
  timestamp: string;
}

export interface BrokerLoginNewDevicePayload {
  brokerId: string;
  brokerCode: string;
  email: string;
  username: string;
  oldDeviceId?: string;
  newDeviceId: string;
}

interface DispatchResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface PropertyPaymentInvoice {
  customerPhone: string;
  customerEmail: string;
  customerName: string;
  amount: number;
  recipientPhone: string;
  recipientName: string;
  transactionCode: string;
  date: string;
}

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private subscriber!: Redis;
  private redis!: Redis;

  private brevoApiKey: string;
  private brevoSenderName: string;
  private brevoSenderEmail: string;

  private resendApiKey: string;
  private resendFromEmail: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
    @Inject('REDIS_CLIENT') private readonly redisClient: ClientProxy,
  ) {
    this.brevoApiKey = this.configService.get<string>('BREVO_API_KEY') || '';
    this.brevoSenderName = this.configService.get<string>('BREVO_SENDER_NAME') || 'ZCanopy';
    this.brevoSenderEmail = this.configService.get<string>('BREVO_SENDER_EMAIL') || 'noreply@zcanopy.com';

    this.resendApiKey = this.configService.get<string>('RESEND_API_KEY') || '';
    this.resendFromEmail = this.configService.get<string>('RESEND_FROM_EMAIL') || 'ZCanopy <noreply@zcanopy.com>';
  }

  async onModuleInit() {
    const redisHost = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const redisPort = Number(this.configService.get<string>('REDIS_PORT') || '6379');
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD') || undefined;

    this.subscriber = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
    });

    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
    });

    this.subscriber.subscribe('get_notifications', (err) => {
      if (err) {
        console.error('Failed to subscribe to get_notifications', err);
      }
    });

    this.subscriber.subscribe('send_broker_fcm_notification', (err) => {
      if (err) {
        console.error('Failed to subscribe to send_broker_fcm_notification', err);
      }
    });

    this.subscriber.on('message', async (channel, message) => {
      if (channel === 'get_notifications') {
        try {
          const data = JSON.parse(message);
          const result = await this.getNotifications({
            page: data.page,
            limit: data.limit,
            status: data.status,
            type: data.type,
            channel: data.channel,
            recipient: data.recipient,
            brokerCode: data.brokerCode,
            read: data.read,
          });

          this.redisClient.emit(data.responseChannel || 'notifications_report', {
            requestId: data.requestId,
            ...result,
          });

          this.logger.log(`Responded to notifications request ${data.requestId || ''}`);
        } catch (error) {
          this.logger.error(`Failed to handle get_notifications: ${(error as Error).message}`);
        }
      } else if (channel === 'send_broker_fcm_notification') {
        try {
          const data = JSON.parse(message);
          await this.sendFcmNotification(data.brokerCode, data.title, data.body, data.data, data.tokens);
        } catch (error) {
          this.logger.error(`Failed to handle send_broker_fcm_notification: ${(error as Error).message}`);
        }
      }
    });

    this.logger.log('Subscribed to get_notifications Redis channel');
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
    if (this.redis) {
      await this.redis.quit();
    }
  }

  /**
   * Resolves the authenticated broker's `brokerCode` from a broker session
   * token (or raw sessionId). The token encodes `sessionId:brokerCode:ts` in
   * base64 and the session record lives in Redis at `broker:session:{id}`.
   * Returns null when the session is missing/expired/invalid.
   */
  async resolveBrokerCodeFromSession(sessionToken?: string, sessionId?: string): Promise<string | null> {
    let sid = sessionId;
    try {
      if (!sid && sessionToken) {
        const decoded = Buffer.from(sessionToken, 'base64').toString('utf-8');
        const [decodedSessionId] = decoded.split(':');
        sid = decodedSessionId;
      }
    } catch {
      return null;
    }

    if (!sid) {
      return null;
    }

    try {
      const raw = await this.redis.get(`broker:session:${sid}`);
      if (!raw) {
        return null;
      }
      const data = JSON.parse(raw);
      return data.brokerCode || null;
    } catch {
      return null;
    }
  }

  async sendEmailOtp(payload: OtpNotificationPayload) {
    try {
      if (!payload.email) {
        throw new Error('Cannot send email OTP: "email" is missing from payload');
      }
      console.log(`[OTP] Email OTP for ${payload.email}: ${payload.otp}`);
      const body = this.buildMessage(payload, 'email');
      const subject = 'Your verification code';
      const result = await this.dispatchEmail(payload.email, subject, body);
      await this.saveNotification({ type: 'otp', channel: 'email', title: subject, content: body, recipient: payload.email, result });
      return this.result('email', payload.email);
    } catch (err) {
      this.logger.error(`Failed to send email OTP: ${(err as Error).message}`);
      console.log(`[OTP] Email OTP for ${payload.email}: ${payload.otp} (send failed)`);
      throw err;
    }
  }

  async sendSmsOtp(payload: OtpNotificationPayload) {
    try {
      if (!payload.phoneNumber) {
        throw new Error('Cannot send sms OTP: "phoneNumber" is missing from payload');
      }
      console.log(`[OTP] SMS OTP for ${payload.phoneNumber}: ${payload.otp}`);
      const body = this.buildMessage(payload, 'sms');
      const result = await this.dispatchSms(payload.phoneNumber, body);
      await this.saveNotification({ type: 'otp', channel: 'sms', title: 'OTP Code', content: body, recipient: payload.phoneNumber, result });
      return this.result('sms', payload.phoneNumber);
    } catch (err) {
      this.logger.error(`Failed to send SMS OTP: ${(err as Error).message}`);
      console.log(`[OTP] SMS OTP for ${payload.phoneNumber}: ${payload.otp} (send failed)`);
      throw err;
    }
  }

  async sendWhatsappOtp(payload: OtpNotificationPayload) {
    try {
      if (!payload.phoneNumber) {
        throw new Error('Cannot send whatsapp OTP: "phoneNumber" is missing from payload');
      }
      console.log(`[OTP] WhatsApp OTP for ${payload.phoneNumber}: ${payload.otp}`);
      const body = this.buildMessage(payload, 'whatsapp');
      const result = await this.dispatchWhatsapp(payload.phoneNumber, body);
      await this.saveNotification({ type: 'otp', channel: 'whatsapp', title: 'OTP Code', content: body, recipient: payload.phoneNumber, result });
      return this.result('whatsapp', payload.phoneNumber);
    } catch (err) {
      this.logger.error(`Failed to send WhatsApp OTP: ${(err as Error).message}`);
      console.log(`[OTP] WhatsApp OTP for ${payload.phoneNumber}: ${payload.otp} (send failed)`);
      throw err;
    }
  }

  async sendPaymentEmail(payload: PaymentNotificationPayload) {
    try {
      if (!payload.email) {
        throw new Error('Cannot send payment email: "email" is missing from payload');
      }
      const subject = `Payment Confirmation - ${payload.invoice.tier} Subscription`;
      const body = this.buildPaymentMessage(payload);
      const result = await this.dispatchEmail(payload.email, subject, body);
      await this.saveNotification({ type: 'payment', channel: 'email', title: subject, content: body, recipient: payload.email, result });
      return this.result('email', payload.email);
    } catch (err) {
      this.logger.error(`Failed to send payment email: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendPaymentSms(payload: PaymentNotificationPayload) {
    try {
      if (!payload.phoneNumber) {
        throw new Error('Cannot send payment SMS: "phoneNumber" is missing from payload');
      }
      const body = this.buildPaymentMessage(payload);
      const result = await this.dispatchSms(payload.phoneNumber, body);
      await this.saveNotification({ type: 'payment', channel: 'sms', title: 'Payment Confirmation', content: body, recipient: payload.phoneNumber, result });
      return this.result('sms', payload.phoneNumber);
    } catch (err) {
      this.logger.error(`Failed to send payment SMS: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendPropertyPaymentEmail(payload: {
    email: string;
    username?: string;
    invoice: PropertyPaymentInvoice;
    purpose?: string;
  }) {
    try {
      if (!payload.email) {
        throw new Error('Cannot send property payment email: "email" is missing from payload');
      }
      const subject = `Property Payment Confirmation`;
      const body = this.buildPropertyPaymentMessage(payload);
      const result = await this.dispatchEmail(payload.email, subject, body);
      await this.saveNotification({ type: 'payment', channel: 'email', title: subject, content: body, recipient: payload.email, result });
      return this.result('email', payload.email);
    } catch (err) {
      this.logger.error(`Failed to send property payment email: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendPropertyPaymentSms(payload: {
    phoneNumber: string;
    username?: string;
    invoice: PropertyPaymentInvoice;
    purpose?: string;
  }) {
    try {
      if (!payload.phoneNumber) {
        throw new Error('Cannot send property payment SMS: "phoneNumber" is missing from payload');
      }
      const body = this.buildPropertyPaymentMessage(payload);
      const result = await this.dispatchSms(payload.phoneNumber, body);
      await this.saveNotification({ type: 'payment', channel: 'sms', title: 'Property Payment Confirmation', content: body, recipient: payload.phoneNumber, result });
      return this.result('sms', payload.phoneNumber);
    } catch (err) {
      this.logger.error(`Failed to send property payment SMS: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendAdminMessage(payload: {
    channel: string;
    recipientPhone?: string;
    recipientEmail?: string;
    subject?: string;
    body: string;
    recipientName?: string;
  }) {
    try {
      if (payload.channel === 'email' && payload.recipientEmail) {
        const result = await this.dispatchEmail(payload.recipientEmail, payload.subject || 'Message from Admin', payload.body);
        await this.saveNotification({
          type: 'admin_message',
          channel: 'email',
          title: payload.subject || 'Message from Admin',
          content: payload.body,
          recipient: payload.recipientEmail,
          result,
        });
        return this.result('email', payload.recipientEmail);
      }

      if (payload.channel === 'sms' && payload.recipientPhone) {
        const result = await this.dispatchSms(payload.recipientPhone, payload.body);
        await this.saveNotification({
          type: 'admin_message',
          channel: 'sms',
          title: 'Admin Message',
          content: payload.body,
          recipient: payload.recipientPhone,
          result,
        });
        return this.result('sms', payload.recipientPhone);
      }

      throw new Error(`Invalid channel or missing recipient for ${payload.channel}`);
    } catch (err) {
      this.logger.error(`Failed to send admin message: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendBrokerApprovalEmail(payload: BrokerApprovalPayload) {
    try {
      const subject = 'Broker Account Approved';
      const body = `Hi ${payload.username}, your broker account has been approved. Your broker code is ${payload.brokerCode}.`;
      const result = await this.dispatchEmail(payload.email, subject, body);
      await this.saveNotification({ type: 'broker_approval', channel: 'email', title: subject, content: body, recipient: payload.email, result });
      return this.result('email', payload.email);
    } catch (err) {
      this.logger.error(`Failed to send broker approval email: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendBrokerApprovalSms(payload: BrokerApprovalPayload) {
    try {
      const body = `Hi ${payload.username}, your broker account has been approved. Your broker code is ${payload.brokerCode}.`;
      const result = await this.dispatchSms(payload.phoneNumber, body);
      await this.saveNotification({ type: 'broker_approval', channel: 'sms', title: 'Broker Account Approved', content: body, recipient: payload.phoneNumber, result });
      return this.result('sms', payload.phoneNumber);
    } catch (err) {
      this.logger.error(`Failed to send broker approval SMS: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendBrokerCreated(payload: BrokerCreatedPayload) {
    try {
      const subject = 'New Broker Signup';
      const body = `New broker ${payload.username} (${payload.email}) signed up and is awaiting approval.`;
      const result = await this.dispatchEmail('admin@zcanopy.com', subject, body);
      await this.saveNotification({ type: 'broker_created', channel: 'email', title: subject, content: body, recipient: 'admin@zcanopy.com', result });
      return { success: true };
    } catch (err) {
      this.logger.error(`Failed to send broker created notification: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendBrokerCodeCreated(payload: { email: string; username: string; brokerCode: string }) {
    try {
      const subject = 'Your Broker Account Code';
      const body = `Hi ${payload.username}, your broker account has been created. Your broker code is ${payload.brokerCode}.`;
      const result = await this.dispatchEmail(payload.email, subject, body);
      await this.saveNotification({ type: 'broker_code_created', channel: 'email', title: subject, content: body, recipient: payload.email, result });
      return { success: true };
    } catch (err) {
      this.logger.error(`Failed to send broker code created notification: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendPaymentFailed(payload: PaymentFailedPayload) {
    try {
      const subject = `Payment Failed - ${payload.tier}`;
      const body = `Payment for ${payload.tier} tier failed for broker ${payload.username}: ${payload.message}`;
      const result = await this.dispatchEmail('admin@zcanopy.com', subject, body);
      await this.saveNotification({ type: 'payment_failed', channel: 'email', title: subject, content: body, recipient: 'admin@zcanopy.com', result });
      return { success: true };
    } catch (err) {
      this.logger.error(`Failed to send payment failed notification: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendBrokerLoginNewDevice(payload: BrokerLoginNewDevicePayload) {
    try {
      const subject = 'New Device Login Detected';
      const body = `Hi ${payload.username}, a new device login was detected for your broker account (${payload.brokerCode}). If this was not you, please secure your account immediately.`;
      const result = await this.dispatchEmail(payload.email, subject, body);
      await this.saveNotification({ type: 'broker_new_device', channel: 'email', title: subject, content: body, recipient: payload.email, result });
      return { success: true };
    } catch (err) {
      this.logger.error(`Failed to send broker login new device notification: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendFcmNotification(brokerCode: string, title: string, body: string, data?: Record<string, string>, tokens?: string[]) {
    if (!brokerCode || !title || !body) {
      this.logger.warn('Missing required fields for FCM notification');
      return { success: false, message: 'Missing required fields' };
    }

    try {
      if (admin.apps.length === 0) {
        const credential = admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        });
        admin.initializeApp({ credential });
      }

      const validTokens = (tokens || []).filter(t => t && t.trim().length > 0);

      if (validTokens.length === 0) {
        this.logger.warn(`No active FCM tokens found for broker ${brokerCode}`);
        await this.saveNotification({ type: 'fcm', channel: 'fcm', title, content: body, recipient: brokerCode, result: { success: false, error: 'No active FCM tokens' }, brokerCode });
        return { success: false, message: 'No active FCM tokens' };
      }

      const messagePromises = validTokens.map(async (fcmToken) => {
        try {
          const message: admin.messaging.Message = {
            token: fcmToken,
            notification: { title, body },
            data: data || {},
            android: {
              priority: 'high',
              notification: { channelId: 'zcanopy_channel', priority: 'high' },
            },
            apns: {
              payload: { aps: { sound: 'default', badge: 1 } },
            },
          };

          const response = await admin.messaging().send(message);
          return { success: true, messageId: response };
        } catch (error) {
          this.logger.error(`Failed to send FCM to token ${fcmToken.substring(0, 10)}...: ${(error as Error).message}`);
          return { success: false, error: (error as Error).message };
        }
      });

      const results = await Promise.all(messagePromises);
      const successCount = results.filter(r => r.success).length;

      await this.saveNotification({
        type: 'fcm',
        channel: 'fcm',
        title,
        content: body,
        recipient: brokerCode,
        result: { success: successCount > 0, messageId: String(successCount) },
        brokerCode,
      });

      return { success: successCount > 0, message: `Sent to ${successCount}/${validTokens.length} devices` };
    } catch (error) {
      this.logger.error(`sendFcmNotification failed for broker ${brokerCode}: ${(error as Error).message}`);
      await this.saveNotification({ type: 'fcm', channel: 'fcm', title, content: body, recipient: brokerCode, result: { success: false, error: (error as Error).message }, brokerCode });
      return { success: false, message: (error as Error).message };
    }
  }

  async getNotifications(query: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
    channel?: string;
    recipient?: string;
    brokerCode?: string;
    read?: boolean;
  }) {
    try {
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 20;

      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      if (query.type) where.type = query.type;
      if (query.channel) where.channel = query.channel;
      if (query.recipient) where.recipient = query.recipient;
      if (query.brokerCode) where.brokerCode = query.brokerCode;
      if (typeof query.read === 'boolean') where.read = query.read;

      const [notifications, total] = await this.notificationRepo.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      const unreadCount = await this.notificationRepo.count({
        where: { ...where, read: false },
      });

      return { notifications, total, page, limit, unreadCount };
    } catch (err) {
      this.logger.error(`Failed to get notifications: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Mark one or more notifications as read, always scoped to a single owner
   * (`recipient` or `brokerCode`). A single `id`, a list of `ids`, or `all` of
   * the owner's notifications can be targeted. An owner is required so callers
   * can never mutate notifications they do not own.
   */
  async markAsRead(query: {
    id?: number;
    ids?: number[];
    recipient?: string;
    brokerCode?: string;
    all?: boolean;
  }) {
    try {
      // Ownership is mandatory: without a recipient/brokerCode we refuse to
      // mutate anything (prevents cross-account and system-wide updates).
      if (!query.recipient && !query.brokerCode) {
        return { success: false, updated: 0, message: 'An owner (recipient or brokerCode) is required' };
      }

      const ownerWhere: Record<string, unknown> = {};
      if (query.recipient) ownerWhere.recipient = query.recipient;
      if (query.brokerCode) ownerWhere.brokerCode = query.brokerCode;

      const rawIds: Array<number | undefined> = [];
      if (query.id !== undefined && query.id !== null) rawIds.push(Number(query.id));
      if (Array.isArray(query.ids)) rawIds.push(...query.ids.map((i) => Number(i)));
      const ids = rawIds.filter((i): i is number => typeof i === 'number' && Number.isInteger(i));

      if (ids.length > 0) {
        // Scope the id-based update to the owner so a caller can only mark their
        // own notifications, even if they guess another owner's ids.
        const result = await this.notificationRepo
          .createQueryBuilder()
          .update(NotificationEntity)
          .set({ read: true })
          .whereInIds(ids)
          .andWhere(
            query.brokerCode ? 'brokerCode = :brokerCode' : 'recipient = :recipient',
            query.brokerCode ? { brokerCode: query.brokerCode } : { recipient: query.recipient },
          )
          .execute();
        const updated = result.affected || 0;
        this.logger.log(`Marked ${updated} notification(s) as read by id (scoped to owner)`);
        return { success: true, updated };
      }

      if (!query.all) {
        return { success: false, updated: 0, message: 'Provide an id/ids to mark, or set all=true' };
      }

      // Bulk mark all of this owner's unread notifications.
      const result = await this.notificationRepo.update({ ...ownerWhere, read: false }, { read: true });
      const updated = result.affected || 0;
      this.logger.log(`Marked ${updated} notification(s) as read (bulk, scoped to owner)`);
      return { success: true, updated };
    } catch (err) {
      this.logger.error(`Failed to mark notifications as read: ${(err as Error).message}`);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Transport implementations (Brevo SMS + Resend Email)
  // ---------------------------------------------------------------------------

  private async dispatchEmail(to: string, subject: string, body: string): Promise<DispatchResult> {
    if (!this.resendApiKey) {
      this.logger.warn('Resend API key not configured, skipping email dispatch');
      return { success: false, error: 'Resend API key not configured' };
    }

    try {
      const resend = new Resend(this.resendApiKey);
      const { data, error } = await resend.emails.send({
        from: this.resendFromEmail,
        to,
        subject,
        html: body,
        text: this.stripHtml(body),
      });

      if (error) {
        this.logger.error(`Failed to send email to ${to}: ${error.message}`);
        return { success: false, error: error.message };
      }

      const messageId = data?.id;
      if (messageId) {
        this.logger.log(`Email sent successfully to ${to}`);
        return { success: true, messageId };
      }

      const errorMessage = `Email dispatch unexpected response for ${to}: ${JSON.stringify(data)}`;
      this.logger.warn(errorMessage);
      return { success: false, error: errorMessage };
    } catch (error) {
      const errorMessage = (error as Error).message;
      this.logger.error(`Failed to send email to ${to}: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  private async dispatchSms(to: string, body: string): Promise<DispatchResult> {
    if (!this.brevoApiKey) {
      this.logger.warn('Brevo API key not configured, skipping SMS dispatch');
      return { success: false, error: 'Brevo API key not configured' };
    }

    try {
      const response = await axios.post(
        'https://api.brevo.com/v3/sms/send',
        {
          sender: {
            name: this.brevoSenderName,
            email: this.brevoSenderEmail,
          },
          recipient: to.replace(/^\+/, ''),
          content: body,
        },
        {
          headers: {
            'api-key': this.brevoApiKey,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      const messageId = response.data?.messageId;
      if (messageId) {
        this.logger.log(`SMS sent successfully to ${to}`);
        return { success: true, messageId: String(messageId) };
      }

      const error = `SMS dispatch unexpected response for ${to}: ${JSON.stringify(response.data)}`;
      this.logger.warn(error);
      return { success: false, error };
    } catch (error) {
      const errorMessage = (error as any).response?.data?.message || (error as Error).message;
      this.logger.error(`Failed to send SMS to ${to}: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  private async dispatchWhatsapp(to: string, body: string): Promise<DispatchResult> {
    this.logger.log(`[WHATSAPP] to=${to} body="${body}"`);
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private async saveNotification(opts: {
    type: string;
    channel: string;
    title: string;
    content: string;
    recipient: string;
    result: DispatchResult;
    brokerCode?: string;
  }) {
    try {
      const notification = this.notificationRepo.create({
        type: opts.type,
        channel: opts.channel,
        title: opts.title,
        content: opts.content,
        recipient: opts.recipient,
        status: opts.result.success ? 'sent' : 'failed',
        providerMessageId: opts.result.messageId,
        error: opts.result.error,
        brokerCode: opts.brokerCode,
        read: false,
      });
      const saved = await this.notificationRepo.save(notification);
      this.logger.log(`Saved notification id=${saved.id} type=${opts.type} channel=${opts.channel} status=${saved.status} recipient=${opts.recipient}`);
    } catch (err) {
      this.logger.error(`Failed to save notification: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildMessage(payload: OtpNotificationPayload, _channel: OtpChannel): string {
    const greeting = payload.username ? `Hi ${payload.username}, ` : '';
    const expiry = payload.ttlSeconds
      ? ` It expires in ${Math.round(payload.ttlSeconds / 60)} minute(s).`
      : '';
    const purpose = payload.purpose ? ` for ${payload.purpose}` : '';
    return `${greeting}your verification code${purpose} is ${payload.otp}.${expiry}`;
  }

  private buildPaymentMessage(payload: PaymentNotificationPayload): string {
    const greeting = payload.username ? `Hi ${payload.username}, ` : '';
    const { referenceNumber, transactionId, tier, amount, brokerCode, date, proofCode } = payload.invoice;
    return `${greeting}Your payment for ${tier} subscription (UGX ${amount}) was successful. Ref: ${referenceNumber}, Txn: ${transactionId}, Broker Code: ${brokerCode}, Date: ${date}. Your proof code: ${proofCode}`;
  }

  private buildPropertyPaymentMessage(payload: {
    username?: string;
    invoice: PropertyPaymentInvoice;
  }): string {
    const greeting = payload.username ? `Hi ${payload.username}, ` : '';
    const { customerPhone, customerName, amount, recipientPhone, recipientName, transactionCode, date } = payload.invoice;
    return `${greeting}Your property payment of UGX ${amount} was successful. Customer: ${customerName} (${customerPhone}), Recipient: ${recipientName} (${recipientPhone}), Code: ${transactionCode}, Date: ${date}`;
  }

  private result(channel: OtpChannel, destination: string) {
    return { success: true, channel, destination };
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}
