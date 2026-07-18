import { of } from 'rxjs';
import Redis from 'ioredis';
import { NotificationService } from './notification.service';

jest.mock('ioredis');
const MockRedis = Redis as unknown as jest.Mock;

function repoMock() {
  return {
    create: jest.fn((x: any) => ({ ...x, id: 'gen-id' })),
    save: jest.fn(async (x: any) => ({ ...x, id: x.id || 'gen-id' })),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
  } as any;
}

describe('NotificationService', () => {
  let service: NotificationService;
  let repo: any;
  let config: any;
  let redisClient: any;
  let subscriber: any;

  beforeEach(() => {
    repo = repoMock();
    config = { get: jest.fn(() => '') } as any;
    redisClient = { emit: jest.fn(() => of(undefined)) } as any;
    subscriber = { subscribe: jest.fn(), on: jest.fn(), quit: jest.fn() };
    MockRedis.mockImplementation(() => subscriber);
    service = new NotificationService(config, repo, redisClient);
  });

  describe('dispatch + persistence', () => {
    it('records a failed status when the email provider is not configured', async () => {
      await service.sendEmailOtp({ otp: '1234', email: 'a@b.c' });
      const saved = repo.create.mock.calls[0][0];
      expect(saved.status).toBe('failed');
      expect(saved.error).toContain('Render API key not configured');
    });

    it('records a sent status with the provider message id', async () => {
      jest.spyOn(service as any, 'dispatchEmail').mockResolvedValue({ success: true, messageId: 'msg-1' });
      await service.sendEmailOtp({ otp: '1234', email: 'a@b.c' });
      const saved = repo.create.mock.calls[0][0];
      expect(saved.status).toBe('sent');
      expect(saved.providerMessageId).toBe('msg-1');
    });
  });

  describe('getNotifications', () => {
    it('queries with filters and pagination', async () => {
      repo.findAndCount.mockResolvedValue([[{ id: '1' }], 3]);
      const res = await service.getNotifications({ page: 2, limit: 5, status: 'sent', type: 'otp', channel: 'email' });
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'sent', type: 'otp', channel: 'email' },
          skip: 5,
          take: 5,
          order: { createdAt: 'DESC' },
        }),
      );
      expect(res.total).toBe(3);
      expect(res.page).toBe(2);
    });
  });

  describe('redis get_notifications handler', () => {
    it('responds with notifications on the requested channel', async () => {
      repo.findAndCount.mockResolvedValue([[{ id: 'n1' }], 3]);
      await service.onModuleInit();

      const messageHandler = (subscriber.on.mock.calls.find((c: any[]) => c[0] === 'message') as any[])[1];
      const payload = JSON.stringify({
        requestId: 'r1',
        responseChannel: 'notifications_report',
        page: 1,
        limit: 10,
      });

      await messageHandler('get_notifications', payload);

      expect(redisClient.emit).toHaveBeenCalledWith(
        'notifications_report',
        expect.objectContaining({ requestId: 'r1', total: 3 }),
      );
    });
  });
});
