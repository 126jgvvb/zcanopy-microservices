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
  let adminMessageRepo: any;
  let redisClient: any;
  let subscriber: any;

  beforeEach(async () => {
    subscriber = { subscribe: jest.fn(), on: jest.fn(), quit: jest.fn() };
    MockRedis.mockImplementation(() => subscriber);
    const adminRepo = repoMock();
    adminMessageRepo = repoMock();
    const invitationRepo = repoMock();
    const logRepo = repoMock();
    const dashboardRepo = repoMock();
    redisClient = { emit: jest.fn(() => of(undefined)) };
    const clients = [clientMock(), clientMock(), clientMock(), clientMock(), clientMock()];
    service = new AdminService(
      adminRepo,
      dashboardRepo,
      invitationRepo,
      logRepo,
      adminMessageRepo,
      redisClient,
      ...clients,
    );
    await service.onModuleInit();
  });

  it('queries notifications with filters and pagination', async () => {
    adminMessageRepo.findAndCount.mockResolvedValue([
      [{ id: 'n1', status: 'sent', type: 'otp', channel: 'email' }],
      1,
    ]);

    const res = await service.getNotifications({ page: 1, limit: 20, status: 'sent' });

    expect(adminMessageRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'sent' },
        order: { sentAt: 'DESC' },
        skip: 0,
        take: 20,
      }),
    );
    expect(res).toEqual({
      notifications: [{ id: 'n1', status: 'sent', type: 'otp', channel: 'email' }],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('applies default pagination when page/limit are missing', async () => {
    adminMessageRepo.findAndCount.mockResolvedValue([[], 0]);

    const res = await service.getNotifications({});

    expect(adminMessageRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        skip: 0,
        take: 20,
      }),
    );
    expect(res).toEqual({ notifications: [], total: 0, page: 1, limit: 20 });
  });
});
