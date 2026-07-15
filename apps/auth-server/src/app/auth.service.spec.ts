import { JwtService } from '@nestjs/jwt';
import { of } from 'rxjs';
import { AuthService, DEFAULT_CUSTOMER_SESSION_TTL_SECONDS } from './auth.service';

class FakeRedis {
  store = new Map<string, string>();
  setCalls = 0;

  async set(key: string, value: string) {
    this.store.set(key, value);
    this.setCalls++;
    return 'OK';
  }
  async get(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  async del(key: string) {
    this.store.delete(key);
    return 1;
  }
  async ttl() {
    return 100;
  }
}

describe('AuthService - customer sessions', () => {
  let service: AuthService;
  let redis: FakeRedis;
  let jwt: JwtService;
  const adminClient = { send: jest.fn(() => of({})) } as any;
  const brokerClient = { send: jest.fn(() => of({})) } as any;

  beforeEach(() => {
    redis = new FakeRedis();
    jwt = new JwtService({ secret: 'test-secret' });
    service = new AuthService(adminClient, brokerClient, jwt);
    (service as any).redis = redis;
  });

  describe('createCustomerSession', () => {
    it('throws when deviceId is missing', async () => {
      await expect(service.createCustomerSession({ deviceId: '' })).rejects.toThrow();
    });

    it('creates a server-generated session bound to the device with a TTL', async () => {
      const res = await service.createCustomerSession({ deviceId: 'dev-1' });

      expect(res.sessionId).toBeDefined();
      expect(res.deviceId).toBe('dev-1');
      expect(res.ttlSeconds).toBe(DEFAULT_CUSTOMER_SESSION_TTL_SECONDS);
      expect(res.expiresAt).toBeGreaterThan(Date.now());

      const raw = redis.store.get(`customer:session:${res.sessionId}`);
      expect(raw).toBeDefined();
      const stored = JSON.parse(raw!);
      expect(stored.deviceId).toBe('dev-1');
      expect(stored.location).toBeNull();
      expect(redis.store.get('customer:device:dev-1')).toBe(res.sessionId);

      const payload: any = jwt.verify(res.sessionToken);
      expect(payload.type).toBe('customer');
      expect(payload.sub).toBe(res.sessionId);
    });

    it('honours an explicit ttl override', async () => {
      const res = await service.createCustomerSession({ deviceId: 'dev-2', ttlSeconds: 3600 });
      expect(res.ttlSeconds).toBe(3600);
    });
  });

  describe('validateCustomerSession', () => {
    it('is valid when token and redis session exist and slides the TTL', async () => {
      const created = await service.createCustomerSession({ deviceId: 'dev-3' });
      const before = redis.setCalls;
      const validation = await service.validateCustomerSession(created.sessionToken);
      expect(validation.valid).toBe(true);
      expect(validation.sessionId).toBe(created.sessionId);
      expect(validation.deviceId).toBe('dev-3');
      expect(redis.setCalls).toBeGreaterThan(before);
    });

    it('is invalid when the redis session is missing (expired/revoked)', async () => {
      const created = await service.createCustomerSession({ deviceId: 'dev-4' });
      redis.store.delete(`customer:session:${created.sessionId}`);
      const validation = await service.validateCustomerSession(created.sessionToken);
      expect(validation.valid).toBe(false);
    });

    it('is invalid for a non-customer token', async () => {
      const adminToken = jwt.sign({ sub: 'a1', email: 'a@b.c', role: 'admin', type: 'admin' });
      const validation = await service.validateCustomerSession(adminToken);
      expect(validation.valid).toBe(false);
    });

    it('is invalid for a garbage token', async () => {
      const validation = await service.validateCustomerSession('not-a-token');
      expect(validation.valid).toBe(false);
    });
  });

  describe('getCustomerSession', () => {
    it('returns found=false for an unknown session', async () => {
      const token = jwt.sign({ sub: 'nope', email: '', role: 'customer', type: 'customer' });
      const res = await service.getCustomerSession(token);
      expect(res.found).toBe(false);
    });

    it('returns session details including ttl remaining', async () => {
      const created = await service.createCustomerSession({ deviceId: 'dev-5' });
      const res = await service.getCustomerSession(created.sessionToken);
      expect(res.found).toBe(true);
      expect(res.sessionId).toBe(created.sessionId);
      expect(res.deviceId).toBe('dev-5');
      expect(res.ttlSecondsRemaining).toBe(100);
    });
  });

  describe('updateCustomerLocation', () => {
    it('throws for an invalid session', async () => {
      await expect(service.updateCustomerLocation({ sessionToken: 'bad', lat: 0, lng: 0 })).rejects.toThrow();
    });

    it('persists the dynamic location', async () => {
      const created = await service.createCustomerSession({ deviceId: 'dev-6' });
      await service.updateCustomerLocation({ sessionToken: created.sessionToken, lat: 0.5, lng: 1.5 });
      const stored = JSON.parse(redis.store.get(`customer:session:${created.sessionId}`)!);
      expect(stored.location).toEqual({ lat: 0.5, lng: 1.5, updatedAt: expect.any(Number) });
    });
  });

  describe('revokeCustomerSession', () => {
    it('deletes the session and invalidates the token', async () => {
      const created = await service.createCustomerSession({ deviceId: 'dev-7' });
      const revoked = await service.revokeCustomerSession(created.sessionToken);
      expect(revoked.success).toBe(true);
      expect(redis.store.has(`customer:session:${created.sessionId}`)).toBe(false);
      expect(redis.store.has('customer:device:dev-7')).toBe(false);
      const validation = await service.validateCustomerSession(created.sessionToken);
      expect(validation.valid).toBe(false);
    });
  });
});
