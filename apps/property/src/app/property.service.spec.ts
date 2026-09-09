import { of } from 'rxjs';
import { PropertyService } from './property.service';

function repoMock() {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getRawMany: jest.fn().mockResolvedValue([]),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
  };

  return {
    find: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => x),
    createQueryBuilder: jest.fn(() => qb),
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
  let httpService: any;
  let redis: any;

  beforeEach(() => {
    propertyRepo = repoMock();
    searchRepo = repoMock();
    accessRepo = repoMock();
    authClient = { send: jest.fn(() => of(validSession)) };
    brokerClient = { send: jest.fn(() => of({ brokerCode: 'B1', phoneNumber: '0700000000', username: 'Broker' })) };
    httpService = { post: jest.fn(() => of({ data: { status: 'Success', amount: 5000 } })) };
    redis = { subscribe: jest.fn(), publish: jest.fn(), on: jest.fn(), quit: jest.fn() };
    service = new PropertyService(propertyRepo, searchRepo, accessRepo, authClient, brokerClient, httpService);
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
    it('returns paginated properties via query builder', async () => {
      const qb = propertyRepo.createQueryBuilder('property');
      (qb as any).getManyAndCount.mockResolvedValue([[{ id: 'p1' }], 1]);
      const res = await service.getProperties({ page: 2, limit: 5 });
      expect(qb.where).toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith('property.createdAt', 'DESC');
      expect(qb.skip).toHaveBeenCalledWith(5);
      expect(qb.take).toHaveBeenCalledWith(5);
      expect(res.total).toBe(1);
    });
  });

  describe('getCustomerProperties', () => {
    it('returns paginated nearby properties', async () => {
      const qb = propertyRepo.createQueryBuilder('property');
      (qb as any).getManyAndCount.mockResolvedValue([[{ id: 'p1', postgis_spatial_field: { lat: 1, lng: 1 } }], 1]);
      const res = await service.getCustomerProperties({ sessionToken: 'tok', page: 1, limit: 10, lat: 1, lng: 1 });
      expect(res.properties[0].id).toBe('p1');
      expect(res.total).toBe(1);
    });

    it('rejects an invalid session', async () => {
      authClient.send.mockReturnValue(of({ valid: false, sessionId: '', deviceId: '' }));
      await expect(service.getCustomerProperties({ sessionToken: 't', page: 1, limit: 10 })).rejects.toThrow('Invalid customer session');
    });
  });

  describe('initiatePropertyAccessPayment', () => {
    it('creates access payment and returns reference', async () => {
      brokerClient.send.mockReturnValue(of({ brokerCode: 'B1' }));
      (accessRepo.findOne as any).mockResolvedValue(null);
      (accessRepo.create as any).mockReturnValue({});
      (accessRepo.save as any).mockResolvedValue({});
      const res = await service.initiatePropertyAccessPayment({
        sessionToken: 'tok',
        brokerCode: 'B1',
        amount: 5000,
      });
      expect(res.referenceNumber).toBeDefined();
      expect(accessRepo.save).toHaveBeenCalled();
    });
  });

  describe('getBrokerPropertiesForCustomer', () => {
    it('returns broker properties after payment access', async () => {
      (accessRepo.findOne as any).mockResolvedValue({ paymentStatus: 'SUCCESS' });
      propertyRepo.findAndCount.mockResolvedValue([[{ id: 'p1' }], 1]);
      const res = await service.getBrokerPropertiesForCustomer({ sessionToken: 'tok', brokerCode: 'B1', page: 1, limit: 10 });
      expect(res.properties[0].id).toBe('p1');
    });

    it('throws when access payment is missing', async () => {
      (accessRepo.findOne as any).mockResolvedValue(null);
      await expect(service.getBrokerPropertiesForCustomer({ sessionToken: 'tok', brokerCode: 'B1', page: 1, limit: 10 })).rejects.toThrow('Payment required');
    });
  });

  describe('createCustomerBooking', () => {
    it('creates booking with reason and status', async () => {
      (accessRepo.findOne as any).mockResolvedValue({ paymentStatus: 'SUCCESS' });
      propertyRepo.findOne.mockResolvedValue({ id: 'p1', brokersUniqueCode: 'B1', allowedViewers: [], title: 'Villa' });
      (propertyRepo.save as any).mockResolvedValue({});
      const res = await service.createCustomerBooking({
        sessionToken: 'tok',
        propertyId: 'p1',
        customerName: 'John',
        customerPhone: '0700000000',
        date: '2024-01-01',
        amount: 100,
        reason: 'viewing',
        status: 'confirmed',
      });
      expect(res.success).toBe(true);
      expect(res.bookingId).toBeDefined();
    });
  });

  describe('getCustomerBookings', () => {
    it('returns bookings for customer session', async () => {
      propertyRepo.findAndCount.mockResolvedValue([[{
        id: 'p1',
        title: 'Villa',
        location: 'KLA',
        createdAt: new Date('2024-01-01'),
        allowedViewers: [{ customerPhone: '0700000000', transactionCode: 'TX1', amount: 100, date: '2024-01-01', customerName: 'John' }],
      }], 1]);
      const res = await service.getCustomerBookings({ sessionToken: 'tok', page: 1, limit: 10 });
      expect(res.bookings.length).toBeGreaterThan(0);
      expect(res.bookings[0].transactionCode).toBe('TX1');
    });
  });

  describe('getBookingByCode', () => {
    it('finds booking by transaction code', async () => {
      propertyRepo.findAndCount.mockResolvedValue([[{
        id: 'p1',
        title: 'Villa',
        location: 'KLA',
        createdAt: new Date('2024-01-01'),
        allowedViewers: [{ customerPhone: '0700000000', transactionCode: 'TX1', amount: 100, date: '2024-01-01', customerName: 'John' }],
      }], 1]);
      const res = await service.getBookingByCode({ transactionCode: 'TX1' });
      expect(res.booking).toBeDefined();
      expect(res.booking?.transactionCode).toBe('TX1');
    });

    it('returns null when code not found', async () => {
      propertyRepo.findAndCount.mockResolvedValue([[{
        id: 'p1',
        allowedViewers: [],
      }], 1]);
      const res = await service.getBookingByCode({ transactionCode: 'MISSING' });
      expect(res.booking).toBeNull();
    });
  });

  describe('getBookingsByPhone', () => {
    it('returns bookings filtered by phone', async () => {
      propertyRepo.findAndCount.mockResolvedValue([[{
        id: 'p1',
        title: 'Villa',
        location: 'KLA',
        createdAt: new Date('2024-01-01'),
        allowedViewers: [
          { customerPhone: '0700000000', transactionCode: 'TX1', amount: 100, date: '2024-01-01', customerName: 'John' },
          { customerPhone: 'other', transactionCode: 'TX2', amount: 200, date: '2024-01-01', customerName: 'Jane' },
        ],
      }], 1]);
      const res = await service.getBookingsByPhone({ customerPhone: '0700000000', page: 1, limit: 10 });
      expect(res.bookings.length).toBe(1);
      expect(res.bookings[0].customerPhone).toBe('0700000000');
    });
  });
});
