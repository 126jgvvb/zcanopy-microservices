import { Injectable, Logger, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import Redis from 'ioredis';
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

  private brevoApiKey: string;
  private brevoSenderName: string;
  private brevoSenderEmail: string;

  private renderApiKey: string;
  private renderFromEmail: string;
  private renderApiUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
    @Inject('REDIS_CLIENT') private readonly redisClient: ClientProxy,
  ) {
    this.brevoApiKey = this.configService.get<string>('BREVO_API_KEY') || '';
    this.brevoSenderName = this.configService.get<string>('BREVO_SENDER_NAME') || 'ZCanopy';
    this.brevoSenderEmail = this.configService.get<string>('BREVO_SENDER_EMAIL') || 'noreply@zcanopy.com';

    this.renderApiKey = this.configService.get<string>('RENDER_API_KEY') || '';
    this.renderFromEmail = this.configService.get<string>('RENDER_FROM_EMAIL') || 'ZCanopy <noreply@zcanopy.com>';
    this.renderApiUrl = this.configService.get<string>('RENDER_API_URL') || 'https://api.render.com/v1';
  }

  async onModuleInit() {
    this.subscriber = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });

    this.subscriber.subscribe('get_notifications', (err) => {
      if (err) {
        console.error('Failed to subscribe to get_notifications', err);
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
      }
    });

    this.logger.log('Subscribed to get_notifications Redis channel');
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
  }

  async sendEmailOtp(payload: OtpNotificationPayload) {
    if (!payload.email) {
      throw new Error('Cannot send email OTP: "email" is missing from payload');
    }
    const body = this.buildMessage(payload, 'email');
    const subject = 'Your verification code';
    const result = await this.dispatchEmail(payload.email, subject, body);
    await this.saveNotification({ type: 'otp', channel: 'email', title: subject, content: body, recipient: payload.email, result });
    return this.result('email', payload.email);
  }

  async sendSmsOtp(payload: OtpNotificationPayload) {
    if (!payload.phoneNumber) {
      throw new Error('Cannot send sms OTP: "phoneNumber" is missing from payload');
    }
    const body = this.buildMessage(payload, 'sms');
    const result = await this.dispatchSms(payload.phoneNumber, body);
    await this.saveNotification({ type: 'otp', channel: 'sms', title: 'OTP Code', content: body, recipient: payload.phoneNumber, result });
    return this.result('sms', payload.phoneNumber);
  }

  async sendWhatsappOtp(payload: OtpNotificationPayload) {
    if (!payload.phoneNumber) {
      throw new Error('Cannot send whatsapp OTP: "phoneNumber" is missing from payload');
    }
    const body = this.buildMessage(payload, 'whatsapp');
    const result = await this.dispatchWhatsapp(payload.phoneNumber, body);
    await this.saveNotification({ type: 'otp', channel: 'whatsapp', title: 'OTP Code', content: body, recipient: payload.phoneNumber, result });
    return this.result('whatsapp', payload.phoneNumber);
  }

  async sendPaymentEmail(payload: PaymentNotificationPayload) {
    if (!payload.email) {
      throw new Error('Cannot send payment email: "email" is missing from payload');
    }
    const subject = `Payment Confirmation - ${payload.invoice.tier} Subscription`;
    const body = this.buildPaymentMessage(payload);
    const result = await this.dispatchEmail(payload.email, subject, body);
    await this.saveNotification({ type: 'payment', channel: 'email', title: subject, content: body, recipient: payload.email, result });
    return this.result('email', payload.email);
  }

  async sendPaymentSms(payload: PaymentNotificationPayload) {
    if (!payload.phoneNumber) {
      throw new Error('Cannot send payment SMS: "phoneNumber" is missing from payload');
    }
    const body = this.buildPaymentMessage(payload);
    const result = await this.dispatchSms(payload.phoneNumber, body);
    await this.saveNotification({ type: 'payment', channel: 'sms', title: 'Payment Confirmation', content: body, recipient: payload.phoneNumber, result });
    return this.result('sms', payload.phoneNumber);
  }

  async sendPropertyPaymentEmail(payload: {
    email: string;
    username?: string;
    invoice: PropertyPaymentInvoice;
    purpose?: string;
  }) {
    if (!payload.email) {
      throw new Error('Cannot send property payment email: "email" is missing from payload');
    }
    const subject = `Property Payment Confirmation`;
    const body = this.buildPropertyPaymentMessage(payload);
    const result = await this.dispatchEmail(payload.email, subject, body);
    await this.saveNotification({ type: 'payment', channel: 'email', title: subject, content: body, recipient: payload.email, result });
    return this.result('email', payload.email);
  }

  async sendPropertyPaymentSms(payload: {
    phoneNumber: string;
    username?: string;
    invoice: PropertyPaymentInvoice;
    purpose?: string;
  }) {
    if (!payload.phoneNumber) {
      throw new Error('Cannot send property payment SMS: "phoneNumber" is missing from payload');
    }
    const body = this.buildPropertyPaymentMessage(payload);
    const result = await this.dispatchSms(payload.phoneNumber, body);
    await this.saveNotification({ type: 'payment', channel: 'sms', title: 'Property Payment Confirmation', content: body, recipient: payload.phoneNumber, result });
    return this.result('sms', payload.phoneNumber);
  }

  async sendAdminMessage(payload: {
    channel: string;
    recipientPhone?: string;
    recipientEmail?: string;
    subject?: string;
    body: string;
    recipientName?: string;
  }) {
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
  }

  async sendBrokerApprovalEmail(payload: BrokerApprovalPayload) {
    const subject = 'Broker Account Approved';
    const body = `Hi ${payload.username}, your broker account has been approved. Your broker code is ${payload.brokerCode}.`;
    const result = await this.dispatchEmail(payload.email, subject, body);
    await this.saveNotification({ type: 'broker_approval', channel: 'email', title: subject, content: body, recipient: payload.email, result });
    return this.result('email', payload.email);
  }

  async sendBrokerApprovalSms(payload: BrokerApprovalPayload) {
    const body = `Hi ${payload.username}, your broker account has been approved. Your broker code is ${payload.brokerCode}.`;
    const result = await this.dispatchSms(payload.phoneNumber, body);
    await this.saveNotification({ type: 'broker_approval', channel: 'sms', title: 'Broker Account Approved', content: body, recipient: payload.phoneNumber, result });
    return this.result('sms', payload.phoneNumber);
  }

  async sendBrokerCreated(payload: BrokerCreatedPayload) {
    const subject = 'New Broker Signup';
    const body = `New broker ${payload.username} (${payload.email}) signed up and is awaiting approval.`;
    const result = await this.dispatchEmail('admin@zcanopy.com', subject, body);
    await this.saveNotification({ type: 'broker_created', channel: 'email', title: subject, content: body, recipient: 'admin@zcanopy.com', result });
    return { success: true };
  }

  async sendBrokerCodeCreated(payload: { email: string; username: string; brokerCode: string }) {
    const subject = 'Your Broker Account Code';
    const body = `Hi ${payload.username}, your broker account has been created. Your broker code is ${payload.brokerCode}.`;
    const result = await this.dispatchEmail(payload.email, subject, body);
    await this.saveNotification({ type: 'broker_code_created', channel: 'email', title: subject, content: body, recipient: payload.email, result });
    return { success: true };
  }

  async sendPaymentFailed(payload: PaymentFailedPayload) {
    const subject = `Payment Failed - ${payload.tier}`;
    const body = `Payment for ${payload.tier} tier failed for broker ${payload.username}: ${payload.message}`;
    const result = await this.dispatchEmail('admin@zcanopy.com', subject, body);
    await this.saveNotification({ type: 'payment_failed', channel: 'email', title: subject, content: body, recipient: 'admin@zcanopy.com', result });
    return { success: true };
  }

  async sendBrokerLoginNewDevice(payload: BrokerLoginNewDevicePayload) {
    const subject = 'New Device Login Detected';
    const body = `Hi ${payload.username}, a new device login was detected for your broker account (${payload.brokerCode}). If this was not you, please secure your account immediately.`;
    const result = await this.dispatchEmail(payload.email, subject, body);
    await this.saveNotification({ type: 'broker_new_device', channel: 'email', title: subject, content: body, recipient: payload.email, result });
    return { success: true };
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
  }

  /**
   * Mark one or more notifications as read. Either a single `id`, a list of
   * `ids`, or all notifications belonging to a `recipient`/`brokerCode` can be
   * targeted.
   */
  async markAsRead(query: {
    id?: number;
    ids?: number[];
    recipient?: string;
    brokerCode?: string;
    all?: boolean;
  }) {
    const ids: number[] = [];
    if (query.id) ids.push(Number(query.id));
    if (Array.isArray(query.ids)) ids.push(...query.ids.map((i) => Number(i)));

    if (ids.length > 0) {
      await this.notificationRepo
        .createQueryBuilder()
        .update(NotificationEntity)
        .set({ read: true })
        .whereInIds(ids)
        .execute();
      this.logger.log(`Marked ${ids.length} notification(s) as read`);
      return { success: true, updated: ids.length };
    }

    // Bulk mark by owner (recipient or brokerCode).
    const where: Record<string, unknown> = { read: false };
    if (query.recipient) where.recipient = query.recipient;
    if (query.brokerCode) where.brokerCode = query.brokerCode;

    if (!query.recipient && !query.brokerCode && !query.all) {
      return { success: false, updated: 0, message: 'No target specified' };
    }

    const result = await this.notificationRepo.update(where, { read: true });
    const updated = result.affected || 0;
    this.logger.log(`Marked ${updated} notification(s) as read (bulk)`);
    return { success: true, updated };
  }

  // ---------------------------------------------------------------------------
  // Transport implementations (Brevo SMS + Render Email)
  // ---------------------------------------------------------------------------

  private async dispatchEmail(to: string, subject: string, body: string): Promise<DispatchResult> {
    if (!this.renderApiKey) {
      this.logger.warn('Render API key not configured, skipping email dispatch');
      return { success: false, error: 'Render API key not configured' };
    }

    try {
      const response = await axios.post(
        `${this.renderApiUrl}/ostriches`,
        {
          from: this.renderFromEmail,
          to,
          subject,
          html_body: body,
          text_body: this.stripHtml(body),
        },
        {
          headers: {
            'Authorization': `Bearer ${this.renderApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 20000,
        }
      );

      const messageId = response.data?.uuid || response.data?.id;
      if (messageId) {
        this.logger.log(`Email sent successfully to ${to}`);
        return { success: true, messageId: String(messageId) };
      }

      const error = `Email dispatch unexpected response for ${to}: ${JSON.stringify(response.data)}`;
      this.logger.warn(error);
      return { success: false, error };
    } catch (error) {
      const errorMessage = (error as any).response?.data?.message || (error as Error).message;
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
