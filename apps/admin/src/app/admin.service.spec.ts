import { of } from 'rxjs';
import Redis from 'ioredis';
import { AdminService } from './admin.service';

jest.mock('ioredis');
const MockRedis = Redis as unknown as jest.Mock;

function repoMock() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => x),
    count: jest.fn().mockResolvedValue(0),
  } as any;
}

function clientMock() {
  return { send: jest.fn(() => of({})) } as any;
}

describe('AdminService - getNotifications', () => {
  let service: AdminService;
  let redisClient: any;
  let subscriber: any;

  beforeEach(async () => {
    subscriber = { subscribe: jest.fn(), on: jest.fn(), quit: jest.fn() };
    MockRedis.mockImplementation(() => subscriber);
    const repos = [repoMock(), repoMock(), repoMock(), repoMock(), repoMock()];
    redisClient = { emit: jest.fn(() => of(undefined)) };
    const clients = [clientMock(), clientMock(), clientMock()];
    service = new AdminService(...repos, redisClient, ...clients);
    await service.onModuleInit();
  });

  it('requests notifications over redis and resolves the response', async () => {
    const promise = service.getNotifications({ page: 1, limit: 20, status: 'sent' });

    expect(redisClient.emit).toHaveBeenCalledWith(
      'get_notifications',
      expect.objectContaining({ page: 1, limit: 20, status: 'sent', responseChannel: 'notifications_report' }),
    );

    const requestId = (redisClient.emit.mock.calls[0][1] as any).requestId;
    const handler = (subscriber.on.mock.calls.find((c: any[]) => c[0] === 'message') as any[])[1];
    await handler(
      'notifications_report',
      JSON.stringify({ requestId, notifications: [{ id: 'n1' }], total: 1, page: 1, limit: 20 }),
    );

    const res = await promise;
    expect(res.total).toBe(1);
    expect(res.notifications[0].id).toBe('n1');
  });

  it('rejects when the notification service does not respond in time', async () => {
    jest.useFakeTimers();
    const promise = service.getNotifications({ page: 1, limit: 20 });
    jest.advanceTimersByTime(6000);
    await expect(promise).rejects.toThrow(/Timeout/);
    jest.useRealTimers();
  });
});
