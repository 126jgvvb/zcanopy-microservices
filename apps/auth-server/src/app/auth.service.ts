import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ClientGrpc } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';

// Recommended customer session lifetime. Customers browse anonymously, so the
// session must survive across app restarts/backgrounding long enough to keep
// recent searches and the last known location useful, but still expire to avoid
// unbounded growth. 7 days of absolute inactivity is a sensible default; the TTL
// is "slid" forward on every validated activity so an actively used session
// stays alive, and expires `ttl` after the last activity.
export const DEFAULT_CUSTOMER_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type: 'admin' | 'broker' | 'customer';
  deviceId?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
    type: 'admin' | 'broker';
  };
}

export interface CustomerSessionResponse {
  sessionToken: string;
  sessionId: string;
  deviceId: string;
  expiresAt: number;
  ttlSeconds: number;
}

export interface ValidateCustomerSessionResponse {
  valid: boolean;
  sessionId: string;
  deviceId: string;
}

export interface GetCustomerSessionResponse {
  found: boolean;
  sessionId?: string;
  deviceId?: string;
  createdAt?: number;
  lastActivityAt?: number;
  locationLat?: number;
  locationLng?: number;
  locationUpdatedAt?: number;
  ttlSecondsRemaining?: number;
}

export interface BrokerSessionResponse {
  sessionToken: string;
  sessionId: string;
  deviceId: string;
  brokerCode: string;
  expiresAt: number;
  ttlSeconds: number;
}

export interface ValidateBrokerSessionResponse {
  valid: boolean;
  sessionId: string;
  deviceId: string;
  brokerCode: string;
}

export interface GetBrokerSessionResponse {
  found: boolean;
  sessionId?: string;
  deviceId?: string;
  brokerCode?: string;
  createdAt?: number;
  lastActivityAt?: number;
  ttlSecondsRemaining?: number;
}

interface StoredSession {
  sessionId: string;
  deviceId: string;
  createdAt: number;
  lastActivityAt: number;
  location: { lat: number; lng: number; updatedAt: number } | null;
}

interface AdminServiceClient {
  validateAdmin(data: { email: string; password: string }): any;
  getAdminById(data: { id: string }): any;
}

interface BrokerServiceClient {
  validateBroker(data: { email: string; password: string }): any;
  getBrokerById(data: { id: string }): any;
  loginBroker(data: { brokerCode: string; password?: string; deviceId?: string; googleId?: string }): any;
  setupBrokerAccount(data: { brokerCode: string; password: string; deviceId: string }): any;
}

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private redis!: Redis;

  private adminServiceRpc!: AdminServiceClient;
  private brokerServiceRpc!: BrokerServiceClient;

  constructor(
    @Inject('ADMIN_CLIENT') private readonly adminClient: ClientGrpc,
    @Inject('BROKER_CLIENT') private readonly brokerClient: ClientGrpc,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    });

    // Extract gRPC service wrappers
    this.adminServiceRpc = this.adminClient.getService<AdminServiceClient>('AdminService');
    this.brokerServiceRpc = this.brokerClient.getService<BrokerServiceClient>('BrokerService');
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  async validateAdmin(email: string, password: string): Promise<any> {
    try {
      const admin = await lastValueFrom(
        this.adminServiceRpc.validateAdmin({ email, password }),
      );
      return admin;
    } catch (err) {
      this.logger.error(`Failed to validate admin ${email}:`, err);
      throw err;
    }
  }

  async validateBroker(email: string, password: string): Promise<any> {
    try {
      const broker = await lastValueFrom(
        this.brokerServiceRpc.validateBroker({ email, password }),
      );
      return broker;
    } catch (err) {
      this.logger.error(`Failed to validate broker ${email}:`, err);
      throw err;
    }
  }

  async login(dto: { email: string; password: string; type: 'admin' | 'broker' }): Promise<LoginResponse> {
    try {
      let user: any;
      let role: string;

      if (dto.type === 'admin') {
        user = await this.validateAdmin(dto.email, dto.password);
        role = user.role || 'admin';
      } else {
        user = await this.validateBroker(dto.email, dto.password);
        role = 'broker';
      }

      const payload: JwtPayload = {
        sub: user.id,
        email: user.email,
        role,
        type: dto.type,
      };

      const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
      const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

      this.logger.log(`User ${user.email} logged in successfully`);

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role,
          type: dto.type,
        },
      };
    } catch (err) {
      this.logger.error(`Login failed for ${dto.email}:`, err);
      throw err;
    }
  }

  async loginBroker(dto: { brokerCode: string; password?: string; deviceId?: string; googleId?: string }): Promise<any> {
    try {
      const broker: any = await lastValueFrom(
        this.brokerServiceRpc.loginBroker({
          brokerCode: dto.brokerCode,
          password: dto.password,
          deviceId: dto.deviceId,
          googleId: dto.googleId,
        }),
      );

      if (!broker.success) {
        throw new BadRequestException(broker.message || 'Login failed');
      }

      return {
        success: true,
        message: 'Login successful',
        id: broker.broker.id,
        email: broker.broker.email,
        username: broker.broker.username,
        brokerCode: broker.broker.brokerCode,
        isVerified: broker.broker.isVerified,
      };
    } catch (err) {
      this.logger.error(`Broker login failed for ${dto.brokerCode}:`, err);
      throw err;
    }
  }

  async setupBroker(dto: { brokerCode: string; password: string; deviceId: string }): Promise<any> {
    try {
      const result: any = await lastValueFrom(
        this.brokerServiceRpc.setupBrokerAccount({
          brokerCode: dto.brokerCode,
          password: dto.password,
          deviceId: dto.deviceId,
        }),
      );

      if (!result.success) {
        throw new BadRequestException(result.message || 'Broker setup failed');
      }

      const broker = result.broker || {};

      return {
        success: true,
        message: result.message || 'Broker account setup successful',
        id: broker.id,
        email: broker.email,
        username: broker.username,
        brokerCode: broker.brokerCode,
        isVerified: broker.isVerified,
        sessionToken: result.sessionToken,
        sessionId: result.sessionId,
        deviceId: result.deviceId,
      };
    } catch (err) {
      this.logger.error(`Broker setup failed for ${dto.brokerCode}:`, err);
      throw err;
    }
  }

  async refreshToken(token: string): Promise<LoginResponse> {
    try {
      const payload = this.jwtService.verify(token);

      let user: any;
      let role: string;

      if (payload.type === 'admin') {
        user = await lastValueFrom(
          this.adminServiceRpc.getAdminById({ id: payload.sub }),
        );
        role = user?.role || 'admin';
      } else {
        user = await lastValueFrom(
          this.brokerServiceRpc.getBrokerById({ id: payload.sub }),
        );
        role = 'broker';
      }

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const newPayload: JwtPayload = {
        sub: user.id,
        email: user.email,
        role,
        type: payload.type,
      };

      const accessToken = this.jwtService.sign(newPayload, { expiresIn: '15m' });
      const refreshToken = this.jwtService.sign(newPayload, { expiresIn: '7d' });

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role,
          type: payload.type,
        },
      };
    } catch {
      throw new BadRequestException('Invalid refresh token');
    }
  }

  async validateToken(token: string): Promise<JwtPayload | null> {
    try {
      return this.jwtService.verify(token) as JwtPayload;
    } catch {
      return null;
    }
  }

  private getCustomerSessionTtl(): number {
    const fromEnv = Number(process.env.CUSTOMER_SESSION_TTL_SECONDS);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_CUSTOMER_SESSION_TTL_SECONDS;
  }

  private sessionKey(sessionId: string): string {
    return `customer:session:${sessionId}`;
  }

  private deviceKey(deviceId: string): string {
    return `customer:device:${deviceId}`;
  }

  /**
   * Creates a server-generated customer session when the customer presses
   * "get started". The session is bound to the device id and stored in Redis
   * with a TTL. Returns a signed session token the client uses on later calls.
   */
  async createCustomerSession(dto: { deviceId: string; ttlSeconds?: number }): Promise<CustomerSessionResponse> {
    try {
      if (!dto.deviceId) {
        throw new BadRequestException('deviceId is required to start a customer session');
      }

      const ttl = dto.ttlSeconds && dto.ttlSeconds > 0 ? dto.ttlSeconds : this.getCustomerSessionTtl();
      const sessionId = randomUUID();
      const now = Date.now();

      const stored: StoredSession = {
        sessionId,
        deviceId: dto.deviceId,
        createdAt: now,
        lastActivityAt: now,
        location: null,
      };

      await this.redis.set(this.sessionKey(sessionId), JSON.stringify(stored), 'EX', ttl);
      await this.redis.set(this.deviceKey(dto.deviceId), sessionId, 'EX', ttl);

      const sessionToken = this.jwtService.sign(
        {
          sub: sessionId,
          email: '',
          role: 'customer',
          type: 'customer',
          deviceId: dto.deviceId,
        } as JwtPayload,
        { expiresIn: `${ttl}s` },
      );

      this.logger.log(`Created customer session ${sessionId} for device ${dto.deviceId} (ttl=${ttl}s)`);

      return {
        sessionToken,
        sessionId,
        deviceId: dto.deviceId,
        expiresAt: now + ttl * 1000,
        ttlSeconds: ttl,
      };
    } catch (err) {
      this.logger.error(`Failed to create customer session for device ${dto.deviceId}:`, err);
      throw err;
    }
  }

  /**
   * Validates a customer session token and refreshes its sliding TTL so the
   * session expires `ttl` after the last activity rather than from creation.
   */
  async validateCustomerSession(sessionToken: string): Promise<ValidateCustomerSessionResponse> {
    try {
      let payload: JwtPayload | null = null;

      try {
        payload = this.jwtService.verify(sessionToken) as JwtPayload;
      } catch (jwtError) {
        this.logger.warn(`JWT verification failed for customer session token, trying fallback lookup: ${jwtError}`);
      }

      let sessionId: string | undefined;
      let deviceId: string | undefined;

      if (payload && payload.type === 'customer' && payload.sub) {
        sessionId = payload.sub;
      } else if (this.isUuid(sessionToken)) {
        sessionId = sessionToken;
      }

      if (!sessionId) {
        this.logger.warn(`Invalid customer session token format: ${sessionToken}`);
        return { valid: false, sessionId: '', deviceId: '' };
      }

      const raw = await this.redis.get(this.sessionKey(sessionId));
      if (!raw) {
        this.logger.warn(`Customer session not found in Redis for sessionId=${sessionId}`);
        return { valid: false, sessionId: '', deviceId: '' };
      }

      const ttl = this.getCustomerSessionTtl();
      const data = JSON.parse(raw) as StoredSession;
      data.lastActivityAt = Date.now();
      await this.redis.set(this.sessionKey(sessionId), JSON.stringify(data), 'EX', ttl);
      await this.redis.set(this.deviceKey(data.deviceId), sessionId, 'EX', ttl);

      return { valid: true, sessionId, deviceId: data.deviceId };
    } catch (err) {
      this.logger.error(`Failed to validate customer session: ${err}`);
      return { valid: false, sessionId: '', deviceId: '' };
    }
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  async getCustomerSession(sessionToken: string): Promise<GetCustomerSessionResponse> {
    try {
      let payload: JwtPayload | null = null;

      try {
        payload = this.jwtService.verify(sessionToken) as JwtPayload;
      } catch (jwtError) {
        this.logger.warn(`JWT verification failed for getCustomerSession, trying fallback lookup: ${jwtError}`);
      }

      let sessionId: string | undefined;

      if (payload && payload.type === 'customer' && payload.sub) {
        sessionId = payload.sub;
      } else if (this.isUuid(sessionToken)) {
        sessionId = sessionToken;
      }

      if (!sessionId) {
        this.logger.warn(`Invalid customer session token format for getCustomerSession: ${sessionToken}`);
        return { found: false };
      }

      const raw = await this.redis.get(this.sessionKey(sessionId));
      if (!raw) {
        this.logger.warn(`Customer session not found in Redis for sessionId=${sessionId}`);
        return { found: false };
      }

      const data = JSON.parse(raw) as StoredSession;
      const ttl = await this.redis.ttl(this.sessionKey(sessionId));

      return {
        found: true,
        sessionId: data.sessionId,
        deviceId: data.deviceId,
        createdAt: data.createdAt,
        lastActivityAt: data.lastActivityAt,
        locationLat: data.location?.lat,
        locationLng: data.location?.lng,
        locationUpdatedAt: data.location?.updatedAt,
        ttlSecondsRemaining: ttl,
      };
    } catch (err) {
      this.logger.error(`Failed to get customer session: ${err}`);
      return { found: false };
    }
  }

  /**
   * Persists the customer's dynamic location (driven by the device id) so the
   * system can retrieve nearby properties. Refreshes the session TTL.
   */
  async updateCustomerLocation(dto: { sessionToken: string; lat: number; lng: number }): Promise<{ success: boolean }> {
    try {
      const validation = await this.validateCustomerSession(dto.sessionToken);
      if (!validation.valid) {
        throw new BadRequestException('Invalid customer session');
      }

      const raw = await this.redis.get(this.sessionKey(validation.sessionId));
      if (!raw) {
        throw new BadRequestException('Customer session not found');
      }

      const data = JSON.parse(raw) as StoredSession;
      data.location = { lat: dto.lat, lng: dto.lng, updatedAt: Date.now() };
      data.lastActivityAt = Date.now();

      const ttl = this.getCustomerSessionTtl();
      await this.redis.set(this.sessionKey(validation.sessionId), JSON.stringify(data), 'EX', ttl);

      return { success: true };
    } catch (err) {
      this.logger.error(`Failed to update customer location for session ${dto.sessionToken}:`, err);
      throw err;
    }
  }

  async revokeCustomerSession(sessionToken: string): Promise<{ success: boolean }> {
    try {
      let sessionId: string | undefined;

      try {
        const payload = this.jwtService.verify(sessionToken) as JwtPayload;
        if (payload.type === 'customer' && payload.sub) {
          sessionId = payload.sub;
        }
      } catch (jwtError) {
        this.logger.warn(`JWT verification failed for revokeCustomerSession, trying fallback lookup: ${jwtError}`);
        if (this.isUuid(sessionToken)) {
          sessionId = sessionToken;
        }
      }

      if (!sessionId) {
        this.logger.warn(`Invalid customer session token format for revokeCustomerSession: ${sessionToken}`);
        return { success: false };
      }

      const raw = await this.redis.get(this.sessionKey(sessionId));
      if (raw) {
        const data = JSON.parse(raw) as StoredSession;
        await this.redis.del(this.deviceKey(data.deviceId));
      }
      await this.redis.del(this.sessionKey(sessionId));

      return { success: true };
    } catch (err) {
      this.logger.error(`Failed to revoke customer session: ${err}`);
      return { success: false };
    }
  }

  async getActiveCustomerSessions(): Promise<{ sessions: Array<{ sessionId: string; deviceId: string; createdAt: number; lastActivityAt: number; locationLat?: number; locationLng?: number; locationUpdatedAt?: number; ttlSecondsRemaining?: number }>; total: number }> {
    try {
      const sessions: Array<{ sessionId: string; deviceId: string; createdAt: number; lastActivityAt: number; locationLat?: number; locationLng?: number; locationUpdatedAt?: number; ttlSecondsRemaining?: number }> = [];
      let cursor = '0';

      do {
        const result = await (this.redis as any).scan(cursor, 'MATCH', 'customer:session:*', 'COUNT', '100');
        cursor = result[0];
        const keys = result[1] as string[];

        for (const key of keys) {
          const raw = await this.redis.get(key);
          if (!raw) continue;

          try {
            const data = JSON.parse(raw) as StoredSession & { ttlSecondsRemaining?: number };
            const sessionId = data.sessionId || key.replace('customer:session:', '');
            
            let ttlSecondsRemaining;
            try {
              ttlSecondsRemaining = await (this.redis as any).ttl(key);
            } catch {
              ttlSecondsRemaining = undefined;
            }

            sessions.push({
              sessionId,
              deviceId: data.deviceId,
              createdAt: data.createdAt,
              lastActivityAt: data.lastActivityAt,
              locationLat: data.location?.lat,
              locationLng: data.location?.lng,
              locationUpdatedAt: data.location?.updatedAt,
              ttlSecondsRemaining,
            });
          } catch {
            // skip unparseable session
          }
        }
      } while (cursor !== '0');

      sessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);

      return { sessions, total: sessions.length };
    } catch (err) {
      this.logger.error('Failed to get active customer sessions:', err);
      throw err;
    }
  }

  private brokerSessionKey(sessionId: string): string {
    return `broker:session:${sessionId}`;
  }

  private brokerSessionsKey(brokerCode: string): string {
    return `broker:sessions:${brokerCode}`;
  }

  async createBrokerSession(dto: { brokerCode: string; deviceId: string; ttlSeconds?: number }): Promise<BrokerSessionResponse> {
    try {
      if (!dto.brokerCode || !dto.deviceId) {
        throw new BadRequestException('brokerCode and deviceId are required');
      }

      const ttl = dto.ttlSeconds && dto.ttlSeconds > 0 ? dto.ttlSeconds : 7 * 24 * 60 * 60;
      const sessionId = randomUUID();
      const now = Date.now();
      const expiresAt = now + ttl * 1000;

      const sessionData = {
        sessionId,
        brokerCode: dto.brokerCode,
        deviceId: dto.deviceId,
        createdAt: now,
        lastActivityAt: now,
      };

      await this.redis.set(this.brokerSessionKey(sessionId), JSON.stringify(sessionData), 'EX', ttl);
      await this.redis.sadd(this.brokerSessionsKey(dto.brokerCode), sessionId);
      await this.redis.expire(this.brokerSessionsKey(dto.brokerCode), ttl);

      const sessionToken = Buffer.from(`${sessionId}:${dto.brokerCode}:${Date.now()}`).toString('base64');

      this.logger.log(`Created broker session ${sessionId} for broker ${dto.brokerCode} on device ${dto.deviceId}`);

      return {
        sessionToken,
        sessionId,
        deviceId: dto.deviceId,
        brokerCode: dto.brokerCode,
        expiresAt,
        ttlSeconds: ttl,
      };
    } catch (err) {
      this.logger.error(`Failed to create broker session for ${dto.brokerCode}:`, err);
      throw err;
    }
  }

  async validateBrokerSession(sessionToken: string): Promise<ValidateBrokerSessionResponse> {
    try {
      const decoded = Buffer.from(sessionToken, 'base64').toString('utf-8');
      const [sessionId, brokerCode] = decoded.split(':');

      if (!sessionId || !brokerCode) {
        return { valid: false, sessionId: '', deviceId: '', brokerCode: '' };
      }

      const raw = await this.redis.get(this.brokerSessionKey(sessionId));
      if (!raw) {
        return { valid: false, sessionId: '', deviceId: '', brokerCode: '' };
      }

      const data = JSON.parse(raw);
      const ttl = 7 * 24 * 60 * 60;
      data.lastActivityAt = Date.now();
      await this.redis.set(this.brokerSessionKey(sessionId), JSON.stringify(data), 'EX', ttl);

      return { valid: true, sessionId: data.sessionId, deviceId: data.deviceId, brokerCode: data.brokerCode };
    } catch {
      return { valid: false, sessionId: '', deviceId: '', brokerCode: '' };
    }
  }

  async getBrokerSession(sessionToken: string): Promise<GetBrokerSessionResponse> {
    try {
      const decoded = Buffer.from(sessionToken, 'base64').toString('utf-8');
      const [sessionId, brokerCode] = decoded.split(':');

      if (!sessionId || !brokerCode) {
        return { found: false };
      }

      const raw = await this.redis.get(this.brokerSessionKey(sessionId));
      if (!raw) {
        return { found: false };
      }

      const data = JSON.parse(raw);
      const ttl = await this.redis.ttl(this.brokerSessionKey(sessionId));

      return {
        found: true,
        sessionId: data.sessionId,
        deviceId: data.deviceId,
        brokerCode: data.brokerCode,
        createdAt: data.createdAt,
        lastActivityAt: data.lastActivityAt,
        ttlSecondsRemaining: ttl,
      };
    } catch {
      return { found: false };
    }
  }

  async revokeBrokerSession(sessionToken: string): Promise<{ success: boolean }> {
    try {
      const decoded = Buffer.from(sessionToken, 'base64').toString('utf-8');
      const [sessionId, brokerCode] = decoded.split(':');

      if (!sessionId || !brokerCode) {
        return { success: false };
      }

      await this.redis.del(this.brokerSessionKey(sessionId));
      await this.redis.srem(this.brokerSessionsKey(brokerCode), sessionId);

      return { success: true };
    } catch {
      return { success: false };
    }
  }

  private hashPassword(password: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(password).digest('hex');
  }
}
