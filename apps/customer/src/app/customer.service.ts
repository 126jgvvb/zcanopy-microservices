import { Injectable, Logger, BadRequestException, NotFoundException, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import Redis from 'ioredis';
import { lastValueFrom, firstValueFrom, timeout } from 'rxjs';
import { randomUUID } from 'crypto';
import { CustomerEntity } from './entity/customer.entity';
import { CustomerOtpEntity } from './entity/customer-otp.entity';
import { CustomerMessageEntity } from './entity/customer-message.entity';
import { CustomerNotificationEntity } from './entity/customer-notification.entity';
import type { ClientGrpc as ClientGrpcType } from '@nestjs/microservices';

export interface JwtCustomerPayload {
  sub: string;
  email: string;
  role: string;
  type: 'customer';
  customerId: string;
}

export interface CustomerSessionResponse {
  sessionToken: string;
  sessionId: string;
  expiresAt: number;
  ttlSeconds: number;
}

export interface CustomerProfileResponse {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  isVerified: boolean;
  authProvider: string;
  createdAt: Date;
}

const DEFAULT_CUSTOMER_SESSION_TTL = 30 * 24 * 60 * 60;

@Injectable()
export class CustomerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CustomerService.name);
  private redis!: Redis;
  private redisSubscriber!: Redis;

  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(CustomerOtpEntity)
    private readonly otpRepo: Repository<CustomerOtpEntity>,
    @InjectRepository(CustomerMessageEntity)
    private readonly messageRepo: Repository<CustomerMessageEntity>,
    @InjectRepository(CustomerNotificationEntity)
    private readonly notificationRepo: Repository<CustomerNotificationEntity>,
    @Inject('AUTH_CLIENT') private readonly authClient: ClientGrpcType,
    @Inject('PROPERTY_CLIENT') private readonly propertyClient: ClientGrpcType,
    @Inject('PAYMENT_CLIENT') private readonly paymentClient: ClientGrpcType,
    @Inject('NOTIFICATION_CLIENT') private readonly notificationClient: ClientProxy,
    private readonly jwtService: JwtService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = Number(this.configService.get<string>('REDIS_PORT') || '6379');
    const password = this.configService.get<string>('REDIS_PASSWORD') || undefined;
    const db = Number(this.configService.get<string>('REDIS_DB') || '0');

    this.redis = new Redis({ host, port, password, db, connectTimeout: 10000, retryStrategy: (times) => Math.min(times * 500, 5000), maxRetriesPerRequest: 10, keepAlive: 60 });
    this.redisSubscriber = new Redis({ host, port, password, db, connectTimeout: 10000, retryStrategy: (times) => Math.min(times * 500, 5000), maxRetriesPerRequest: 10, keepAlive: 60 });

    this.redisSubscriber.subscribe('broker_property_created', (err) => {
      if (err) this.logger.error('Failed to subscribe to broker_property_created', err);
    });

    this.redisSubscriber.on('message', (channel, message) => {
      if (channel === 'broker_property_created') {
        try {
          const data = JSON.parse(message);
          this.handlePropertyCreatedForCustomerSearchMatch(data);
        } catch (err) {
          this.logger.error(`Failed to handle broker_property_created: ${(err as Error).message}`);
        }
      }
    });
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit();
    if (this.redisSubscriber) await this.redisSubscriber.quit();
  }

  private customerSessionKey(sessionId: string): string {
    return `customer:session:${sessionId}`;
  }

  private getCustomerSessionTtl(): number {
    const fromEnv = Number(process.env.CUSTOMER_SESSION_TTL_SECONDS);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_CUSTOMER_SESSION_TTL;
  }

  private hashPassword(password: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async createCustomerSession(customer: CustomerEntity, ttlSeconds?: number): Promise<CustomerSessionResponse> {
    const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : this.getCustomerSessionTtl();
    const sessionId = randomUUID();
    const now = Date.now();

    await this.redis.set(this.customerSessionKey(sessionId), JSON.stringify({ customerId: customer.id, email: customer.email, createdAt: now, lastActivityAt: now }), 'EX', ttl);

    const payload: JwtCustomerPayload = { sub: sessionId, email: customer.email, role: 'customer', type: 'customer', customerId: customer.id };
    const sessionToken = this.jwtService.sign(payload, { expiresIn: `${ttl}s` });

    return { sessionToken, sessionId, expiresAt: now + ttl * 1000, ttlSeconds: ttl };
  }

  async registerCustomer(dto: { email: string; password: string; firstName?: string; lastName?: string; phoneNumber?: string }): Promise<{ success: boolean; message: string; customerId?: string }> {
    try {
      const existing = await this.customerRepo.findOne({ where: { email: dto.email } });
      if (existing) {
        throw new BadRequestException('Customer with this email already exists');
      }

      const customer = this.customerRepo.create({
        email: dto.email,
        passwordHash: this.hashPassword(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
        authProvider: 'email',
        isVerified: false,
        isActive: true,
      });

      const saved = await this.customerRepo.save(customer);
      this.logger.log(`Registered customer ${saved.id} with email ${saved.email}`);

      await this.sendEmailOtp(saved.email, saved.id);

      return { success: true, message: 'Registration successful. Please verify your email.', customerId: saved.id };
    } catch (err) {
      this.logger.error(`Failed to register customer ${dto.email}:`, err);
      throw err;
    }
  }

  async loginCustomer(dto: { email: string; password: string }): Promise<{ success: boolean; message: string; customer?: CustomerProfileResponse; session?: CustomerSessionResponse }> {
    try {
      const customer = await this.customerRepo.findOne({ where: { email: dto.email } });
      if (!customer || !customer.passwordHash) {
        throw new BadRequestException('Invalid email or password');
      }

      const hashed = this.hashPassword(dto.password);
      if (hashed !== customer.passwordHash) {
        throw new BadRequestException('Invalid email or password');
      }

      if (!customer.isActive) {
        throw new BadRequestException('Account is deactivated');
      }

      if (!customer.isVerified) {
        throw new BadRequestException('Email not verified');
      }

      const session = await this.createCustomerSession(customer);
      await this.customerRepo.update(customer.id, { lastLoginAt: new Date() });

      await this.linkSearchesToCustomer(customer.id).catch(err => this.logger.warn(`Failed to link searches to customer ${customer.id}: ${(err as Error).message}`));

      return {
        success: true,
        message: 'Login successful',
        customer: this.mapCustomerToProfile(customer),
        session,
      };
    } catch (err) {
      this.logger.error(`Customer login failed for ${dto.email}:`, err);
      throw err;
    }
  }

  async loginCustomerGoogle(dto: { googleId: string; email?: string; firstName?: string; lastName?: string }): Promise<{ success: boolean; message: string; customer?: CustomerProfileResponse; session?: CustomerSessionResponse }> {
    try {
      let customer = await this.customerRepo.findOne({ where: { googleId: dto.googleId } });

      if (!customer && dto.email) {
        customer = await this.customerRepo.findOne({ where: { email: dto.email } });
      }

      if (!customer) {
        customer = this.customerRepo.create({
          email: dto.email || `${dto.googleId}@google.local`,
          googleId: dto.googleId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          authProvider: 'google',
          isVerified: true,
          isActive: true,
        });
        const saved = await this.customerRepo.save(customer);
        this.logger.log(`Created Google customer ${saved.id}`);
        customer = saved;
      } else {
        const updated = await this.customerRepo.save({ ...customer, googleId: dto.googleId, firstName: dto.firstName || customer.firstName, lastName: dto.lastName || customer.lastName, authProvider: 'google', isVerified: true, lastLoginAt: new Date() });
        customer = updated;
      }

      const session = await this.createCustomerSession(customer);

      await this.linkSearchesToCustomer(customer.id).catch(err => this.logger.warn(`Failed to link searches to customer ${customer.id}: ${(err as Error).message}`));

      return { success: true, message: 'Google login successful', customer: this.mapCustomerToProfile(customer), session };
    } catch (err) {
      this.logger.error(`Customer Google login failed for ${dto.googleId}:`, err);
      throw err;
    }
  }

  async confirmOtp(dto: { email: string; otpCode: string }): Promise<{ success: boolean; message: string; session?: CustomerSessionResponse }> {
    try {
      const customer = await this.customerRepo.findOne({ where: { email: dto.email } });
      if (!customer) {
        throw new BadRequestException('Customer not found');
      }

      const otp = await this.otpRepo.findOne({ where: { customerId: customer.id, otpCode: dto.otpCode, isUsed: false }, order: { createdAt: 'DESC' } });

      if (!otp) {
        throw new BadRequestException('Invalid or expired OTP');
      }

      await this.otpRepo.update(otp.id, { isUsed: true, isVerified: true });
      await this.customerRepo.update(customer.id, { isVerified: true });

      const session = await this.createCustomerSession(customer);
      return { success: true, message: 'Email verified successfully', session };
    } catch (err) {
      this.logger.error(`OTP confirmation failed for ${dto.email}:`, err);
      throw err;
    }
  }

  async updatePhoneNumber(customerId: string, phoneNumber: string): Promise<{ success: boolean; message: string }> {
    try {
      const customer = await this.customerRepo.findOne({ where: { id: customerId } });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }

      await this.customerRepo.update(customerId, { phoneNumber });
      return { success: true, message: 'Phone number updated successfully' };
    } catch (err) {
      this.logger.error(`Failed to update phone number for customer ${customerId}:`, err);
      throw err;
    }
  }

  async getProfile(customerId: string): Promise<CustomerProfileResponse> {
    try {
      const customer = await this.customerRepo.findOne({ where: { id: customerId } });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      return this.mapCustomerToProfile(customer);
    } catch (err) {
      this.logger.error(`Failed to get profile for customer ${customerId}:`, err);
      throw err;
    }
  }

  async getWalletBalance(customerId: string): Promise<{ balance?: number; currency?: string; walletId?: string }> {
    try {
      const customer = await this.customerRepo.findOne({ where: { id: customerId } });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }

      try {
        const walletResponse = await firstValueFrom(
          this.httpService.get(`${process.env.IOTEC_SERVICE_URL || 'http://localhost:2000'}/iotec/wallet/${customerId}/balance`),
        );
        return { balance: walletResponse.data?.actualBalance, currency: walletResponse.data?.currency, walletId: walletResponse.data?.id || customerId };
      } catch (error) {
        this.logger.error(`Failed to get wallet balance for customer ${customerId}: ${(error as Error).message}`);
        return { balance: 0, currency: 'UGX', walletId: customerId };
      }
    } catch (err) {
      this.logger.error(`Failed to get wallet balance for customer ${customerId}:`, err);
      throw err;
    }
  }

  async logout(sessionToken: string): Promise<{ success: boolean }> {
    try {
      const authService = this.authClient.getService<any>('AuthService');
      await lastValueFrom(authService.RevokeCustomerSession({ sessionToken }));
      return { success: true };
    } catch (err) {
      this.logger.error(`Failed to logout customer session ${sessionToken}:`, err);
      return { success: false };
    }
  }

  async unsubscribe(customerId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.customerRepo.update(customerId, { isActive: false });
      return { success: true, message: 'Unsubscribed successfully' };
    } catch (err) {
      this.logger.error(`Failed to unsubscribe customer ${customerId}:`, err);
      throw err;
    }
  }

  async getInvoices(customerId: string, page = 1, limit = 10): Promise<{ invoices: any[]; total: number }> {
    try {
      const paymentService = this.paymentClient.getService<any>('PaymentService');
      const result = await lastValueFrom(paymentService.GetTransactions({ page, limit, brokerId: customerId }).pipe(timeout(5000))) as any;
      return { invoices: result.transactions || [], total: result.total || 0 };
    } catch (err) {
      this.logger.error(`Failed to get invoices for customer ${customerId}:`, err);
      return { invoices: [], total: 0 };
    }
  }

  async getTransactions(customerId: string, page = 1, limit = 10): Promise<{ transactions: any[]; total: number }> {
    try {
      const paymentService = this.paymentClient.getService<any>('PaymentService');
      const result = await lastValueFrom(paymentService.GetTransactions({ page, limit, brokerId: customerId }).pipe(timeout(5000))) as any;
      return { transactions: result.transactions || [], total: result.total || 0 };
    } catch (err) {
      this.logger.error(`Failed to get transactions for customer ${customerId}:`, err);
      return { transactions: [], total: 0 };
    }
  }

  async getMessages(customerId: string, page = 1, limit = 10): Promise<{ messages: any[]; total: number }> {
    try {
      const [messages, total] = await this.messageRepo.findAndCount({
        where: { customerId },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return {
        messages: messages.map(m => ({ id: m.id, subject: m.subject, body: m.body, source: m.source, attachmentUrl: m.attachmentUrl, createdAt: m.createdAt })),
        total,
      };
    } catch (err) {
      this.logger.error(`Failed to get messages for customer ${customerId}:`, err);
      return { messages: [], total: 0 };
    }
  }

  async getNotifications(customerId: string, page = 1, limit = 20): Promise<{ notifications: any[]; total: number; unreadCount: number }> {
    try {
      const [notifications, total] = await this.notificationRepo.findAndCount({
        where: { customerId },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      const unreadCount = await this.notificationRepo.count({ where: { customerId, isRead: false } });

      return {
        notifications: notifications.map(n => ({ id: n.id, title: n.title, body: n.body, type: n.type, isRead: n.isRead, createdAt: n.createdAt, readAt: n.readAt })),
        total,
        unreadCount,
      };
    } catch (err) {
      this.logger.error(`Failed to get notifications for customer ${customerId}:`, err);
      return { notifications: [], total: 0, unreadCount: 0 };
    }
  }

  async initiateTransaction(dto: { customerId: string; phoneNumber: string; email: string; customerName?: string; propertyId?: string; reason?: string; amount?: number }): Promise<{ success: boolean; message: string; transactionCode?: string }> {
    try {
      const propertyService = this.propertyClient.getService<any>('PropertyService');
      const result = await lastValueFrom(
        propertyService.CreateCustomerBooking({
          sessionToken: '',
          propertyId: dto.propertyId || '',
          customerName: dto.customerName || '',
          customerPhone: dto.phoneNumber,
          customerEmail: dto.email,
          date: new Date().toISOString(),
          amount: dto.amount || 0,
          reason: dto.reason || 'property_access',
          status: 'pending',
        }).pipe(timeout(5000)),
      ) as any;

      return { success: true, message: 'Transaction initiated successfully', transactionCode: result.transactionCode };
    } catch (err) {
      this.logger.error(`Failed to initiate transaction for customer ${dto.customerId}:`, err);
      throw new BadRequestException('Failed to initiate transaction');
    }
  }

  async recordSearch(dto: { sessionToken: string; query?: string; location?: string; radius?: number; propertyType?: string; minPrice?: number; maxPrice?: number; subCounty?: string; district?: string; hadResults?: boolean; resultPropertyIds?: string[]; resultCount?: number }): Promise<{ success: boolean }> {
    try {
      const propertyService = this.propertyClient.getService<any>('PropertyService');
      const result = await lastValueFrom(
        propertyService.RecordCustomerSearch({
          sessionToken: dto.sessionToken,
          query: dto.query || '',
          location: dto.location || '',
          radius: Number(dto.radius) || 0,
          propertyType: dto.propertyType || '',
          filters: {},
          resultPropertyIds: dto.resultPropertyIds || [],
          resultCount: Number(dto.resultCount) || 0,
          minPrice: Number(dto.minPrice) || 0,
          maxPrice: Number(dto.maxPrice) || 0,
          subCounty: dto.subCounty || '',
          district: dto.district || '',
        }).pipe(timeout(5000)),
      ) as any;
      return result;
    } catch (err) {
      this.logger.error(`Failed to record search for session ${dto.sessionToken}:`, err);
      return { success: false };
    }
  }

  async getCustomerSearches(sessionToken: string, page = 1, limit = 10): Promise<{ searches: any[]; total: number }> {
    try {
      const propertyService = this.propertyClient.getService<any>('PropertyService');
      const result = await lastValueFrom(
        propertyService.GetCustomerSearches({ sessionToken, page, limit }).pipe(timeout(5000)),
      ) as any;
      return { searches: result.searches || [], total: result.total || 0 };
    } catch (err) {
      this.logger.error(`Failed to get customer searches for session ${sessionToken}:`, err);
      return { searches: [], total: 0 };
    }
  }

  async videoTours(sessionToken: string, query: any): Promise<any> {
    try {
      const propertyService = this.propertyClient.getService<any>('PropertyService');
      return lastValueFrom(
        propertyService.GetCustomerProperties({
          sessionToken,
          page: Number(query.page) || 1,
          limit: Math.min(Number(query.limit) || 12, 12),
          lat: query.lat ? Number(query.lat) : undefined,
          lng: query.lng ? Number(query.lng) : undefined,
          radiusKm: query.radiusKm ? Number(query.radiusKm) : undefined,
          propertyType: query.propertyType,
        }).pipe(timeout(5000)),
      );
    } catch (err) {
      this.logger.error(`Failed to get video tours for session ${sessionToken}:`, err);
      throw new BadRequestException('Failed to get video tours');
    }
  }

  async getAllProperties(sessionToken: string, query: any): Promise<any> {
    try {
      const propertyService = this.propertyClient.getService<any>('PropertyService');
      return lastValueFrom(
        propertyService.GetCustomerProperties({
          sessionToken,
          page: Number(query.page) || 1,
          limit: Math.min(Number(query.limit) || 12, 12),
          lat: query.lat ? Number(query.lat) : undefined,
          lng: query.lng ? Number(query.lng) : undefined,
          radiusKm: query.radiusKm ? Number(query.radiusKm) : undefined,
          propertyType: query.propertyType,
        }).pipe(timeout(5000)),
      );
    } catch (err) {
      this.logger.error(`Failed to get all properties for session ${sessionToken}:`, err);
      throw new BadRequestException('Failed to get properties');
    }
  }

  async explorer(sessionToken: string, query: any): Promise<any> {
    try {
      const propertyService = this.propertyClient.getService<any>('PropertyService');
      const result = await lastValueFrom(
        propertyService.GetCustomerProperties({
          sessionToken,
          page: Number(query.page) || 1,
          limit: Math.min(Number(query.limit) || 12, 12),
        }).pipe(timeout(5000)),
      ) as any;

      const videoCount = (result.properties || []).filter((p: any) => p.videoUrl && p.videoUrl.length > 0).length;
      return { ...result, videoCount };
    } catch (err) {
      this.logger.error(`Failed to get explorer properties for session ${sessionToken}:`, err);
      throw new BadRequestException('Failed to get explorer properties');
    }
  }

  async getPropertyDetails(sessionToken: string, propertyId: string): Promise<any> {
    try {
      const propertyService = this.propertyClient.getService<any>('PropertyService');
      return lastValueFrom(
        propertyService.GetPropertyDetailsForCustomer({ sessionToken, propertyId }).pipe(timeout(5000)),
      );
    } catch (err) {
      this.logger.error(`Failed to get property details for ${propertyId}:`, err);
      throw new BadRequestException('Failed to get property details');
    }
  }

  async getSimilarProperties(sessionToken: string, propertyId: string): Promise<any> {
    try {
      const propertyService = this.propertyClient.getService<any>('PropertyService');
      return lastValueFrom(
        propertyService.GetPropertyDetailsForCustomer({ sessionToken, propertyId }).pipe(timeout(5000)),
      );
    } catch (err) {
      this.logger.error(`Failed to get similar properties for ${propertyId}:`, err);
      throw new BadRequestException('Failed to get similar properties');
    }
  }

  async search(dto: { sessionToken: string; query?: string; location?: string; radius?: number; propertyType?: string; subCounty?: string; district?: string; minPrice?: number; maxPrice?: number; page?: number; limit?: number; lat?: number; lng?: number; radiusKm?: number }): Promise<any> {
    try {
      const propertyService = this.propertyClient.getService<any>('PropertyService');
      const result = await lastValueFrom(
        propertyService.SearchProperties({
          sessionToken: dto.sessionToken,
          query: dto.query || '',
          page: Number(dto.page) || 1,
          limit: Number(dto.limit) || 12,
          location: dto.location || '',
          radius: Number(dto.radius) || 0,
          propertyType: dto.propertyType || '',
          subCounty: dto.subCounty || '',
          district: dto.district || '',
          minPrice: Number(dto.minPrice) || 0,
          maxPrice: Number(dto.maxPrice) || 0,
          lat: dto.lat,
          lng: dto.lng,
          radiusKm: dto.radiusKm,
        }).pipe(timeout(5000)),
      ) as any;

      await this.recordSearch({
        sessionToken: dto.sessionToken,
        query: dto.query,
        location: dto.location,
        radius: dto.radius,
        propertyType: dto.propertyType,
        minPrice: dto.minPrice,
        maxPrice: dto.maxPrice,
        subCounty: dto.subCounty,
        district: dto.district,
        hadResults: (result.properties || []).length > 0,
        resultPropertyIds: (result.properties || []).map((p: any) => p.id),
        resultCount: result.total || 0,
      }).catch((err) => {
        this.logger.warn(`Failed to record search: ${(err as Error).message}`);
      });

      return result;
    } catch (err) {
      this.logger.error(`Failed to search properties for session ${dto.sessionToken}:`, err);
      throw new BadRequestException('Failed to search properties');
    }
  }

  async handlePropertyCreatedForCustomerSearchMatch(data: any): Promise<void> {
    try {
      if (!data || !data.brokerCode || !data.propertyId) {
        return;
      }

      const propertyService = this.propertyClient.getService<any>('PropertyService');
      const result = await lastValueFrom(
        propertyService.GetZeroResultSearches({ page: 1, limit: 100 }).pipe(timeout(5000)),
      ) as any;

      const searches = result.searches || [];
      for (const search of searches) {
        if (!search.customerId) {
          continue;
        }
        const matches = this.doesPropertyMatchSearch(data, search);
        if (matches) {
          await this.sendNewPropertyMatchNotification(search, data);
        }
      }
    } catch (err) {
      this.logger.error(`Failed to handle property created for search match: ${(err as Error).message}`);
    }
  }

  private doesPropertyMatchSearch(property: any, search: any): boolean {
    if (search.propertyType && property.propertyType && search.propertyType !== property.propertyType) {
      return false;
    }

    if (search.minPrice > 0 && property.price != null && Number(property.price) < search.minPrice) {
      return false;
    }

    if (search.maxPrice > 0 && property.price != null && Number(property.price) > search.maxPrice) {
      return false;
    }

    if (search.location && property.location && !property.location.toLowerCase().includes(search.location.toLowerCase())) {
      return false;
    }

    if (search.query && property.title && !property.title.toLowerCase().includes(search.query.toLowerCase())) {
      return false;
    }

    return true;
  }

  private async sendNewPropertyMatchNotification(search: any, property: any): Promise<void> {
    try {
      const customer = await this.customerRepo.findOne({ where: { id: search.customerId } });
      if (!customer || !customer.email) {
        return;
      }

      const notification = this.notificationRepo.create({
        customerId: customer.id,
        title: 'New property matching your search',
        body: `A new property "${property.title}" has been listed that matches your search criteria.`,
        type: 'new_property_match',
        dataJson: JSON.stringify({ propertyId: property.propertyId, propertyTitle: property.title, searchId: search.id }),
      });
      await this.notificationRepo.save(notification);

      await this.notificationClient.send('send_email_otp', {
        email: customer.email,
        subject: 'New property matching your search',
        html: `<p>A new property matching your saved search has been listed.</p><p><strong>${property.title}</strong></p><p>Location: ${property.location || 'N/A'}</p>`,
      });

      if (customer.fcmToken) {
        await this.notificationClient.send('send_fcm_notification', {
          fcmToken: customer.fcmToken,
          title: 'New property match',
          body: `A new property matching your search has been listed: ${property.title}`,
          data: { type: 'new_property_match', propertyId: property.propertyId, searchId: search.id },
        });
      }
    } catch (err) {
      this.logger.error(`Failed to send new property match notification: ${(err as Error).message}`);
    }
  }

  private async sendEmailOtp(email: string, customerId: string): Promise<void> {
    const otpCode = this.generateOtp();
    const otp = this.otpRepo.create({ customerId, otpCode, channel: 'email', isUsed: false, isVerified: false });
    await this.otpRepo.save(otp);

    await this.notificationClient.emit('send_email_otp', {
      otp: otpCode,
      email,
      ttlSeconds: 600,
      purpose: 'customer-registration',
    });
  }

  private async linkSearchesToCustomer(customerId: string): Promise<void> {
    const propertyService = this.propertyClient.getService<any>('PropertyService');
    const authService = this.authClient.getService<any>('AuthService');

    try {
      const sessionsResult = await lastValueFrom(authService.GetActiveCustomerSessions({}).pipe(timeout(5000))) as any;
      for (const session of sessionsResult.sessions || []) {
        if (session.deviceId) {
          await lastValueFrom(
            propertyService.UpdateCustomerSearchCustomerId({ sessionToken: session.deviceId, customerId }).pipe(timeout(5000)),
          );
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to link sessions to customer ${customerId}: ${(err as Error).message}`);
    }
  }

  private mapCustomerToProfile(customer: CustomerEntity): CustomerProfileResponse {
    return {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName || undefined,
      lastName: customer.lastName || undefined,
      phoneNumber: customer.phoneNumber || undefined,
      isVerified: customer.isVerified,
      authProvider: customer.authProvider,
      createdAt: customer.createdAt,
    };
  }
}
