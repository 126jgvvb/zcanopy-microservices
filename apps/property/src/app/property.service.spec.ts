import { of } from 'rxjs';
import { PropertyService } from './property.service';

function repoMock() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => x),
  } as any;
}

const validSession = { valid: true, sessionId: 'sid-123', deviceId: 'dev' };

describe('PropertyService - customer session searches', () => {
  let service: PropertyService;
  let propertyRepo: any;
  let searchRepo: any;
  let accessRepo: any;
  let authClient: any;
  let brokerClient: any;
  let redis: any;

  beforeEach(() => {
    propertyRepo = repoMock();
    searchRepo = repoMock();
    accessRepo = repoMock();
    authClient = { send: jest.fn(() => of(validSession)) };
    brokerClient = { send: jest.fn(() => of({ brokerCode: 'B1', phoneNumber: '0700000000', username: 'Broker' })) };
    redis = { subscribe: jest.fn(), publish: jest.fn(), on: jest.fn(), quit: jest.fn() };
    service = new PropertyService(propertyRepo, searchRepo, accessRepo, authClient, brokerClient, {} as any);
    (service as any).redis = redis;
  });

  describe('recordSearch', () => {
    it('rejects an invalid session', async () => {
      authClient.send.mockReturnValue(of({ valid: false, sessionId: '', deviceId: '' }));
      await expect(
        service.recordSearch({ sessionToken: 't', query: 'x', location: 'l', radius: 5 }),
      ).rejects.toThrow('Invalid customer session');
    });

    it('stores the search keyed by sessionId', async () => {
      await service.recordSearch({
        sessionToken: 'tok',
        query: 'kampala',
        location: 'KLA',
        radius: 10,
        propertyType: 'RESIDENTIAL',
      });
      expect(searchRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'sid-123', sessionToken: 'tok', query: 'kampala' }),
      );
      expect(searchRepo.save).toHaveBeenCalled();
    });
  });

  describe('getRecentSearches', () => {
    it('rejects an invalid session', async () => {
      authClient.send.mockReturnValue(of({ valid: false, sessionId: '', deviceId: '' }));
      await expect(service.getRecentSearches({ sessionToken: 't' })).rejects.toThrow('Invalid customer session');
    });

    it('queries by sessionId and maps results', async () => {
      searchRepo.find.mockResolvedValue([
        { id: '1', query: 'q', location: 'l', radius: 1, propertyType: 'p', createdAt: new Date() },
      ]);
      const res = await service.getRecentSearches({ sessionToken: 'tok', limit: 5 });
      expect(searchRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sessionId: 'sid-123' }, take: 5 }),
      );
      expect(res.searches[0].query).toBe('q');
    });
  });

  describe('trackNearbyProperties', () => {
    it('rejects an invalid session', async () => {
      authClient.send.mockReturnValue(of({ valid: false, sessionId: '', deviceId: '' }));
      await expect(
        service.trackNearbyProperties({ sessionToken: 't', lat: 0, lng: 0, radiusKm: 5 }),
      ).rejects.toThrow('Invalid customer session');
    });

    it('persists the dynamic location and returns the channel', async () => {
      const res = await service.trackNearbyProperties({ sessionToken: 'tok', lat: 0.1, lng: 0.2, radiusKm: 5 });
      expect(res.success).toBe(true);
      expect(res.channel).toBe('nearby_property_updates');
      expect(authClient.send).toHaveBeenCalledWith('UpdateCustomerLocation', {
        sessionToken: 'tok',
        lat: 0.1,
        lng: 0.2,
      });
    });
  });

  describe('getProperties', () => {
    it('returns paginated properties', async () => {
      propertyRepo.findAndCount.mockResolvedValue([[{ id: 'p1' }], 1]);
      const res = await service.getProperties({ page: 2, limit: 5 });
      expect(propertyRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5, order: { createdAt: 'DESC' } }),
      );
      expect(res.total).toBe(1);
    });
  });
});
