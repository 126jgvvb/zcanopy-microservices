import { Inject, Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminEntity } from '../entity/admin.entity';
import { DashaordEntity, SystemMessage } from '../entity/dashboard.entity';
import { InvitationCodeEntity } from '../entity/invitation-code.entity';
import { LogEntity } from '../entity/log.entity';
import { AdminMessageEntity } from '../entity/admin-message.entity';
import { lastValueFrom } from 'rxjs';
import Redis from 'ioredis';
import { REDIS_CLIENT_PROVIDER } from './app.module';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timer: NodeJS.Timeout;
}

export interface BrokerCreatedEvent {
  brokerId: string;
  username: string;
  email: string;
  phoneNumber?: string;
  brokerCode?: string;
  createdAt?: string | Date;
}

export interface PaymentFailedEvent {
  brokerId: string;
  username: string;
  tier: string;
  message: string;
  timestamp: string;
}

@Injectable()
export class AdminService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminService.name);
  private subscriber!: Redis;
  private pendingRequests = new Map<string, PendingRequest>();

  constructor(
    @InjectRepository(AdminEntity)
    private readonly adminRepo: Repository<AdminEntity>,
    @InjectRepository(DashaordEntity)
    private readonly dashboardRepo: Repository<DashaordEntity>,
    @InjectRepository(InvitationCodeEntity)
    private readonly invitationRepo: Repository<InvitationCodeEntity>,
    @InjectRepository(LogEntity)
    private readonly logRepo: Repository<LogEntity>,
    @InjectRepository(AdminMessageEntity)
    private readonly adminMessageRepo: Repository<AdminMessageEntity>,
    @Inject('REDIS_CLIENT') private readonly redisClient: ClientProxy,
    @Inject('BROKER_CLIENT') private readonly brokerClient: ClientProxy,
    @Inject('PROPERTY_CLIENT') private readonly propertyClient: ClientProxy,
    @Inject('PAYMENT_CLIENT') private readonly paymentClient: ClientProxy,
    @Inject('AUTH_CLIENT') private readonly authClient: ClientProxy,
    @Inject(REDIS_CLIENT_PROVIDER) private readonly redis: Redis,
  ) {}

  async onModuleInit() {
    this.subscriber = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });

    this.subscriber.subscribe('update_platform_commission', (err) => {
      if (err) {
        console.error('Failed to subscribe to update_platform_commission', err);
      }
    });

    this.subscriber.subscribe('notifications_report', (err) => {
      if (err) {
        console.error('Failed to subscribe to notifications_report', err);
      }
    });

    this.subscriber.subscribe('broker_feedback_received', (err) => {
      if (err) {
        console.error('Failed to subscribe to broker_feedback_received', err);
      }
    });

    this.subscriber.on('message', async (channel, message) => {
      if (channel === 'update_platform_commission') {
        try {
          const data = JSON.parse(message);
          await this.handleUpdatePlatformCommission(data.amount);
        } catch (error) {
          this.logger.error(`Failed to update platform commission: ${(error as Error).message}`);
        }
      } else if (channel === 'notifications_report') {
        try {
          const data = JSON.parse(message);
          const pending = this.pendingRequests.get(data.requestId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(data.requestId);
            pending.resolve(data);
          }
        } catch (error) {
          this.logger.error(`Failed to handle notifications_report: ${(error as Error).message}`);
        }
      } else if (channel === 'broker_feedback_received') {
        try {
          const data = JSON.parse(message);
          await this.handleBrokerFeedback(data);
        } catch (error) {
          this.logger.error(`Failed to handle broker feedback: ${(error as Error).message}`);
        }
      }
    });

    this.logger.log('Subscribed to update_platform_commission, notifications_report, and broker_feedback_received Redis channels');
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
  }

  private async handleUpdatePlatformCommission(amount: number): Promise<void> {
    const dashboard = await this.getOrCreateDashboard();
    const current = dashboard.currentCommission || 0;
    dashboard.currentCommission = current + amount;
    await this.dashboardRepo.save(dashboard);
    this.logger.log(`Updated platform commission: ${current} + ${amount} = ${dashboard.currentCommission}`);
  }

  private async handleBrokerFeedback(data: { feedbackId: string; brokerCode: string; brokerId: string; email: string; phone: string; content: string; timestamp: string }): Promise<void> {
    const dashboard = await this.getOrCreateDashboard();
    const message: SystemMessage = {
      type: 'BROKER_FEEDBACK',
      title: `Broker feedback from ${data.brokerCode}`,
      message: `Email: ${data.email}, Phone: ${data.phone}, Content: ${data.content}`,
      brokerId: data.brokerId,
      read: false,
      createdAt: data.timestamp || new Date().toISOString(),
    };

    dashboard.systemMessages = [...(dashboard.systemMessages ?? []), message];
    await this.dashboardRepo.save(dashboard);
    this.logger.log(`Recorded broker feedback ${data.feedbackId} from broker ${data.brokerCode}`);
  }

  async recordBrokerSignup(event: BrokerCreatedEvent) {
    const dashboard = await this.getOrCreateDashboard();

    const message: SystemMessage = {
      type: 'BROKER_SIGNUP',
      title: 'New broker signup',
      message: `${event.username} (${event.email}) signed up and is awaiting document approval.`,
      brokerId: event.brokerId,
      read: false,
      createdAt: new Date().toISOString(),
    };

    dashboard.systemMessages = [...(dashboard.systemMessages ?? []), message];
    await this.dashboardRepo.save(dashboard);

    this.logger.log(`Recorded broker signup for ${event.brokerId} on dashboard`);
    return dashboard;
  }

  async recordPaymentFailure(event: PaymentFailedEvent) {
    const dashboard = await this.getOrCreateDashboard();

    const message: SystemMessage = {
      type: 'PAYMENT_FAILED',
      title: 'Subscription Payment Failed',
      message: `Payment for ${event.tier} tier failed for broker ${event.username}: ${event.message}`,
      brokerId: event.brokerId,
      read: false,
      createdAt: event.timestamp,
    };

    dashboard.systemMessages = [...(dashboard.systemMessages ?? []), message];
    await this.dashboardRepo.save(dashboard);

    this.logger.log(`Recorded payment failure for broker ${event.brokerId} on dashboard`);
    return dashboard;
  }

  async approveBroker(brokerId: string) {
    this.redisClient.emit('broker_approved', { brokerId });

    const dashboard = await this.getOrCreateDashboard();
    dashboard.systemMessages = (dashboard.systemMessages ?? []).map((m) =>
      m.brokerId === brokerId && m.type === 'BROKER_SIGNUP' ? { ...m, read: true } : m,
    );
    await this.dashboardRepo.save(dashboard);

    this.logger.log(`Approved broker ${brokerId} and emitted broker_approved event`);
    return { success: true, brokerId, message: 'Broker approved and notified' };
  }

  async getCommissions() {
    const dashboard = await this.getOrCreateDashboard();
    return {
      platformCommission: dashboard.platformCommission ?? 0,
      bookingCommission: dashboard.bookingCommission ?? 0,
      minimumWithdrawal: dashboard.minimumWithdrawal ?? 10000,
    };
  }

  async registerAdmin(dto: { username: string; email: string; password: string; invitationCode: string; role: string }) {
    const existingAdmin = await this.adminRepo.findOne({ where: { email: dto.email } });
    if (existingAdmin) {
      throw new BadRequestException('Admin with this email already exists');
    }

    const invitation = await this.invitationRepo.findOne({ where: { code: dto.invitationCode, isUsed: false } });
    if (!invitation) {
      throw new BadRequestException('Invalid or expired invitation code');
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation code has expired');
    }

    const passwordHash = await this.hashPassword(dto.password);
    const admin = this.adminRepo.create({
      username: dto.username,
      email: dto.email,
      passwordHash,
      role: dto.role || 'admin',
      isActive: true,
      isDeleted: false,
      status: 'active',
      createdAt: new Date(),
      lastLoggedIn: new Date(),
      otherAdmins: [],
      phoneNumber: '',
      handledMessages: 0,
      sentEmails: 0,
      sentSms: 0,
    });

    const saved = await this.adminRepo.save(admin);

    invitation.isUsed = true;
    invitation.usedBy = saved.id;
    await this.invitationRepo.save(invitation);

    this.logger.log(`Registered new admin ${saved.email}`);
    return {
      id: saved.id,
      username: saved.username,
      email: saved.email,
      role: saved.role,
      message: 'Admin registered successfully',
    };
  }

  async loginAdmin(dto: { email: string; password: string }) {
    const admin = await this.adminRepo.findOne({ where: { email: dto.email } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    const isValid = await this.comparePassword(dto.password, admin.passwordHash);
    if (!isValid) {
      throw new BadRequestException('Invalid password');
    }

    admin.lastLoggedIn = new Date();
    await this.adminRepo.save(admin);

    const token = Buffer.from(`${admin.id}:${admin.email}:${Date.now()}`).toString('base64');

    return {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      token,
    };
  }

  async validateAdmin(dto: { email: string; password: string }) {
    const admin = await this.adminRepo.findOne({ where: { email: dto.email } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    const isValid = await this.comparePassword(dto.password, admin.passwordHash);
    if (!isValid) {
      throw new BadRequestException('Invalid password');
    }

    const { passwordHash: _, ...result } = admin;
    return result;
  }

  async getAdminById(dto: { id: string }) {
    const admin = await this.adminRepo.findOne({ where: { id: dto.id } });
    if (!admin) {
      throw new NotFoundException(`Admin with id ${dto.id} not found`);
    }

    const { passwordHash: _, ...result } = admin;
    return result;
  }

  async getAllBrokers(query: { page: number; limit: number }) {
    return await lastValueFrom(
      this.brokerClient.send('GetAllBrokers', {
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 10,
      }),
    );
  }

  async getPendingVerifications(query: { page: number; limit: number }) {
    return await lastValueFrom(
      this.brokerClient.send('GetPendingVerifications', {
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 10,
      }),
    );
  }

  async getProperties(query: { page: number; limit: number; brokerCode?: string }) {
    return await lastValueFrom(
      this.propertyClient.send('GetProperties', {
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 10,
        brokerCode: query.brokerCode || '',
      }),
    );
  }

  async getRecentSignups(query: { limit: number }) {
    return await lastValueFrom(
      this.brokerClient.send('GetRecentSignups', {
        limit: Number(query.limit) || 10,
      }),
    );
  }

  async getPropertyLocations() {
    return await lastValueFrom(
      this.propertyClient.send('GetPropertyLocations', {}),
    );
  }

  async getAllAdmins() {
    const admins = await this.adminRepo.find({
      where: { isDeleted: false },
      order: { createdAt: 'DESC' },
    });

    return {
      admins: admins.map(admin => ({
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
        lastLoggedIn: admin.lastLoggedIn,
        createdAt: admin.createdAt,
        handledMessages: admin.handledMessages || 0,
        sentEmails: admin.sentEmails || 0,
        sentSms: admin.sentSms || 0,
      })),
    };
  }

  async addAdmin(dto: { username: string; email: string; password: string; role: string; createdBy: string }) {
    const existingAdmin = await this.adminRepo.findOne({ where: { email: dto.email } });
    if (existingAdmin) {
      throw new BadRequestException('Admin with this email already exists');
    }

    const passwordHash = await this.hashPassword(dto.password);
    const admin = this.adminRepo.create({
      username: dto.username,
      email: dto.email,
      passwordHash,
      role: dto.role || 'admin',
      isActive: true,
      isDeleted: false,
      status: 'active',
      createdAt: new Date(),
      lastLoggedIn: new Date(),
      otherAdmins: [],
      phoneNumber: '',
      handledMessages: 0,
      sentEmails: 0,
      sentSms: 0,
    });

    const saved = await this.adminRepo.save(admin);
    this.logger.log(`Added new admin ${saved.email} by ${dto.createdBy}`);

    return {
      id: saved.id,
      username: saved.username,
      email: saved.email,
      role: saved.role,
      message: 'Admin added successfully',
    };
  }

  async deleteAdmin(dto: { adminId: string; deletedBy: string }) {
    const admin = await this.adminRepo.findOne({ where: { id: dto.adminId } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (admin.role === 'super_admin') {
      throw new BadRequestException('Cannot delete super admin');
    }

    admin.isDeleted = true;
    admin.isActive = false;
    await this.adminRepo.save(admin);

    this.logger.log(`Deleted admin ${admin.email} by ${dto.deletedBy}`);
    return { success: true, message: 'Admin deleted successfully' };
  }

  async freezeAdmin(dto: { adminId: string; freeze: boolean; updatedBy: string }) {
    const admin = await this.adminRepo.findOne({ where: { id: dto.adminId } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (admin.role === 'super_admin') {
      throw new BadRequestException('Cannot freeze super admin');
    }

    admin.isActive = !dto.freeze;
    admin.status = dto.freeze ? 'frozen' : 'active';
    await this.adminRepo.save(admin);

    this.logger.log(`Admin ${admin.email} ${dto.freeze ? 'frozen' : 'unfrozen'} by ${dto.updatedBy}`);
    return { success: true, message: `Admin ${dto.freeze ? 'frozen' : 'unfrozen'} successfully` };
  }

  async generateInvitationCode(dto: { superAdminId: string; role: string; expiryHours: number }) {
    const superAdmin = await this.adminRepo.findOne({ where: { id: dto.superAdminId } });
    if (!superAdmin || superAdmin.role !== 'super_admin') {
      throw new BadRequestException('Only super admin can generate invitation codes');
    }

    const code = this.generateRandomCode(8);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (dto.expiryHours || 24));

    const invitation = this.invitationRepo.create({
      code,
      role: dto.role || 'admin',
      createdBy: dto.superAdminId,
      isUsed: false,
      expiresAt,
    });

    const saved = await this.invitationRepo.save(invitation);
    this.logger.log(`Generated invitation code ${code} for role ${dto.role}`);

    return {
      invitationCode: saved.code,
      role: saved.role,
      expiresAt: saved.expiresAt,
    };
  }

  async getPendingDocuments() {
    const pendingVerifications = await lastValueFrom(
      this.brokerClient.send('GetPendingVerifications', { page: 1, limit: 100 }),
    );

    const documents = (pendingVerifications.brokers || []).map((broker: any) => ({
      brokerId: broker.id,
      username: broker.username,
      email: broker.email,
      documentType: 'ID Verification',
      documentUrl: broker.brokerImage || '',
      idFrontUrl: broker.ninImages?.[0] || '',
      idBackUrl: broker.ninImages?.[1] || '',
      submittedAt: broker.createdAt,
    }));

    return { documents };
  }

  async getSystemMessages(query: { page: number; limit: number }) {
    const dashboard = await this.getOrCreateDashboard();
    const messages = dashboard.systemMessages || [];
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const start = (page - 1) * limit;
    const paginatedMessages = messages.slice(start, start + limit);

    return {
      messages: paginatedMessages,
      total: messages.length,
      page,
      limit,
    };
  }

  async getClientMessages(query: { page: number; limit: number }) {
    const dashboard = await this.getOrCreateDashboard();
    const messages = dashboard.clientMessages || [];
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const start = (page - 1) * limit;
    const paginatedMessages = messages.slice(start, start + limit);

    return {
      messages: paginatedMessages,
      total: messages.length,
      page,
      limit,
    };
  }

  async getBrokerDetails(dto: { brokerId: string }) {
    const cached = await this.getCachedBroker(dto.brokerId);
    if (cached) {
      const transactions = await lastValueFrom(
        this.paymentClient.send('GetTransactions', { page: 1, limit: 100, brokerId: dto.brokerId }),
      );

      const walletBalance = cached.walletBalance || 0;

      return {
        broker: cached,
        walletBalance,
        transactions: transactions.transactions || [],
      };
    }

    const broker = await lastValueFrom(
      this.brokerClient.send('GetBrokerById', { id: dto.brokerId }),
    );

    const transactions = await lastValueFrom(
      this.paymentClient.send('GetTransactions', { page: 1, limit: 100, brokerId: dto.brokerId }),
    );

    const walletBalance = broker.walletBalance || 0;

    await this.setCachedBroker(dto.brokerId, broker);

    return {
      broker,
      walletBalance,
      transactions: transactions.transactions || [],
    };
  }

  async getBrokerDetailsFromCache(dto: { brokerId: string }) {
    const cached = await this.getCachedBroker(dto.brokerId);
    if (!cached) {
      throw new NotFoundException('Broker details not found in cache');
    }

    return {
      broker: cached,
      walletBalance: cached.walletBalance || 0,
      transactions: [],
    };
  }

  async approveBrokerDocument(dto: { brokerId: string; adminId: string; namesMatched: boolean; adminNotes?: string }) {
    const admin = await this.adminRepo.findOne({ where: { id: dto.adminId } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    const broker = await lastValueFrom(
      this.brokerClient.send('GetBrokerById', { id: dto.brokerId }),
    );

    if (!dto.namesMatched) {
      this.redisClient.emit('send_admin_message_email', {
        recipientEmail: broker.email,
        recipientName: broker.username,
        subject: 'Document Verification Failed',
        body: `Dear ${broker.username}, your ID documents could not be verified because the names did not match. Please resubmit your documents.`,
      });

      return {
        success: false,
        message: 'Names do not match. Broker notified to resubmit documents.',
      };
    }

    this.redisClient.emit('broker_approved', { brokerId: dto.brokerId });

    const dashboard = await this.getOrCreateDashboard();
    dashboard.systemMessages = (dashboard.systemMessages ?? []).map((m) =>
      m.brokerId === dto.brokerId && m.type === 'BROKER_SIGNUP' ? { ...m, read: true } : m,
    );
    await this.dashboardRepo.save(dashboard);

    if (dto.adminNotes) {
      const adminMessage = this.adminMessageRepo.create({
        adminId: dto.adminId,
        adminUsername: admin.username,
        recipientType: 'broker',
        recipientPhone: broker.phoneNumber,
        recipientEmail: broker.email,
        recipientName: broker.username,
        messageType: 'document_approval',
        subject: 'Document Approval Notes',
        body: dto.adminNotes,
        channel: 'email',
        status: 'pending',
      });
      await this.adminMessageRepo.save(adminMessage);

      this.redisClient.emit('send_admin_message_email', {
        recipientEmail: broker.email,
        recipientName: broker.username,
        subject: 'Document Approval Notes',
        body: dto.adminNotes,
      });
    }

    this.logger.log(`Approved broker ${dto.brokerId} with name match verification`);
    return { success: true, brokerId: dto.brokerId, message: 'Broker approved and notified' };
  }

  async deleteBroker(dto: { brokerId: string; adminId: string }) {
    const admin = await this.adminRepo.findOne({ where: { id: dto.adminId } });
    if (!admin || admin.role !== 'super_admin') {
      throw new BadRequestException('Only super admin can delete brokers');
    }

    return await lastValueFrom(
      this.brokerClient.send('DeleteBroker', { id: dto.brokerId }),
    );
  }

  async editBrokerTier(dto: { brokerId: string; tier: string; adminId: string }) {
    const admin = await this.adminRepo.findOne({ where: { id: dto.adminId } });
    if (!admin || admin.role !== 'super_admin') {
      throw new BadRequestException('Only super admin can edit broker tiers');
    }

    return await lastValueFrom(
      this.brokerClient.send('EditBrokerTier', { id: dto.brokerId, subscriptionTier: dto.tier }),
    );
  }

  async getBrokerProperties(dto: { brokerId: string; page: number; limit: number }) {
    const brokerDetails = await lastValueFrom(
      this.brokerClient.send('GetBrokerById', { id: dto.brokerId }),
    );

    return await lastValueFrom(
      this.propertyClient.send('GetProperties', {
        page: Number(dto.page) || 1,
        limit: Number(dto.limit) || 10,
        brokerCode: brokerDetails.brokerCode,
      }),
    );
  }

  async getMonthlyIncome() {
    const dashboard = await this.getOrCreateDashboard();
    const entries = dashboard.monthlyIncome || [];

    return {
      entries: entries.map((entry: any) => ({
        month: entry.month || entry.label || '',
        income: entry.income || entry.value || 0,
      })),
    };
  }

  async getCurrentCommission() {
    const dashboard = await this.getOrCreateDashboard();
    const platformCommission = dashboard.platformCommission || 0;
    const bookingCommission = dashboard.bookingCommission || 0;

    const totalEarnings = platformCommission + bookingCommission;

    return {
      platformCommission,
      bookingCommission,
      totalEarnings,
    };
  }

  async withdraw(dto: {
    amount: number;
    phoneNumber: string;
    provider: 'MTN' | 'AIRTEL';
    payeeName?: string;
    payeeEmail?: string;
    externalId?: string;
    payerNote?: string;
    payeeNote?: string;
    currency?: string;
    bankId?: string;
    bankIdentificationCode?: string;
    bankTransferType?: string;
    sendAt?: string;
  }) {
    this.logger.log(`Received admin withdraw request: amount=${dto.amount}, phone=${dto.phoneNumber}`);
    const result = await lastValueFrom(
      this.paymentClient.send('withdraw', {
        ...dto,
        walletType: 'platform_commission',
      }),
    );
    return result;
  }

  async getWallet(dto: { walletId?: string }) {
    this.logger.log(`Received admin getWallet request: ${dto.walletId || 'default'}`);
    const result = await lastValueFrom(
      this.paymentClient.send('getWallet', {
        walletType: 'platform_commission',
        walletId: dto.walletId,
      }),
    );
    return result;
  }

  async getTransactions(query: { page: number; limit: number; brokerId?: string; reason?: string }) {
    const result = await lastValueFrom(
      this.paymentClient.send('GetTransactions', {
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 10,
        brokerId: query.brokerId || '',
        reason: query.reason || '',
      }),
    );

    const transformedTransactions = (result.transactions || []).map((t: any) => ({
      id: t.id,
      type: t.reasonForPayment || 'payment',
      date: t.createdAt,
      reason: t.reasonForPayment,
      recipientName: t.customerName || '',
      recipientPhone: t.clientPhone || '',
      recipientEmail: t.customerEmail || '',
      senderName: 'Customer',
      senderPhone: t.clientPhone || '',
      senderEmail: t.customerEmail || '',
      amount: t.amount,
      status: t.paymentStatus,
      emailStatus: 'sent',
      referenceNumber: t.referenceNumber,
      transactionCode: t.transactionCode,
    }));

    return {
      transactions: transformedTransactions,
      total: result.total || 0,
    };
  }

  async updateAdminEmail(dto: { adminId: string; email: string }) {
    const admin = await this.adminRepo.findOne({ where: { id: dto.adminId } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    admin.email = dto.email;
    await this.adminRepo.save(admin);

    return { success: true, message: 'Email updated successfully' };
  }

  async updateAdminSms(dto: { adminId: string; phoneNumber: string }) {
    const admin = await this.adminRepo.findOne({ where: { id: dto.adminId } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    admin.phoneNumber = dto.phoneNumber;
    await this.adminRepo.save(admin);

    return { success: true, message: 'Phone number updated successfully' };
  }

  async getNotifications(query: { page?: number; limit?: number; status?: string; type?: string; channel?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.channel) where.channel = query.channel;

    const [notifications, total] = await this.adminMessageRepo.findAndCount({
      where,
      order: { sentAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { notifications, total, page, limit };
  }

  async getActiveCustomerSessions(): Promise<{ sessions: Array<{ sessionId: string; deviceId: string; createdAt: number; lastActivityAt: number; locationLat?: number; locationLng?: number; locationUpdatedAt?: number; ttlSecondsRemaining?: number }>; total: number }> {
    const result = await lastValueFrom(
      this.authClient.send('GetActiveCustomerSessions', {}),
    );
    return result;
  }

  async getLogs(query: { page: number; limit: number; level?: string; service?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const where: any = {};

    if (query.level) {
      where.level = query.level;
    }
    if (query.service) {
      where.service = query.service;
    }

    const [logs, total] = await this.logRepo.findAndCount({
      where,
      order: { timestamp: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      logs: logs.map(log => ({
        id: log.id,
        level: log.level,
        service: log.service,
        message: log.message,
        metadata: log.metadata,
        timestamp: log.timestamp,
      })),
      total,
      page,
      limit,
    };
  }

  async sendMessage(dto: {
    adminId: string;
    adminUsername: string;
    recipientType: string;
    recipientPhone?: string;
    recipientEmail?: string;
    recipientName?: string;
    messageType: string;
    subject?: string;
    body: string;
    channel: string;
  }) {
    const admin = await this.adminRepo.findOne({ where: { id: dto.adminId } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    const adminMessage = this.adminMessageRepo.create({
      adminId: dto.adminId,
      adminUsername: dto.adminUsername,
      recipientType: dto.recipientType,
      recipientPhone: dto.recipientPhone,
      recipientEmail: dto.recipientEmail,
      recipientName: dto.recipientName,
      messageType: dto.messageType,
      subject: dto.subject,
      body: dto.body,
      channel: dto.channel,
      status: 'pending',
    });

    const saved = await this.adminMessageRepo.save(adminMessage);

    if (dto.channel === 'email' && dto.recipientEmail) {
      this.redisClient.emit('send_admin_message_email', {
        recipientEmail: dto.recipientEmail,
        recipientName: dto.recipientName,
        subject: dto.subject,
        body: dto.body,
      });
      admin.sentEmails = (admin.sentEmails || 0) + 1;
    } else if (dto.channel === 'sms' && dto.recipientPhone) {
      this.redisClient.emit('send_admin_message_sms', {
        recipientPhone: dto.recipientPhone,
        recipientName: dto.recipientName,
        body: dto.body,
      });
      admin.sentSms = (admin.sentSms || 0) + 1;
    }

    admin.handledMessages = (admin.handledMessages || 0) + 1;
    await this.adminRepo.save(admin);

    this.logger.log(`Message sent by admin ${dto.adminUsername} to ${dto.recipientType} via ${dto.channel}`);

    return {
      success: true,
      message: 'Message sent successfully',
      messageId: saved.id,
    };
  }

  private async getOrCreateDashboard(): Promise<DashaordEntity> {
    const [existing] = await this.dashboardRepo.find({ take: 1 });
    if (existing) {
      return existing;
    }
  //  const dashboard = this.dashboardRepo.create({ systemMessages: [] });
   
    // Explicitly type the variable as DashboardEntity
  const dashboard: DashaordEntity = this.dashboardRepo.create({
    systemMessages: [],
    minimumWithdrawal: 10000,
  });
  

    return await this.dashboardRepo.save(dashboard);
  }

  private async hashPassword(password: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  private async comparePassword(password: string, hash: string): Promise<boolean> {
    const crypto = await import('crypto');
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    return passwordHash === hash;
  }

  private generateRandomCode(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private async getCachedBroker(brokerId: string): Promise<any> {
    try {
      const cached = await this.redis.get(`broker:cache:${brokerId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // ignore cache miss
    }
    return null;
  }

  private async setCachedBroker(brokerId: string, broker: any): Promise<void> {
    try {
      const { passwordHash: _, ...sanitized } = broker;
      const payload = JSON.stringify(sanitized);
      await this.redis.set(`broker:cache:${brokerId}`, payload, 'EX', 300);
      if (broker.brokerCode) {
        await this.redis.set(`broker:cache:${broker.brokerCode}`, payload, 'EX', 300);
      }
    } catch {
      // ignore cache set errors
    }
  }
}
