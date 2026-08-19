import { Inject, Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ClientProxy, ClientGrpc } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminEntity } from '../entity/admin.entity';
import { DashaordEntity, SystemMessage } from '../entity/dashboard.entity';
import { InvitationCodeEntity } from '../entity/invitation-code.entity';
import { LogEntity } from '../entity/log.entity';
import { AdminMessageEntity } from '../entity/admin-message.entity';
import { lastValueFrom } from 'rxjs';
import Redis from 'ioredis';

export const REDIS_CLIENT_PROVIDER = 'REDIS_CLIENT_PROVIDER';

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
    @Inject('BROKER_CLIENT') private readonly brokerClient: ClientGrpc,
    @Inject('PROPERTY_CLIENT') private readonly propertyClient: ClientGrpc,
    @Inject('PAYMENT_CLIENT') private readonly paymentClient: ClientGrpc,
    @Inject('AUTH_CLIENT') private readonly authClient: ClientGrpc,
    @Inject(REDIS_CLIENT_PROVIDER) private readonly redis: Redis,
  ) {}

  async onModuleInit() {
    this.subscriber = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
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
    try {
      const dashboard = await this.getOrCreateDashboard();
      const current = dashboard.currentCommission || 0;
      dashboard.currentCommission = current + amount;
      await this.dashboardRepo.save(dashboard);
      this.logger.log(`Updated platform commission: ${current} + ${amount} = ${dashboard.currentCommission}`);
    } catch (err) {
      this.logger.error(`Failed to handle update platform commission: ${(err as Error).message}`);
    }
  }

  private async handleBrokerFeedback(data: { feedbackId: string; brokerCode: string; brokerId: string; email: string; phone: string; content: string; timestamp: string }): Promise<void> {
    try {
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
    } catch (err) {
      this.logger.error(`Failed to handle broker feedback: ${(err as Error).message}`);
    }
  }

  async recordBrokerSignup(event: BrokerCreatedEvent) {
    try {
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
    } catch (err) {
      this.logger.error(`Failed to record broker signup for ${event.brokerId}:`, err);
      throw err;
    }
  }

  async recordPaymentFailure(event: PaymentFailedEvent) {
    try {
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
    } catch (err) {
      this.logger.error(`Failed to record payment failure for broker ${event.brokerId}:`, err);
      throw err;
    }
  }

  async approveBroker(brokerId: string) {
    try {
      this.redisClient.emit('broker_approved', { brokerId });

      const dashboard = await this.getOrCreateDashboard();
      dashboard.systemMessages = (dashboard.systemMessages ?? []).map((m) =>
        m.brokerId === brokerId && m.type === 'BROKER_SIGNUP' ? { ...m, read: true } : m,
      );
      await this.dashboardRepo.save(dashboard);

      this.logger.log(`Approved broker ${brokerId} and emitted broker_approved event`);
      return { success: true, brokerId, message: 'Broker approved and notified' };
    } catch (err) {
      this.logger.error(`Failed to approve broker ${brokerId}:`, err);
      throw err;
    }
  }

  async getCommissions() {
    try {
      const dashboard = await this.getOrCreateDashboard();
      return {
        platformCommission: dashboard.platformCommission ?? 0,
        bookingCommission: dashboard.bookingCommission ?? 0,
        minimumWithdrawal: dashboard.minimumWithdrawal ?? 10000,
      };
    } catch (err) {
      this.logger.error('Failed to get commissions:', err);
      throw err;
    }
  }

  async getBrokerCommissions() {
    try {
      const [brokersResult, propertiesResult, transactionsResult] = await Promise.all([
        lastValueFrom(this.brokerClient.getService('BrokerService').getAllBrokers({ page: 1, limit: 1000 })),
        lastValueFrom(this.propertyClient.getService('PropertyService').getProperties({ page: 1, limit: 1000 })),
        lastValueFrom(this.paymentClient.getService('PaymentService').getTransactions({ page: 1, limit: 1000 })),
      ]);

      const brokers = new Map<string, any>();
      for (const b of brokersResult.brokers ?? []) {
        brokers.set(b.id, b);
      }

      const propertyToBroker = new Map<string, string>();
      for (const p of propertiesResult.properties ?? []) {
        propertyToBroker.set(p.id, p.brokersUniqueCode);
      }

      const brokerCommissions = new Map<string, { brokerId: string; brokerCode: string; brokerName: string; tier: string; totalCommission: number; transactionCount: number; totalBookings: number }>();

      for (const t of transactionsResult.transactions ?? []) {
        const brokerCode = propertyToBroker.get(t.propertyId);
        if (!brokerCode) continue;

        const broker = Array.from(brokers.values()).find((b: any) => b.brokerCode === brokerCode);
        if (!broker) continue;

        const key = broker.id;
        const existing = brokerCommissions.get(key);
        const commission = t.platformCommission || 0;
        if (existing) {
          existing.totalCommission += commission;
          existing.transactionCount += 1;
          existing.totalBookings += t.amount || 0;
        } else {
          brokerCommissions.set(key, {
            brokerId: broker.id,
            brokerCode: broker.brokerCode,
            brokerName: broker.username,
            tier: broker.subscriptionTier || 'prop',
            totalCommission: commission,
            transactionCount: 1,
            totalBookings: t.amount || 0,
          });
        }
      }

      return {
        commissions: Array.from(brokerCommissions.values()).sort((a, b) => b.totalCommission - a.totalCommission),
      };
    } catch (err) {
      this.logger.error('Failed to get broker commissions:', err);
      throw err;
    }
  }

  async registerAdmin(dto: { username: string; email: string; password: string; invitationCode: string; role: string }) {
    try {
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
    } catch (err) {
      this.logger.error(`Failed to register admin ${dto.email}:`, err);
      throw err;
    }
  }

  async loginAdmin(dto: { email: string; password: string }) {
    try {
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
    } catch (err) {
      this.logger.error('Failed to login admin:', err);
      throw err;
    }
  }

  async validateAdmin(dto: { email: string; password: string }) {
    try {
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
    } catch (err) {
      this.logger.error('Failed to validate admin:', err);
      throw err;
    }
  }

  async getAdminById(dto: { id: string }) {
    try {
      const admin = await this.adminRepo.findOne({ where: { id: dto.id } });
      if (!admin) {
        throw new NotFoundException(`Admin with id ${dto.id} not found`);
      }

      const { passwordHash: _, ...result } = admin;
      return result;
    } catch (err) {
      this.logger.error(`Failed to get admin by id ${dto.id}:`, err);
      throw err;
    }
  }

  async getAllBrokers(query: { page: number; limit: number }) {
    try {
      return await lastValueFrom(
        this.brokerClient.getService('BrokerService').getAllBrokers({
          page: Number(query.page) || 1,
          limit: Number(query.limit) || 10,
        }),
      );
    } catch (err) {
      this.logger.error('Failed to get all brokers:', err);
      throw err;
    }
  }

  async getPendingVerifications(query: { page: number; limit: number }) {
    try {
      return await lastValueFrom(
        this.brokerClient.getService('BrokerService').getPendingVerifications({
          page: Number(query.page) || 1,
          limit: Number(query.limit) || 10,
        }),
      );
    } catch (err) {
      this.logger.error('Failed to get pending verifications:', err);
      throw err;
    }
  }

  async getProperties(query: { page: number; limit: number; brokerCode?: string }) {
    try {
      return await lastValueFrom(
        this.propertyClient.getService('PropertyService').getProperties({
          page: Number(query.page) || 1,
          limit: Number(query.limit) || 10,
          brokerCode: query.brokerCode || '',
        }),
      );
    } catch (err) {
      this.logger.error('Failed to get properties:', err);
      throw err;
    }
  }

  async getRecentSignups(query: { limit: number }) {
    try {
      return await lastValueFrom(
        this.brokerClient.getService('BrokerService').getRecentSignups({
          limit: Number(query.limit) || 10,
        }),
      );
    } catch (err) {
      this.logger.error('Failed to get recent signups:', err);
      throw err;
    }
  }

  async getPropertyLocations() {
    try {
      return await lastValueFrom(
        this.propertyClient.getService('PropertyService').getPropertyLocations({}),
      );
    } catch (err) {
      this.logger.error('Failed to get property locations:', err);
      throw err;
    }
  }

  async getAllAdmins() {
    try {
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
    } catch (err) {
      this.logger.error('Failed to get all admins:', err);
      throw err;
    }
  }

  async addAdmin(dto: { username: string; email: string; password: string; role: string; createdBy: string }) {
    try {
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
    } catch (err) {
      this.logger.error(`Failed to add admin ${dto.email}:`, err);
      throw err;
    }
  }

  async deleteAdmin(dto: { adminId: string; deletedBy: string }) {
    try {
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
    } catch (err) {
      this.logger.error(`Failed to delete admin ${dto.adminId}:`, err);
      throw err;
    }
  }

  async freezeAdmin(dto: { adminId: string; freeze: boolean; updatedBy: string }) {
    try {
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
    } catch (err) {
      this.logger.error(`Failed to freeze admin ${dto.adminId}:`, err);
      throw err;
    }
  }

  async generateInvitationCode(dto: { superAdminId: string; role: string; expiryHours: number }) {
    try {
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
    } catch (err) {
      this.logger.error('Failed to generate invitation code:', err);
      throw err;
    }
  }

  async getPendingDocuments() {
    try {
      const pendingVerifications = await lastValueFrom(
        this.brokerClient.getService('BrokerService').getPendingVerifications({ page: 1, limit: 100 }),
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
    } catch (err) {
      this.logger.error('Failed to get pending documents:', err);
      throw err;
    }
  }

  async getSystemMessages(query: { page: number; limit: number }) {
    try {
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
    } catch (err) {
      this.logger.error('Failed to get system messages:', err);
      throw err;
    }
  }

  async getClientMessages(query: { page: number; limit: number }) {
    try {
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
    } catch (err) {
      this.logger.error('Failed to get client messages:', err);
      throw err;
    }
  }

  async getBrokerDetails(dto: { brokerId: string }) {
    try {
      const cached = await this.getCachedBroker(dto.brokerId);
      if (cached) {
        const transactions = await lastValueFrom(
          this.paymentClient.getService('PaymentService').getTransactions({ page: 1, limit: 100, brokerId: dto.brokerId }),
        );

        const walletBalance = cached.walletBalance || 0;

        return {
          broker: cached,
          walletBalance,
          transactions: transactions.transactions || [],
        };
      }

      const broker = await lastValueFrom(
        this.brokerClient.getService('BrokerService').getBrokerById({ id: dto.brokerId }),
      );

      const transactions = await lastValueFrom(
        this.paymentClient.getService('PaymentService').getTransactions({ page: 1, limit: 100, brokerId: dto.brokerId }),
      );

      const walletBalance = broker.walletBalance || 0;

      await this.setCachedBroker(dto.brokerId, broker);

      return {
        broker,
        walletBalance,
        transactions: transactions.transactions || [],
      };
    } catch (err) {
      this.logger.error(`Failed to get broker details for ${dto.brokerId}:`, err);
      throw err;
    }
  }

  async getBrokerDetailsFromCache(dto: { brokerId: string }) {
    try {
      const cached = await this.getCachedBroker(dto.brokerId);
      if (!cached) {
        throw new NotFoundException('Broker details not found in cache');
      }

      return {
        broker: cached,
        walletBalance: cached.walletBalance || 0,
        transactions: [],
      };
    } catch (err) {
      this.logger.error(`Failed to get broker details from cache for ${dto.brokerId}:`, err);
      throw err;
    }
  }

  async approveAllPendingVerifications(_dto: { adminId: string }) {
    try {
      const pendingVerifications = await lastValueFrom(
        this.brokerClient.getService('BrokerService').getPendingVerifications({ page: 1, limit: 1000 }),
      );

      const brokers = pendingVerifications.brokers || [];
      const results: Array<{ brokerId: string; success: boolean; message: string }> = [];

      for (const broker of brokers) {
        try {
          this.redisClient.emit('broker_approved', { brokerId: broker.id });

          const dashboard = await this.getOrCreateDashboard();
          dashboard.systemMessages = (dashboard.systemMessages ?? []).map((m) =>
            m.brokerId === broker.id && m.type === 'BROKER_SIGNUP' ? { ...m, read: true } : m,
          );
          await this.dashboardRepo.save(dashboard);

          results.push({ brokerId: broker.id, success: true, message: 'Approved' });
          this.logger.log(`Approved broker ${broker.id}`);
        } catch (err) {
          results.push({ brokerId: broker.id, success: false, message: (err as Error).message });
        }
      }

      return {
        success: true,
        totalProcessed: brokers.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      };
    } catch (err) {
      this.logger.error('Failed to approve all pending verifications:', err);
      throw err;
    }
  }

  async approveBrokerDocument(dto: { brokerId: string; adminId: string; namesMatched: boolean; adminNotes?: string }) {
    try {
      const admin = await this.adminRepo.findOne({ where: { id: dto.adminId } });
      if (!admin) {
        throw new NotFoundException('Admin not found');
      }

      const broker = await lastValueFrom(
        this.brokerClient.getService('BrokerService').getBrokerById({ id: dto.brokerId }),
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
    } catch (err) {
      this.logger.error(`Failed to approve broker document ${dto.brokerId}:`, err);
      throw err;
    }
  }

  async deleteBroker(dto: { brokerId: string; adminId: string }) {
    try {
      const admin = await this.adminRepo.findOne({ where: { id: dto.adminId } });
      if (!admin || admin.role !== 'super_admin') {
        throw new BadRequestException('Only super admin can delete brokers');
      }

      return await lastValueFrom(
        this.brokerClient.getService('BrokerService').deleteBroker({ id: dto.brokerId }),
      );
    } catch (err) {
      this.logger.error(`Failed to delete broker ${dto.brokerId}:`, err);
      throw err;
    }
  }

  async editBrokerTier(dto: { brokerId: string; tier: string; adminId: string }) {
    try {
      const admin = await this.adminRepo.findOne({ where: { id: dto.adminId } });
      if (!admin || admin.role !== 'super_admin') {
        throw new BadRequestException('Only super admin can edit broker tiers');
      }

      return await lastValueFrom(
        this.brokerClient.getService('BrokerService').editBrokerTier({ id: dto.brokerId, subscriptionTier: dto.tier }),
      );
    } catch (err) {
      this.logger.error(`Failed to edit broker tier for ${dto.brokerId}:`, err);
      throw err;
    }
  }

  async getBrokerProperties(dto: { brokerId: string; page: number; limit: number }) {
    try {
      const brokerDetails = await lastValueFrom(
        this.brokerClient.getService('BrokerService').getBrokerById({ id: dto.brokerId }),
      );

      return await lastValueFrom(
        this.propertyClient.getService('PropertyService').getProperties({
          page: Number(dto.page) || 1,
          limit: Number(dto.limit) || 10,
          brokerCode: brokerDetails.brokerCode,
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to get broker properties for ${dto.brokerId}:`, err);
      throw err;
    }
  }

  async getMonthlyIncome() {
    try {
      const dashboard = await this.getOrCreateDashboard();
      const entries = dashboard.monthlyIncome || [];

      return {
        entries: entries.map((entry: any) => ({
          month: entry.month || entry.label || '',
          income: entry.income || entry.value || 0,
        })),
      };
    } catch (err) {
      this.logger.error('Failed to get monthly income:', err);
      throw err;
    }
  }

  async getCurrentCommission() {
    try {
      const dashboard = await this.getOrCreateDashboard();
      const platformCommission = dashboard.platformCommission || 0;
      const bookingCommission = dashboard.bookingCommission || 0;

      const totalEarnings = platformCommission + bookingCommission;

      return {
        platformCommission,
        bookingCommission,
        totalEarnings,
      };
    } catch (err) {
      this.logger.error('Failed to get current commission:', err);
      throw err;
    }
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
    try {
      this.logger.log(`Received admin withdraw request: amount=${dto.amount}, phone=${dto.phoneNumber}`);
      const result = await lastValueFrom(
        this.paymentClient.getService('PaymentService').withdraw({
          ...dto,
          walletType: 'platform_commission',
        }),
      );
      return result;
    } catch (err) {
      this.logger.error('Failed to process withdraw:', err);
      throw err;
    }
  }

  async getWallet(dto: { walletId?: string }) {
    try {
      this.logger.log(`Received admin getWallet request: ${dto.walletId || 'default'}`);
      const result = await lastValueFrom(
        this.paymentClient.getService('PaymentService').getWallet({
          walletType: 'platform_commission',
          walletId: dto.walletId,
        }),
      );
      return result;
    } catch (err) {
      this.logger.error('Failed to get wallet:', err);
      throw err;
    }
  }

  async getTransactions(query: { page: number; limit: number; brokerId?: string; reason?: string }) {
    try {
      const result = await lastValueFrom(
        this.paymentClient.getService('PaymentService').getTransactions({
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
    } catch (err) {
      this.logger.error('Failed to get transactions:', err);
      throw err;
    }
  }

  /**
   * Builds broker billing invoices from subscription payment transactions,
   * enriched with broker recipient details. Supports status filtering
   * (paid | pending | overdue) and pagination. An unpaid subscription
   * transaction whose 14-day due window has elapsed is reported as `overdue`.
   */
  async getInvoices(query: { page?: number; limit?: number; status?: string }) {
    try {
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 20;
      const statusFilter = (query.status || '').trim().toLowerCase();

      const [transactionsResult, brokersResult] = await Promise.all([
        lastValueFrom(
          this.paymentClient.getService('PaymentService').getTransactions({ page: 1, limit: 1000, brokerId: '', reason: '' }),
        ),
        lastValueFrom(
          this.brokerClient.getService('BrokerService').getAllBrokers({ page: 1, limit: 1000 }),
        ),
      ]);

      // Invoices deleted by an admin are suppressed from the derived list.
      const dashboard = await this.getOrCreateDashboard();
      const deletedIds = new Set(dashboard.deletedInvoiceIds ?? []);

      // Index brokers by their code so we can attach recipient details.
      const brokersByCode = new Map<string, any>();
      for (const b of brokersResult.brokers ?? []) {
        if (b.brokerCode) brokersByCode.set(b.brokerCode, b);
      }

      const DUE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      const allInvoices = (transactionsResult.transactions ?? [])
        // Only subscription-related payments are billable invoices.
        .filter((t: any) => typeof t.reasonForPayment === 'string' && t.reasonForPayment.toLowerCase().includes('subscription'))
        // Exclude invoices an admin has deleted.
        .filter((t: any) => !deletedIds.has(t.id))
        .map((t: any, index: number) => {
          const broker = brokersByCode.get(t.propertyId) || brokersByCode.get(t.brokerCode);
          const issueDateMs = t.createdAt ? new Date(t.createdAt).getTime() : now;
          const dueDateMs = issueDateMs + DUE_WINDOW_MS;

          const rawStatus = String(t.paymentStatus || '').toLowerCase();
          const isPaid = rawStatus === 'success' || rawStatus === 'paid' || rawStatus === 'completed';
          const isFailed =
            rawStatus === 'failed' ||
            rawStatus === 'declined' ||  
            rawStatus === 'cancelled' ||
            rawStatus === 'canceled' ||
            rawStatus === 'error';

          let status: 'sent' | 'pending' | 'failed';
          if (isFailed) {
            status = 'failed';
          } else if (isPaid) {
            status = 'sent';
          } else {
            status = 'pending';
          }

          const seq = String(index + 1).padStart(3, '0');
          const year = new Date(issueDateMs).getFullYear();

          return {
            id: t.id,
            invoiceNumber: t.referenceNumber || `INV-${year}-${seq}`,
            recipientName: t.customerName || broker?.username || 'Unknown Broker',
            recipientEmail: t.customerEmail || broker?.email || '',
            brokerCode: broker?.brokerCode || t.brokerCode || '',
            issueDate: new Date(issueDateMs).toISOString(),
            dueDate: new Date(dueDateMs).toISOString(),
            amount: Number(t.amount) || 0,
            currency: 'UGX',
            status,
            description: t.reasonForPayment || 'Broker subscription',
          };
        });

      const filtered = statusFilter && statusFilter !== 'all'
        ? allInvoices.filter((inv: { status: string }) => inv.status === statusFilter)
        : allInvoices;

      const total = filtered.length;
      const start = (page - 1) * limit;
      const invoices = filtered.slice(start, start + limit);

      return { invoices, total, page, limit };
    } catch (err) {
      this.logger.error('Failed to get invoices:', err);
      throw err;
    }
  }

  /**
   * Invoices are derived from payment transactions (there is no invoice table),
   * so "deleting" an invoice records its id in a suppression list on the
   * dashboard entity. Suppressed invoices are filtered out of getInvoices.
   */
  async deleteInvoice(dto: { invoiceId: string }) {
    try {
      const invoiceId = (dto.invoiceId || '').trim();
      if (!invoiceId) {
        throw new BadRequestException('invoiceId is required');
      }

      const dashboard = await this.getOrCreateDashboard();
      const existing = new Set(dashboard.deletedInvoiceIds ?? []);
      existing.add(invoiceId);
      dashboard.deletedInvoiceIds = Array.from(existing);
      await this.dashboardRepo.save(dashboard);

      this.logger.log(`Invoice ${invoiceId} marked as deleted`);
      return { success: true, message: 'Invoice deleted' };
    } catch (err) {
      this.logger.error(`Failed to delete invoice ${dto.invoiceId}:`, err);
      throw err;
    }
  }

  async deleteInvoices(dto: { invoiceIds: string[] }) {
    try {
      const ids = (dto.invoiceIds ?? []).map((id) => String(id).trim()).filter(Boolean);
      if (ids.length === 0) {
        throw new BadRequestException('invoiceIds is required');
      }

      const dashboard = await this.getOrCreateDashboard();
      const existing = new Set(dashboard.deletedInvoiceIds ?? []);
      const before = existing.size;
      for (const id of ids) existing.add(id);
      dashboard.deletedInvoiceIds = Array.from(existing);
      await this.dashboardRepo.save(dashboard);

      const deleted = existing.size - before;
      this.logger.log(`Marked ${deleted} invoice(s) as deleted`);
      return { success: true, message: `Deleted ${deleted} invoice(s)`, deleted };
    } catch (err) {
      this.logger.error('Failed to delete invoices:', err);
      throw err;
    }
  }

  async updateAdminEmail(dto: { adminId: string; email: string }) {
    try {
      const admin = await this.adminRepo.findOne({ where: { id: dto.adminId } });
      if (!admin) {
        throw new NotFoundException('Admin not found');
      }

      admin.email = dto.email;
      await this.adminRepo.save(admin);

      return { success: true, message: 'Email updated successfully' };
    } catch (err) {
      this.logger.error(`Failed to update admin email for ${dto.adminId}:`, err);
      throw err;
    }
  }

  async updateAdminSms(dto: { adminId: string; phoneNumber: string }) {
    try {
      const admin = await this.adminRepo.findOne({ where: { id: dto.adminId } });
      if (!admin) {
        throw new NotFoundException('Admin not found');
      }

      admin.phoneNumber = dto.phoneNumber;
      await this.adminRepo.save(admin);

      return { success: true, message: 'Phone number updated successfully' };
    } catch (err) {
      this.logger.error(`Failed to update admin sms for ${dto.adminId}:`, err);
      throw err;
    }
  }

  async getNotifications(query: { page?: number; limit?: number; status?: string; type?: string; channel?: string }) {
    try {
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
    } catch (err) {
      this.logger.error('Failed to get notifications:', err);
      throw err;
    }
  }

  async getActiveCustomerSessions(dto:{}): Promise<{ sessions: Array<{ sessionId: string; deviceId: string; createdAt: number; lastActivityAt: number; locationLat?: number; locationLng?: number; locationUpdatedAt?: number; ttlSecondsRemaining?: number }>; total: number }> {
    try {
      const result = await lastValueFrom(
        this.authClient.getService('AuthService').getActiveCustomerSessions({}),
      );

      return result;
    } catch (err) {
      this.logger.error('Failed to get active customer sessions:', err);
      throw err;
    }
  }

  async getLogs(query: { page: number; limit: number; level?: string; service?: string }) {
    try {
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
    } catch (err) {
      this.logger.error('Failed to get logs:', err);
      throw err;
    }
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
    try {
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
    } catch (err) {
      this.logger.error('Failed to send message:', err);
      throw err;
    }
  }

  private async getOrCreateDashboard(): Promise<DashaordEntity> {
    try {
      const [existing] = await this.dashboardRepo.find({ take: 1 });
      if (existing) {
        return existing;
      }
      const dashboard: DashaordEntity = this.dashboardRepo.create({
        systemMessages: [],
        minimumWithdrawal: 10000,
      });

      return await this.dashboardRepo.save(dashboard);
    } catch (err) {
      this.logger.error(`Failed to get or create dashboard:`, err);
      throw err;
    }
  }

  private async hashPassword(password: string): Promise<string> {
    try {
      const crypto = await import('crypto');
      return crypto.createHash('sha256').update(password).digest('hex');
    } catch (err) {
      this.logger.error(`Failed to hash password:`, err);
      throw err;
    }
  }

  private async comparePassword(password: string, hash: string): Promise<boolean> {
    try {
      const crypto = await import('crypto');
      const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
      return passwordHash === hash;
    } catch (err) {
      this.logger.error(`Failed to compare password:`, err);
      throw err;
    }
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
