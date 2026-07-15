import { of } from 'rxjs';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BrokerService } from './broker.service';

function repoMock() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    exists: jest.fn().mockResolvedValue(false),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => x),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function client() {
  return { send: jest.fn(() => of({})) } as any;
}

describe('BrokerService', () => {
  let service: BrokerService;
  let brokerRepo: any;
  let payoutsRepo: any;
  let walletTxRepo: any;
  let clients: any;

  beforeEach(() => {
    brokerRepo = repoMock();
    payoutsRepo = repoMock();
    walletTxRepo = repoMock();
    clients = { redis: client(), property: client(), payment: client(), admin: client() };
    const otpStore = { generateAndStore: jest.fn(), verify: jest.fn(), ttlSeconds: 300 } as any;
    service = new BrokerService(
      brokerRepo,
      payoutsRepo,
      walletTxRepo,
      clients.redis,
      clients.property,
      clients.payment,
      clients.admin,
      otpStore,
    );
  });

  describe('getTierPrice', () => {
    it('maps tiers to prices with a zero default', () => {
      expect(service.getTierPrice('fibrous')).toBe(25000);
      expect(service.getTierPrice('buttress')).toBe(50000);
      expect(service.getTierPrice('prop')).toBe(0);
      expect(service.getTierPrice('unknown')).toBe(0);
    });
  });

  describe('getSubscriptionLimits', () => {
    it('returns per-tier limits and a safe default', () => {
      expect(service.getSubscriptionLimits('fibrous')).toMatchObject({
        maxProperties: 12,
        maxPhotosPerProperty: 25,
        maxVideosPerProperty: 2,
      });
      expect(service.getSubscriptionLimits('buttress')).toMatchObject({ maxProperties: 16 });
      expect(service.getSubscriptionLimits('nope')).toMatchObject({
        maxProperties: 5,
        maxPhotosPerProperty: 15,
        maxVideosPerProperty: 1,
      });
    });
  });

  describe('generateUniqueBrokerCode', () => {
    it('returns an 8-digit code and checks for collisions', async () => {
      const code = await service.generateUniqueBrokerCode();
      expect(code).toMatch(/^\d{8}$/);
      expect(brokerRepo.exists).toHaveBeenCalled();
    });

    it('retries until a unique code is found', async () => {
      brokerRepo.exists.mockResolvedValueOnce(true).mockResolvedValue(false);
      const code = await service.generateUniqueBrokerCode();
      expect(code).toMatch(/^\d{8}$/);
      expect(brokerRepo.exists).toHaveBeenCalledTimes(2);
    });
  });

  describe('creditWallet', () => {
    it('increases the broker wallet balance and persists it', async () => {
      brokerRepo.findOne.mockResolvedValue({ id: 'b1', walletBalance: 1000 });
      const res = await service.creditWallet({ brokerId: 'b1', amount: 500, reason: 'topup', createdBy: 'admin' });
      expect(res.newBalance).toBe(1500);
      expect(brokerRepo.update).toHaveBeenCalledWith('b1', {
        walletBalance: 1500,
        updatedAt: expect.any(Date),
      });
    });

    it('throws when the broker is missing', async () => {
      brokerRepo.findOne.mockResolvedValue(undefined);
      await expect(
        service.creditWallet({ brokerId: 'x', amount: 1, reason: 'r', createdBy: 'a' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('debitWallet', () => {
    it('decreases the balance when funds are sufficient', async () => {
      brokerRepo.findOne.mockResolvedValue({ id: 'b1', walletBalance: 1000 });
      const res = await service.debitWallet({ brokerId: 'b1', amount: 400, reason: 'r', createdBy: 'a' });
      expect(res.newBalance).toBe(600);
    });

    it('throws when funds are insufficient', async () => {
      brokerRepo.findOne.mockResolvedValue({ id: 'b1', walletBalance: 100 });
      await expect(
        service.debitWallet({ brokerId: 'b1', amount: 400, reason: 'r', createdBy: 'a' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GetWallet', () => {
    it('forwards the request to the payment microservice as a broker wallet', async () => {
      clients.payment.send.mockReturnValue(of({ balance: 50, currency: 'UGX' }));
      const res = await service.getWallet({ walletId: 'w1' });
      expect(clients.payment.send).toHaveBeenCalledWith('getWallet', {
        walletType: 'broker',
        walletId: 'w1',
      });
      expect(res).toEqual({ balance: 50, currency: 'UGX' });
    });
  });

  describe('getBrokerById', () => {
    it('returns the broker and throws when missing', async () => {
      brokerRepo.findOne.mockResolvedValue({ id: 'b1' });
      expect(await service.getBrokerById('b1')).toEqual({ id: 'b1' });

      brokerRepo.findOne.mockResolvedValue(undefined);
      await expect(service.getBrokerById('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
