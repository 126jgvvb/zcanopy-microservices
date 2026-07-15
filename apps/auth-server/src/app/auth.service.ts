import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ClientProxy } from '@nestjs/microservices';
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

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private redis!: Redis;

  constructor(
    @Inject('ADMIN_CLIENT') private readonly adminClient: ClientProxy,
    @Inject('BROKER_CLIENT') private readonly brokerClient: ClientProxy,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  async validateAdmin(email: string, password: string): Promise<any> {
    const admin = await lastValueFrom(
      this.adminClient.send('ValidateAdmin', { email, password }),
    );
    return admin;
  }

  async validateBroker(email: string, password: string): Promise<any> {
    const broker = await lastValueFrom(
      this.brokerClient.send('ValidateBroker', { email, password }),
    );
    return broker;
  }

  async login(dto: { email: string; password: string; type: 'admin' | 'broker' }): Promise<LoginResponse> {
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
  }

  async loginBroker(dto: { brokerCode: string; password?: string; deviceId?: string; googleId?: string }): Promise<any> {
    const broker = await lastValueFrom(
      this.brokerClient.send('LoginBroker', {
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
  }

  async refreshToken(token: string): Promise<LoginResponse> {
    try {
      const payload = this.jwtService.verify(token);

      let user: any;
      let role: string;

      if (payload.type === 'admin') {
        user = await lastValueFrom(
          this.adminClient.send('GetAdminById', { id: payload.sub }),
        );
        role = user?.role || 'admin';
      } else {
        user = await lastValueFrom(
          this.brokerClient.send('GetBrokerById', { id: payload.sub }),
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
  }

  /**
   * Validates a customer session token and refreshes its sliding TTL so the
   * session expires `ttl` after the last activity rather than from creation.
   */
  async validateCustomerSession(sessionToken: string): Promise<ValidateCustomerSessionResponse> {
    try {
      const payload = this.jwtService.verify(sessionToken) as JwtPayload;
      if (payload.type !== 'customer' || !payload.sub) {
        return { valid: false, sessionId: '', deviceId: '' };
      }

      const sessionId = payload.sub;
      const raw = await this.redis.get(this.sessionKey(sessionId));
      if (!raw) {
        return { valid: false, sessionId: '', deviceId: '' };
      }

      const ttl = this.getCustomerSessionTtl();
      const data = JSON.parse(raw) as StoredSession;
      data.lastActivityAt = Date.now();
      await this.redis.set(this.sessionKey(sessionId), JSON.stringify(data), 'EX', ttl);
      await this.redis.set(this.deviceKey(data.deviceId), sessionId, 'EX', ttl);

      return { valid: true, sessionId, deviceId: data.deviceId };
    } catch {
      return { valid: false, sessionId: '', deviceId: '' };
    }
  }

  async getCustomerSession(sessionToken: string): Promise<GetCustomerSessionResponse> {
    try {
      const payload = this.jwtService.verify(sessionToken) as JwtPayload;
      if (payload.type !== 'customer' || !payload.sub) {
        return { found: false };
      }

      const sessionId = payload.sub;
      const raw = await this.redis.get(this.sessionKey(sessionId));
      if (!raw) {
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
    } catch {
      return { found: false };
    }
  }

  /**
   * Persists the customer's dynamic location (driven by the device id) so the
   * system can retrieve nearby properties. Refreshes the session TTL.
   */
  async updateCustomerLocation(dto: { sessionToken: string; lat: number; lng: number }): Promise<{ success: boolean }> {
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
  }

  async revokeCustomerSession(sessionToken: string): Promise<{ success: boolean }> {
    try {
      const payload = this.jwtService.verify(sessionToken) as JwtPayload;
      if (payload.type !== 'customer' || !payload.sub) {
        return { success: false };
      }

      const raw = await this.redis.get(this.sessionKey(payload.sub));
      if (raw) {
        const data = JSON.parse(raw) as StoredSession;
        await this.redis.del(this.deviceKey(data.deviceId));
      }
      await this.redis.del(this.sessionKey(payload.sub));

      return { success: true };
    } catch {
      return { success: false };
    }
  }

  private brokerSessionKey(sessionId: string): string {
    return `broker:session:${sessionId}`;
  }

  private brokerSessionsKey(brokerCode: string): string {
    return `broker:sessions:${brokerCode}`;
  }

  async createBrokerSession(dto: { brokerCode: string; deviceId: string; ttlSeconds?: number }): Promise<BrokerSessionResponse> {
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
    await this.redis.sAdd(this.brokerSessionsKey(dto.brokerCode), sessionId);
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
      await this.redis.sRem(this.brokerSessionsKey(brokerCode), sessionId);

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
