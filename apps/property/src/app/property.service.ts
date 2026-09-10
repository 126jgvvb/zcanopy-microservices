import { Injectable, Logger, BadRequestException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository, In } from '@nestjs/typeorm';
import { Repository, FindOptionsSelect } from 'typeorm';
import Redis from 'ioredis';
import { Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, firstValueFrom, timeout } from 'rxjs';
import { PropertyEntity, AllowedViewer, GeoSpatialField } from './entity/property.entity';
import { CustomerSearchEntity } from './entity/customer-search.entity';
import { CustomerPropertyAccessEntity } from './entity/customer-property-access.entity';
import { CustomerFavoriteEntity } from './entity/customer-favorite.entity';
import { CustomerCommentEntity } from './entity/customer-comment.entity';
import { CustomerRatingEntity } from './entity/customer-rating.entity';

export interface CreatePropertyDto {
  brokersUniqueCode: string;
  title?: string;
  description?: string;
  propertyType?: string;
  imageUrl?: string[];
  videoUrl: string[];
  location: string;
  subCounty?: string;
  district?: string;
  allowedViewers?: any[];
  maxProperties?: number;
  maxPhotosPerProperty?: number;
  maxVideosPerProperty?: number;
  maxVideoSizeMB?: number;
  lat?: number;
  lng?: number;
  coordinates?: { lat: number; lng: number };
  price?: number;
  brokerBookingFee?: number;
}

export interface AddAllowedViewerDto {
  brokerCode: string;
  customerPhone: string;
  customerName: string;
  transactionCode: string;
  amount: number;
  transactionId: string;
  date: string;
}

export interface RecordSearchDto {
  sessionToken: string;
  query: string;
  location: string;
  radius: number;
  propertyType?: string;
}

export interface BookingState {
  isBooked: boolean;
  bookingCount: number;
  latestBookingDate?: string;
}

export interface FindNearbyDto {
  lat: number;
  lng: number;
  radiusKm: number;
  propertyType?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class PropertyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PropertyService.name);
  private redis!: Redis;
  private redisSubscriber!: Redis;
  private nearbySubscribers: Map<string, { sessionToken: string; radius: number; lat: number; lng: number }[]> = new Map();

  constructor(
    @InjectRepository(PropertyEntity)
    private readonly propertyRepo: Repository<PropertyEntity>,
    @InjectRepository(CustomerSearchEntity)
    private readonly searchRepo: Repository<CustomerSearchEntity>,
    @InjectRepository(CustomerPropertyAccessEntity)
    private readonly accessRepo: Repository<CustomerPropertyAccessEntity>,
    @InjectRepository(CustomerFavoriteEntity)
    private readonly favoriteRepo: Repository<CustomerFavoriteEntity>,
    @InjectRepository(CustomerCommentEntity)
    private readonly commentRepo: Repository<CustomerCommentEntity>,
    @InjectRepository(CustomerRatingEntity)
    private readonly ratingRepo: Repository<CustomerRatingEntity>,
    @Inject('AUTH_CLIENT') private readonly authClient: ClientGrpc,
    @Inject('BROKER_CLIENT') private readonly brokerClient: ClientGrpc,
    @Inject('PAYMENT_CLIENT') private readonly paymentClient: ClientGrpc,
    private readonly httpService: HttpService,
  ) {}

  async onModuleInit() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB) || 0,
      connectTimeout: 10000,
      retryStrategy: (times) => Math.min(times * 500, 5000),
      maxRetriesPerRequest: 10,
      reconnectOnFailedAttempt: true,
      keepAlive: 60,
    });

    this.redisSubscriber = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB) || 0,
      connectTimeout: 10000,
      retryStrategy: (times) => Math.min(times * 500, 5000),
      maxRetriesPerRequest: 10,
      reconnectOnFailedAttempt: true,
      keepAlive: 60,
    });

    this.redisSubscriber.subscribe('new_property_nearby', (err) => {
      if (err) {
        this.logger.error('Failed to subscribe to new_property_nearby', err);
      }
    });

    this.redisSubscriber.on('message', (channel, message) => {
      if (channel === 'new_property_nearby') {
        const raw = JSON.parse(message);
        const data = raw.data || raw;
        this.handleNearbyPropertyUpdate(data);
      }
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
    if (this.redisSubscriber) {
      await this.redisSubscriber.quit();
    }
  }

  private async handleNearbyPropertyUpdate(data: { propertyId: string; lat: number; lng: number; title: string; propertyType: string }) {
    try {
      const channelName = 'nearby_property_updates';
      const matchedTokens: string[] = [];

      for (const [propertyType, subscribers] of this.nearbySubscribers) {
        if (data.propertyType && propertyType && data.propertyType !== propertyType) {
          continue;
        }
        for (const sub of subscribers) {
          const distance = this.haversineDistance(sub.lat, sub.lng, data.lat, data.lng);
          if (distance <= sub.radius) {
            matchedTokens.push(sub.sessionToken);
          }
        }
      }

      if (matchedTokens.length > 0) {
        await this.redis.publish(channelName, JSON.stringify({
          propertyId: data.propertyId,
          title: data.title,
          lat: data.lat,
          lng: data.lng,
          matchedSessions: matchedTokens,
        }));
      }
    } catch (err) {
      this.logger.error(`Failed to handle nearby property update for ${data.propertyId}:`, err);
    }
  }

  private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async createProperty(dto: CreatePropertyDto): Promise<PropertyEntity> {
    try {
      if (
        !dto.location ||
        !dto.videoUrl ||
        dto.videoUrl.length === 0 ||
        !dto.coordinates ||
        dto.coordinates.lat == null ||
        dto.coordinates.lng == null
      ) {
        throw new BadRequestException(
          'location, lat, lng and videoUrl are required to create a property',
        );
      }

      if(dto.price==0 || dto.price==undefined){
        this.logger.log('Recieved 0 for price..aborting');
        throw new BadRequestException(
          'Invalid price identified',
        );
      }

      if (dto.maxProperties != null) {
        const existingCount = await this.propertyRepo.count({
          where: { brokersUniqueCode: dto.brokersUniqueCode },
        });
        if (existingCount >= dto.maxProperties) {
          throw new BadRequestException(
            `Broker has reached the maximum number of properties (${dto.maxProperties}) for the current subscription tier`,
          );
        }
      }

      const geoField: GeoSpatialField | null = dto.coordinates
        ? { lat: dto.coordinates.lat, lng: dto.coordinates.lng }
        : null;

      const property = this.propertyRepo.create({
        brokersUniqueCode: dto.brokersUniqueCode,
        title: dto.title ?? 'Default Property',
        description: dto.description ?? 'Auto-created property for verified broker',
        propertyType: dto.propertyType ?? 'RESIDENTIAL',
        imageUrl: dto.imageUrl ?? [],
        videoUrl: dto.videoUrl ?? [],
        location: dto.location ?? 'Unknown',
        subCounty: dto.subCounty ?? null,
        district: dto.district ?? null,
        allowedViewers: dto.allowedViewers ?? [],
        photoCount: dto.imageUrl?.length ?? 0,
        videoCount: dto.videoUrl?.length ?? 0,
        isAvailable: true,
        createdAt: new Date(),
        postgis_spatial_field: geoField,
        price: dto.price ?? 0,
        brokerBookingFee: dto.brokerBookingFee ?? 0,
      });

      const saved = await this.propertyRepo.save(property);
      this.logger.log(`Created property ${saved.id} for broker code ${dto.brokersUniqueCode}`);

      if (geoField) {
        await this.redis.publish('new_property_nearby', JSON.stringify({
          propertyId: saved.id,
          lat: geoField.lat,
          lng: geoField.lng,
          title: saved.title,
          propertyType: saved.propertyType,
        }));
      }

      this.redis.publish('broker_property_created', JSON.stringify({
        brokerCode: saved.brokersUniqueCode,
        propertyId: saved.id,
        title: saved.title,
        location: saved.location,
        price: saved.price,
        brokerBookingFee: saved.brokerBookingFee,
        imageUrl: saved.imageUrl?.[0] || null,
        lat: saved.postgis_spatial_field?.lat || null,
        lng: saved.postgis_spatial_field?.lng || null,
        createdAt: saved.createdAt?.toISOString?.() || new Date().toISOString(),
        timestamp: new Date().toISOString(),
      }));

      return saved;
    } catch (err) {
      this.logger.error(`Failed to create property for broker ${dto.brokersUniqueCode}:`, err);
      throw err;
    }
  }

  async addAllowedViewer(dto: AddAllowedViewerDto): Promise<PropertyEntity> {
    try {
      const property = await this.propertyRepo.findOne({
        where: { brokersUniqueCode: dto.brokerCode },
      });

      if (!property) {
        throw new BadRequestException(`Property with broker code ${dto.brokerCode} not found`);
      }

      const viewer = {
        customerPhone: dto.customerPhone,
        customerName: dto.customerName,
        transactionCode: dto.transactionCode,
        amount: dto.amount,
        transactionId: dto.transactionId,
        date: dto.date,
      };

      property.allowedViewers = [...(property.allowedViewers ?? []), viewer];
      const saved = await this.propertyRepo.save(property);
      this.logger.log(`Added allowed viewer to property ${saved.id} for broker code ${dto.brokerCode}`);

      this.redis.publish('broker_booking_created', JSON.stringify({
        brokerCode: dto.brokerCode,
        propertyId: saved.id,
        propertyTitle: saved.title,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        amount: dto.amount,
        transactionCode: dto.transactionCode,
        timestamp: new Date().toISOString(),
      }));

      return saved;
    } catch (err) {
      this.logger.error(`Failed to add allowed viewer for broker ${dto.brokerCode}:`, err);
      throw err;
    }
  }

  async declineBooking(dto: { transactionCode: string }): Promise<{ success: boolean; message: string }> {
    try {
      const properties = await this.propertyRepo.find({
        where: {},
      });

      for (const property of properties) {
        const viewers = property.allowedViewers ?? [];
        const filtered = viewers.filter((v: any) => v.transactionCode !== dto.transactionCode);

        if (filtered.length !== viewers.length) {
          property.allowedViewers = filtered;
          await this.propertyRepo.save(property);
          this.logger.log(`Declined booking with transactionCode=${dto.transactionCode} from property ${property.id}`);
          return { success: true, message: 'Booking declined successfully' };
        }
      }

      return { success: false, message: 'Booking not found' };
    } catch (err) {
      this.logger.error(`Failed to decline booking ${dto.transactionCode}:`, err);
      throw err;
    }
  }

  async getProperties(query: { page: number; limit: number; brokerCode?: string; location?: string; subCounty?: string; district?: string; sortBy?: string; sortOrder?: string; minAmount?: number; maxAmount?: number; fromDate?: string; toDate?: string; id?: string }): Promise<{ properties: Array<{ id: string; title: string; description: string; propertyType: string; location: string; brokersUniqueCode: string; isAvailable: boolean; createdAt: Date; updatedAt?: Date; photoCount: number; videoCount: number; postgisSpatialField: string | null; imageUrl: string[]; videoUrl: string[]; price: number; brokerBookingFee: number; bookingState: BookingState | null }>; total: number }> {
    try {
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 10;
      const where: any = query.brokerCode ? { brokersUniqueCode: query.brokerCode } : {};

      const qb = this.propertyRepo.createQueryBuilder('property').where(where);

      if (query.id) {
        qb.andWhere('property.id = :id', { id: query.id });
      }

      if (query.location) {
        qb.andWhere('property.location ILIKE :location', { location: `%${query.location}%` });
      }

      if (query.subCounty) {
        qb.andWhere('property.subCounty ILIKE :subCounty', { subCounty: `%${query.subCounty}%` });
      }

      if (query.district) {
        qb.andWhere('property.district ILIKE :district', { district: `%${query.district}%` });
      }

      if (query.fromDate) {
        qb.andWhere('property.createdAt >= :fromDate', { fromDate: query.fromDate });
      }

      if (query.toDate) {
        qb.andWhere('property.createdAt <= :toDate', { toDate: query.toDate });
      }

      if (query.minAmount != null || query.maxAmount != null) {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM jsonb_array_elements(property.allowedViewers) AS viewer
            WHERE (viewer->>'amount')::numeric BETWEEN :minAmount AND :maxAmount
          )`,
          {
            minAmount: query.minAmount ?? 0,
            maxAmount: query.maxAmount ?? Number.MAX_SAFE_INTEGER,
          },
        );
      }

      const sortBy = query.sortBy || 'createdAt';
      const sortOrder = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';
      qb.orderBy(`property.${sortBy}`, sortOrder);
      qb.skip((page - 1) * limit);
      qb.take(limit);

      const [properties, total] = await qb.getManyAndCount();

      return {
        properties: properties.map(p => ({
          id: p.id,
          title: p.title,
          description: p.description,
          propertyType: p.propertyType,
          location: p.location,
          brokersUniqueCode: p.brokersUniqueCode,
          isAvailable: p.isAvailable,
          subCounty: p.subCounty ?? null,
          district: p.district ?? null,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          photoCount: p.photoCount,
          videoCount: p.videoCount,
          postgisSpatialField: p.postgis_spatial_field ? JSON.stringify(p.postgis_spatial_field) : null,
          imageUrl: p.imageUrl,
          videoUrl: p.videoUrl,
          price: p.price,
          brokerBookingFee: p.brokerBookingFee,
          bookingState: this.computeBookingState(p),
        })),
        total,
      };
    } catch (err) {
      this.logger.error('Failed to get properties:', err);
      throw err;
    }
  }

  async updateProperty(id: string, dto: Partial<CreatePropertyDto>): Promise<PropertyEntity> {
    try {
      const property = await this.propertyRepo.findOne({ where: { id } });
      if (!property) {
        throw new BadRequestException(`Property with id ${id} not found`);
      }

      const updateData: any = { updatedAt: new Date() };
      if (dto.title != null) updateData.title = dto.title;
      if (dto.description != null) updateData.description = dto.description;
      if (dto.location != null) updateData.location = dto.location;
      if (dto.subCounty != null) updateData.subCounty = dto.subCounty;
      if (dto.district != null) updateData.district = dto.district;
      if (dto.propertyType != null) updateData.propertyType = dto.propertyType;
      if (dto.imageUrl != null) {
        updateData.imageUrl = dto.imageUrl;
        updateData.photoCount = dto.imageUrl.length;
      }
      if (dto.videoUrl != null) {
        updateData.videoUrl = dto.videoUrl;
        updateData.videoCount = dto.videoUrl.length;
      }
      if (dto.lat != null || dto.lng != null) {
        const geoField: GeoSpatialField | null = dto.lat != null && dto.lng != null
          ? { lat: dto.lat, lng: dto.lng }
          : null;
        updateData.postgis_spatial_field = geoField;
      }
      if (dto.price != null) updateData.price = dto.price;
      if (dto.brokerBookingFee != null) updateData.brokerBookingFee = dto.brokerBookingFee;

      await this.propertyRepo.update(id, updateData);
      const updated = await this.propertyRepo.findOne({ where: { id } });
      if (!updated) {
        throw new BadRequestException(`Property with id ${id} not found after update`);
      }
      this.logger.log(`Updated property ${id}`);

      this.redis.publish('broker_property_updated', JSON.stringify({
        brokerCode: property.brokersUniqueCode,
        propertyId: updated.id,
        title: updated.title,
        location: updated.location,
        price: updated.price,
        brokerBookingFee: updated.brokerBookingFee,
        imageUrl: updated.imageUrl?.[0] || null,
        lat: updated.postgis_spatial_field?.lat || null,
        lng: updated.postgis_spatial_field?.lng || null,
        updatedAt: updated.updatedAt?.toISOString?.() || new Date().toISOString(),
        timestamp: new Date().toISOString(),
      }));

      return updated;
    } catch (err) {
      this.logger.error(`Failed to update property ${id}:`, err);
      throw err;
    }
  }

  async deleteProperty(id: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        throw new BadRequestException('Property id is required');
      }

      const trimmed = id.trim();

      if (trimmed.toUpperCase().startsWith('BROKER')) {
        return this.deletePropertiesByBrokerCode(trimmed);
      }

      const property = await this.propertyRepo.findOne({ where: { id: trimmed } });
      if (!property) {
        throw new BadRequestException(`Property with id ${trimmed} not found`);
      }

      await this.propertyRepo.delete(trimmed);
      this.logger.log(`Deleted property ${trimmed}`);

      this.redis.publish('broker_property_deleted', JSON.stringify({
        brokerCode: property.brokersUniqueCode,
        propertyId: property.id,
        title: property.title,
        timestamp: new Date().toISOString(),
      }));

      return { success: true, message: `Property ${trimmed} deleted successfully` };
    } catch (err) {
      this.logger.error(`Failed to delete property ${id}:`, err);
      throw err;
    }
  }

  async deletePropertiesByBrokerCode(brokerCode: string): Promise<{ success: boolean; message: string; deletedCount: number }> {
    try {
      if (!brokerCode || typeof brokerCode !== 'string' || brokerCode.trim().length === 0) {
        throw new BadRequestException('brokerCode is required');
      }

      const properties = await this.propertyRepo.find({ where: { brokersUniqueCode: brokerCode } });
      if (properties.length === 0) {
        return { success: true, message: `No properties found for broker code ${brokerCode}`, deletedCount: 0 };
      }

      const ids = properties.map(p => p.id);
      await this.propertyRepo.delete(ids);

      for (const property of properties) {
        this.redis.publish('broker_property_deleted', JSON.stringify({
          brokerCode: property.brokersUniqueCode,
          propertyId: property.id,
          title: property.title,
          timestamp: new Date().toISOString(),
        }));
      }

      this.logger.log(`Deleted ${properties.length} properties for broker code ${brokerCode}`);
      return { success: true, message: `Deleted ${properties.length} properties for broker code ${brokerCode}`, deletedCount: properties.length };
    } catch (err) {
      this.logger.error(`Failed to delete properties for broker ${brokerCode}:`, err);
      throw err;
    }
  }

  /**
   * Reverse-geocode coordinates using the Google Maps Geocoding API and
   * derive a human-readable location name plus the sub-county and district.
   */
  async resolveLocationName(dto: { lat: number; lng: number }): Promise<{
    locationName: string;
    subCounty: string | null;
    district: string | null;
    formattedAddress: string | null;
  }> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY is not set; cannot resolve location');
      return { locationName: '', subCounty: null, district: null, formattedAddress: null };
    }

    if (typeof dto.lat !== 'number' || typeof dto.lng !== 'number' || Number.isNaN(dto.lat) || Number.isNaN(dto.lng)) {
      this.logger.error(`Invalid coordinates for location resolution: lat=${dto.lat}, lng=${dto.lng}`);
      return { locationName: '', subCounty: null, district: null, formattedAddress: null };
    }

    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${dto.lat},${dto.lng}&key=${apiKey}`;

    try {
      const response = await lastValueFrom(this.httpService.get(url));
      const data: any = response?.data ?? {};
      const status: string | undefined = data.status;
      const results: any[] = data.results ?? [];

      if (status !== 'OK') {
        this.logger.error(
          `Google reverse-geocode failed: status=${status} message=${data.error_message ?? 'none'} for lat=${dto.lat},lng=${dto.lng}`,
        );
        return { locationName: '', subCounty: null, district: null, formattedAddress: null };
      }

      if (results.length === 0) {
        this.logger.warn(`Google reverse-geocode returned no results for lat=${dto.lat},lng=${dto.lng}`);
        return { locationName: '', subCounty: null, district: null, formattedAddress: null };
      }

      const top = results[0];
      const formattedAddress: string = top.formatted_address ?? '';
      let subCounty: string | null = null;
      let district: string | null = null;
      let locationName = '';

      for (const component of top.address_components ?? []) {
        const types: string[] = component.types ?? [];
        if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
          subCounty = component.long_name;
        }
        if (types.includes('administrative_area_level_1')) {
          district = component.long_name;
        }
      }

      locationName = subCounty ?? district ?? formattedAddress.split(',')[0] ?? '';

      return { locationName, subCounty, district, formattedAddress };
    } catch (error) {
      this.logger.error(`Failed to resolve location for ${dto.lat},${dto.lng}: ${error}`);
      return { locationName: '', subCounty: null, district: null, formattedAddress: null };
    }
  }

  private computeBookingState(property: PropertyEntity): BookingState | null {
    const viewers = property.allowedViewers || [];
    const isBooked = viewers.length > 0;
    const latestBooking = viewers.reduce<AllowedViewer | null>((latest, viewer) => {
      if (!viewer || !viewer.date) return latest;
      if (!latest || new Date(viewer.date) > new Date(latest.date)) return viewer;
      return latest;
    }, null);

    return {
      isBooked,
      bookingCount: viewers.length,
      latestBookingDate: latestBooking?.date,
    };
  }

  private serializeProperty(p: PropertyEntity, geo: GeoSpatialField | null) {
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      propertyType: p.propertyType,
      location: p.location,
      brokersUniqueCode: p.brokersUniqueCode,
      subCounty: p.subCounty ?? null,
      district: p.district ?? null,
      isAvailable: p.isAvailable,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      photoCount: p.photoCount,
      videoCount: p.videoCount,
      postgisSpatialField: geo ? JSON.stringify(geo) : null,
      imageUrl: p.imageUrl ?? [],
      videoUrl: p.videoUrl ?? [],
      price: p.price,
      brokerBookingFee: p.brokerBookingFee,
      bookingState: this.computeBookingState(p),
    };
  }

  async getPropertyLocations(): Promise<{ locations: Array<{ propertyId: string; title: string; location: string; postgisSpatialField: string | null; brokerCode: string }> }> {
    try {
      const properties = await this.propertyRepo.find({
        select: { id: true, title: true, location: true, postgis_spatial_field: true, brokersUniqueCode: true } as FindOptionsSelect<PropertyEntity>,
      });

      return {
        locations: properties.map(p => ({
          propertyId: p.id,
          title: p.title,
          location: p.location,
          postgisSpatialField: p.postgis_spatial_field ? JSON.stringify(p.postgis_spatial_field) : null,
          brokerCode: p.brokersUniqueCode,
        })),
      };
    } catch (err) {
      this.logger.error('Failed to get property locations:', err);
      throw err;
    }
  }

  async getBrokerBookings(brokerCode: string): Promise<{ bookings: Array<{ id: string; propertyId: string; propertyTitle: string; customerName: string; customerPhone: string; customerEmail: string; date: Date | string; status: string; amount: number; transactionCode: string }> }> {
    try {
      const properties = await this.propertyRepo.find({
        where: { brokersUniqueCode: brokerCode },
      });

      const bookings: Array<{ id: string; propertyId: string; propertyTitle: string; customerName: string; customerPhone: string; customerEmail: string; date: Date | string; status: string; amount: number; transactionCode: string }> = [];
      for (const property of properties) {
        const viewers = property.allowedViewers || [];
        for (const viewer of viewers) {
          if (viewer && viewer.customerPhone) {
            bookings.push({
              id: viewer.transactionId || `${property.id}-${viewer.customerPhone}`,
              propertyId: property.id,
              propertyTitle: property.title,
              customerName: viewer.customerName || 'Unknown',
              customerPhone: viewer.customerPhone,
              customerEmail: viewer.customerEmail || '',
              date: viewer.date || property.createdAt.toISOString(),
              status: 'booked',
              amount: viewer.amount || 0,
              transactionCode: viewer.transactionCode || '',
            });
          }
        }
      }

      return { bookings };
    } catch (err) {
      this.logger.error(`Failed to get broker bookings for ${brokerCode}:`, err);
      throw err;
    }
  }

  async getRecentSearches(dto: { sessionToken: string; limit?: number }): Promise<{ searches: Array<{ id: string; query: string; location: string; radius: number; propertyType: string; createdAt: Date }> }> {
    try {
      const validation = await this.validateCustomerSession(dto.sessionToken);
      if (!validation.valid) {
        throw new BadRequestException('Invalid customer session');
      }

      const limit = Number(dto.limit) || 10;
      const searches = await this.searchRepo.find({
        where: { sessionId: validation.sessionId },
        order: { createdAt: 'DESC' },
        take: limit,
      });

      return {
        searches: searches.map(s => ({
          id: s.id,
          query: s.query,
          location: s.location,
          radius: s.radius,
          propertyType: s.propertyType,
          createdAt: s.createdAt,
        })),
      };
    } catch (err) {
      this.logger.error(`Failed to get recent searches for session ${dto.sessionToken}:`, err);
      throw err;
    }
  }

  async findNearbyProperties(dto: FindNearbyDto): Promise<{ properties: Array<{ id: string; title: string; description: string; propertyType: string; location: string; brokersUniqueCode: string; isAvailable: boolean; createdAt: Date; photoCount: number; videoCount: number; postgisSpatialField: string | null; imageUrl: string[]; videoUrl: string[]; distanceKm: number | null }>; total: number }> {
    try {
      const page = Number(dto.page) || 1;
      const limit = Number(dto.limit) || 10;
      const radiusKm = dto.radiusKm || 10;
      const earthRadius = 6371;

      const query = this.propertyRepo
        .createQueryBuilder('property')
        .where('property.isAvailable = :isAvailable', { isAvailable: true });

      if (dto.propertyType) {
        query.andWhere('property.propertyType = :propertyType', { propertyType: dto.propertyType });
      }

      query.andWhere(
        `(${earthRadius} * acos(cos(radians(:lat)) * cos(radians((property.postgis_spatial_field->>'lat')::numeric)) * cos(radians((property.postgis_spatial_field->>'lng')::numeric) - radians(:lng)) + sin(radians(:lat)) * sin(radians((property.postgis_spatial_field->>'lat')::numeric)))) <= :radius`,
        { lat: dto.lat, lng: dto.lng, radius: radiusKm }
      );

      query.orderBy('property.createdAt', 'DESC');
      query.skip((page - 1) * limit);
      query.take(limit);

      const [properties, total] = await query.getManyAndCount();

      const brokerCodes = [...new Set(properties.map(p => p.brokersUniqueCode))];
      const brokerPropertyCounts: Record<string, number> = {};
      if (brokerCodes.length > 0) {
        const counts = await this.propertyRepo.createQueryBuilder('property')
          .select('property.brokersUniqueCode', 'brokerCode')
          .addSelect('COUNT(*)', 'count')
          .where('property.brokersUniqueCode IN (:...codes)', { codes: brokerCodes })
          .groupBy('property.brokersUniqueCode')
          .getRawMany();
        for (const row of counts) {
          brokerPropertyCounts[row.brokerCode] = Number(row.count);
        }
      }

      return {
        properties: properties.map(p => {
          const geo = p.postgis_spatial_field;
          const distance = geo ? this.haversineDistance(dto.lat, dto.lng, geo.lat, geo.lng) : null;
          return {
            id: p.id,
            title: p.title,
            description: p.description,
            propertyType: p.propertyType,
            location: p.location,
            brokersUniqueCode: p.brokersUniqueCode,
            isAvailable: p.isAvailable,
            createdAt: p.createdAt,
            photoCount: p.photoCount,
            videoCount: p.videoCount,
            postgisSpatialField: geo ? JSON.stringify(geo) : null,
            imageUrl: p.imageUrl,
            videoUrl: p.videoUrl,
            distanceKm: distance ? Math.round(distance * 100) / 100 : null,
            bookingState: this.computeBookingState(p),
            totalBrokerProperties: brokerPropertyCounts[p.brokersUniqueCode] || 0,
          };
        }),
        total,
      };
    } catch (err) {
      this.logger.error(`Failed to find nearby properties for lat=${dto.lat}, lng=${dto.lng}:`, err);
      throw err;
    }
  }

  async trackNearbyProperties(dto: { sessionToken: string; lat: number; lng: number; radiusKm: number; propertyType?: string }): Promise<{ success: boolean; channel: string }> {
    try {
      const validation = await this.validateCustomerSession(dto.sessionToken);
      if (!validation.valid) {
        throw new BadRequestException('Invalid customer session');
      }

      await lastValueFrom(
        this.authClient.getService('AuthService').UpdateCustomerLocation({
          sessionToken: dto.sessionToken,
          lat: dto.lat,
          lng: dto.lng,
        }),
      ).catch((err) => {
        this.logger.warn(`Failed to persist customer location: ${err}`);
      });

      const channelName = 'nearby_property_updates';

      const existingSubscribers = this.nearbySubscribers.get(dto.propertyType || '') || [];
      const filtered = existingSubscribers.filter(s => s.sessionToken !== dto.sessionToken);
      filtered.push({
        sessionToken: dto.sessionToken,
        radius: dto.radiusKm,
        lat: dto.lat,
        lng: dto.lng,
      });
      this.nearbySubscribers.set(dto.propertyType || '', filtered);

      await this.redisSubscriber.subscribe(channelName);

      return {
        success: true,
        channel: channelName,
      };
    } catch (err) {
      this.logger.error(`Failed to track nearby properties for session ${dto.sessionToken}:`, err);
      throw err;
    }
  }

  async getCustomerProperties(dto: { sessionToken: string; page: number; limit: number; lat?: number; lng?: number; radiusKm?: number; propertyType?: string }): Promise<{ properties: Array<{ id: string; title: string; description: string; propertyType: string; location: string; brokersUniqueCode: string; isAvailable: boolean; createdAt: Date; photoCount: number; videoCount: number; postgisSpatialField: string | null; imageUrl: string[]; videoUrl: string[]; distanceKm: number | null; bookingState: any; totalBrokerProperties: number }>; total: number }> {
    try {
      console.log('sessionToken', dto.sessionToken);

      const validation = await this.validateCustomerSession(dto.sessionToken);
      if (!validation.valid) {
        throw new BadRequestException('Invalid customer session');
      }

      const page = Number(dto.page) || 1;
      const limit = Number(dto.limit) || 10;

      let query = this.propertyRepo.createQueryBuilder('property').where('property.isAvailable = :isAvailable', { isAvailable: true });

      if (dto.propertyType) {
        query = query.andWhere('property.propertyType = :propertyType', { propertyType: dto.propertyType });
      }

      if (dto.lat != null && dto.lng != null) {
        const radiusKm = dto.radiusKm || 10;
        const earthRadius = 6371;
        query = query.andWhere(
          `(${earthRadius} * acos(cos(radians(:lat)) * cos(radians((property.postgis_spatial_field->>'lat')::numeric)) * cos(radians((property.postgis_spatial_field->>'lng')::numeric) - radians(:lng)) + sin(radians(:lat)) * sin(radians((property.postgis_spatial_field->>'lat')::numeric)))) <= :radius`,
          { lat: dto.lat, lng: dto.lng, radius: radiusKm }
        );
        query = query.orderBy('property.createdAt', 'DESC');
      } else {
        query = query.orderBy('property.createdAt', 'DESC');
      }

      query = query.skip((page - 1) * limit).take(limit);

      const [properties, total] = await query.getManyAndCount();

      const brokerCodes = [...new Set(properties.map(p => p.brokersUniqueCode))];
      const brokerPropertyCounts: Record<string, number> = {};
      if (brokerCodes.length > 0) {
        const counts = await this.propertyRepo.createQueryBuilder('property')
          .select('property.brokersUniqueCode', 'brokerCode')
          .addSelect('COUNT(*)', 'count')
          .where('property.brokersUniqueCode IN (:...codes)', { codes: brokerCodes })
          .groupBy('property.brokersUniqueCode')
          .getRawMany();
        for (const row of counts) {
          brokerPropertyCounts[row.brokerCode] = Number(row.count);
        }
      }

      return {
        properties: properties.map(p => {
          const geo = p.postgis_spatial_field;
          const distance = geo && dto.lat != null && dto.lng != null ? this.haversineDistance(dto.lat, dto.lng, geo.lat, geo.lng) : null;
          return {
            ...this.serializeProperty(p, geo),
            distanceKm: distance ? Math.round(distance * 100) / 100 : null,
            totalBrokerProperties: brokerPropertyCounts[p.brokersUniqueCode] || 0,
          };
        }),
        total,
      };
    } catch (err) {
      this.logger.error(`Failed to get customer properties for session ${dto.sessionToken}:`, err);
      throw err;
    }
  }

   async initiatePropertyAccessPayment(dto: { sessionToken: string; brokerCode: string; propertyId?: string; amount: number; customerEmail?: string; customerPhone?: string; customerName?: string; careerExamples?: string }): Promise<{ success: boolean; message: string; referenceNumber?: string; transactionId?: string }> {
    this.logger.log(`[access-payment] START brokerCode=${dto.brokerCode} amount=${dto.amount} propertyId=${dto.propertyId ?? 'none'} sessionToken=${dto.sessionToken.substring(0, 8)}...`);
    const validation = await this.validateCustomerSession(dto.sessionToken);
    this.logger.log(`[access-payment] session validation result valid=${validation.valid} sessionId=${validation.sessionId} deviceId=${validation.deviceId}`);
    if (!validation.valid) {
      throw new BadRequestException('Invalid customer session');
    }

    this.logger.log(`[access-payment] checking existing access for sessionToken=${dto.sessionToken.substring(0, 8)}... brokerCode=${dto.brokerCode}`);
    const existingAccess = await this.accessRepo.findOne({
      where: { sessionToken: dto.sessionToken, brokerCode: dto.brokerCode, paymentStatus: 'SUCCESS' },
    });
    this.logger.log(`[access-payment] existingAccess check done found=${!!existingAccess}`);

    if (existingAccess) {
      this.logger.log(`[access-payment] access already granted, returning early`);
      return {
        success: true,
        message: 'Access already granted',
        transactionId: existingAccess.transactionId,
        referenceNumber: existingAccess.transactionCode,
      };
    }

    this.logger.log(`[access-payment] calling GetBrokerByCode brokerCode=${dto.brokerCode}`);
    const broker = await firstValueFrom(
      this.brokerClient.getService('BrokerService').GetBrokerByCode({ brokerCode: dto.brokerCode }).pipe(
        timeout(5000),
      ),
    );
    this.logger.log(`[access-payment] GetBrokerByCode raw response=${JSON.stringify(broker)}`);
    const brokerData = broker?.broker || broker;
    this.logger.log(`[access-payment] GetBrokerByCode result found=${!!brokerData?.brokerCode} brokerCode=${brokerData?.brokerCode}`);
    if (!brokerData || !brokerData.brokerCode) {
      throw new BadRequestException('Broker not found');
    }

    const referenceNumber = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    this.logger.log(`[access-payment] calling processPropertyPayment via gRPC brokerCode=${dto.brokerCode} amount=${dto.amount}`);

    try {
      const paymentResult = await firstValueFrom(
        this.paymentClient.getService('PaymentService').processPropertyPayment({
          customerPhone: dto.customerPhone || 'anonymous',
          customerEmail: dto.customerEmail || '',
          customerName: dto.customerName || 'Customer',
          amount: dto.amount,
          reasonForPayment: 'booking',
          propertyId: dto.propertyId || '',
          brokerCode: dto.brokerCode,
        }).pipe(
          timeout(120000),
        ),
      );
      this.logger.log(`[access-payment] processPropertyPayment result success=${paymentResult.success} transactionCode=${paymentResult.transactionCode}`);

      const isSuccess = paymentResult.success;
      this.logger.log(`[access-payment] payment outcome isSuccess=${isSuccess}`);

      this.logger.log(`[access-payment] saving access record paymentStatus=${isSuccess ? 'SUCCESS' : 'PENDING'}`);
      const access = this.accessRepo.create({
        sessionToken: dto.sessionToken,
        brokerCode: dto.brokerCode,
        propertyId: dto.propertyId,
        paymentStatus: isSuccess ? 'SUCCESS' : 'PENDING',
        amount: dto.amount,
        transactionCode: paymentResult.transactionCode || referenceNumber,
        transactionId: paymentResult.transactionId || paymentResult.referenceNumber,
        customerEmail: dto.customerEmail,
        customerPhone: dto.customerPhone,
        customerName: dto.customerName,
        careerExamples: dto.careerExamples,
      });

      await this.accessRepo.save(access);
      this.logger.log(`[access-payment] access record saved successfully`);

      if (isSuccess) {
        this.logger.log(`[access-payment] publishing invoice notification event`);
        this.redis.publish('send_property_payment_invoice', JSON.stringify({
          customerPhone: dto.customerPhone,
          customerEmail: dto.customerEmail,
          customerName: dto.customerName,
          amount: dto.amount,
          recipientPhone: dto.customerPhone,
          recipientName: dto.customerName || 'Customer',
          transactionCode: paymentResult.transactionCode || referenceNumber,
          date: new Date().toISOString(),
          brokerCode: dto.brokerCode,
          referenceNumber: paymentResult.referenceNumber,
          transactionId: paymentResult.transactionId,
        }));
      }

      this.logger.log(`[access-payment] returning success=${isSuccess}`);
      return {
        success: isSuccess,
        message: isSuccess ? 'Payment processed successfully' : 'Payment is being processed',
        referenceNumber: paymentResult.referenceNumber || referenceNumber,
        transactionId: paymentResult.transactionId,
      };
    } catch (error) {
      this.logger.error(`[access-payment] FAILED error=${(error as Error).message} stack=${(error as Error).stack}`);
      this.logger.log(`[access-payment] saving failed access record`);
      const failedAccess = this.accessRepo.create({
        sessionToken: dto.sessionToken,
        brokerCode: dto.brokerCode,
        propertyId: dto.propertyId,
        paymentStatus: 'FAILED',
        amount: dto.amount,
        transactionCode: referenceNumber,
        transactionId: referenceNumber,
        customerEmail: dto.customerEmail,
        customerPhone: dto.customerPhone,
        customerName: dto.customerName,
        careerExamples: dto.careerExamples,
      });

      await this.accessRepo.save(failedAccess);
      this.logger.log(`[access-payment] failed access record saved`);

      return {
        success: false,
        message: `Payment processing failed: ${(error as Error).message}`,
        referenceNumber,
        transactionId: referenceNumber,
      };
    }
  }

  async getBrokerPropertiesForCustomer(dto: { sessionToken: string; brokerCode: string; page: number; limit: number }): Promise<{ properties: Array<{ id: string; title: string; description: string; propertyType: string; location: string; brokersUniqueCode: string; isAvailable: boolean; createdAt: Date; photoCount: number; videoCount: number; postgisSpatialField: string | null; imageUrl: string[]; videoUrl: string[]; price: number; brokerBookingFee: number; amount: number; bookingState: any }>; total: number }> {
    try {
      const validation = await this.validateCustomerSession(dto.sessionToken);
      if (!validation.valid) {
        throw new BadRequestException('Invalid customer session');
      }

      const page = Number(dto.page) || 1;
      const limit = Number(dto.limit) || 10;

      const [properties, total] = await this.propertyRepo.findAndCount({
        where: { brokersUniqueCode: dto.brokerCode },
        skip: (page - 1) * limit,
        take: limit,
        order: { createdAt: 'DESC' },
      });

      return {
        properties: properties.map(p => ({
          ...this.serializeProperty(p, p.postgis_spatial_field),
          amount: 0,
          bookingState: this.computeBookingState(p),
        })),
        total,
      };
    } catch (err) {
      this.logger.error(`Failed to get broker properties for customer session ${dto.sessionToken}:`, err);
      throw err;
    }
  }

   async createCustomerBooking(dto: { sessionToken: string; propertyId: string; customerName: string; customerPhone: string; customerEmail?: string; date: string; amount: number; reason?: string; status?: string }): Promise<{ success: boolean; message: string; bookingId?: string }> {
     try {
       const validation = await this.validateCustomerSession(dto.sessionToken);
       if (!validation.valid) {
         throw new BadRequestException('Invalid customer session');
       }

       const property = await this.propertyRepo.findOne({ where: { id: dto.propertyId } });
       if (!property) {
         throw new BadRequestException('Property not found');
       }

       if (!property.isAvailable || (property.allowedViewers ?? []).length > 0) {
         throw new BadRequestException('Property is already booked');
       }

       const paymentResult: any = await firstValueFrom(
         this.paymentClient.getService('PaymentService').processPropertyPayment({
           customerPhone: dto.customerPhone,
           customerEmail: dto.customerEmail,
           customerName: dto.customerName,
           amount: dto.amount,
           reasonForPayment: 'booking',
           propertyId: dto.propertyId,
           brokerCode: property.brokersUniqueCode,
         }).pipe(
           timeout(120000),
         ),
       );

       const transactionCode = paymentResult?.transactionCode;
       if (!transactionCode) {
         throw new BadRequestException('Payment did not return a transaction code');
       }

       const viewer = {
         customerPhone: dto.customerPhone,
         customerName: dto.customerName,
         transactionCode,
         amount: dto.amount,
         transactionId: paymentResult?.transactionId || `booking-${Date.now()}`,
         date: dto.date,
         customerEmail: dto.customerEmail,
         reason: dto.reason,
         status: paymentResult?.success ? 'booked' : 'pending_payment',
       };

       property.allowedViewers = [...(property.allowedViewers ?? []), viewer];
       property.isAvailable = false;
       await this.propertyRepo.save(property);

      this.redis.publish('broker_booking_created', JSON.stringify({
        brokerCode: property.brokersUniqueCode,
        propertyId: property.id,
        propertyTitle: property.title,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        amount: dto.amount,
        transactionCode,
        timestamp: new Date().toISOString(),
      }));

      return {
        success: paymentResult?.success || false,
        message: paymentResult?.message || 'Booking created',
        bookingId: transactionCode,
      };
    } catch (err) {
      this.logger.error(`Failed to create booking for property ${dto.propertyId}:`, err);
      throw err;
    }
  }

  async getPropertyDetailsForCustomer(dto: { sessionToken: string; propertyId: string }): Promise<any> {
    try {
      const validation = await this.validateCustomerSession(dto.sessionToken);
      if (!validation.valid) {
        throw new BadRequestException('Invalid customer session');
      }

      const property = await this.propertyRepo.findOne({ where: { id: dto.propertyId } });
      if (!property) {
        throw new BadRequestException('Property not found');
      }

      /*
      const access = await this.accessRepo.findOne({
        where: { sessionToken: dto.sessionToken, brokerCode: property.brokersUniqueCode, paymentStatus: 'SUCCESS' },
      });

      if (!access) {
        throw new BadRequestException('Payment required to view property details');
      }*/

      const broker = await firstValueFrom(
        this.brokerClient.getService('BrokerService').GetBrokerByCode({ brokerCode: property.brokersUniqueCode }).pipe(
          timeout(5000),
        ),
      );

      return {
        id: property.id,
        title: property.title,
        description: property.description,
        propertyType: property.propertyType,
        location: property.location,
        brokersUniqueCode: property.brokersUniqueCode,
        isAvailable: property.isAvailable,
        createdAt: property.createdAt,
        updatedAt: property.updatedAt,
        photoCount: property.photoCount,
        videoCount: property.videoCount,
        postgisSpatialField: property.postgis_spatial_field ? JSON.stringify(property.postgis_spatial_field) : null,
        imageUrl: property.imageUrl,
        videoUrl: property.videoUrl,
        price: property.price,
        brokerBookingFee: property.brokerBookingFee,
        bookingState: this.computeBookingState(property),
        amount: property.allowedViewers?.[0]?.amount || 0,
        brokerPhone: broker?.phoneNumber || '',
        brokerName: broker?.username || '',
        canBook: true,
      };
    } catch (err) {
      this.logger.error(`Failed to get property details for ${dto.propertyId}:`, err);
      throw err;
    }
  }

  async getCustomerBookings(dto: { sessionToken: string; page: number; limit: number }): Promise<{ bookings: Array<{ id: string; propertyId: string; propertyTitle: string; customerName: string; customerPhone: string; customerEmail?: string; date: string; amount: number; transactionCode: string; reason?: string; status?: string; location: string }>; total: number }> {
    try {
      const validation = await this.validateCustomerSession(dto.sessionToken);
      if (!validation.valid) {
        throw new BadRequestException('Invalid customer session');
      }

      const page = Number(dto.page) || 1;
      const limit = Number(dto.limit) || 10;

      const [properties] = await this.propertyRepo.findAndCount({
        where: {},
        skip: (page - 1) * limit,
        take: limit,
      });

      const bookings: Array<{ id: string; propertyId: string; propertyTitle: string; customerName: string; customerPhone: string; customerEmail?: string; date: string; amount: number; transactionCode: string; reason?: string; status?: string; location: string }> = [];

      for (const property of properties) {
        const viewers = property.allowedViewers || [];
        for (const viewer of viewers) {
          if (viewer && viewer.customerPhone) {
            bookings.push({
              id: viewer.transactionId || `${property.id}-${viewer.customerPhone}`,
              propertyId: property.id,
              propertyTitle: property.title,
              customerName: viewer.customerName || 'Unknown',
              customerPhone: viewer.customerPhone,
              customerEmail: viewer.customerEmail,
              date: viewer.date || property.createdAt.toISOString(),
              amount: viewer.amount || 0,
              transactionCode: viewer.transactionCode || '',
              reason: viewer.reason,
              status: viewer.status || 'booked',
              location: property.location,
            });
          }
        }
      }

      return { bookings, total: bookings.length };
    } catch (err) {
      this.logger.error(`Failed to get customer bookings for session ${dto.sessionToken}:`, err);
      throw err;
    }
  }

  async getBookingByCode(dto: { transactionCode: string }): Promise<{ booking: { id: string; propertyId: string; propertyTitle: string; customerName: string; customerPhone: string; customerEmail?: string; date: string; amount: number; transactionCode: string; reason?: string; status?: string; location: string } | null }> {
    try {
      const [properties] = await this.propertyRepo.findAndCount({
        where: {},
        take: 1000,
      });

      for (const property of properties) {
        const viewers = property.allowedViewers || [];
        const viewer = viewers.find(v => v.transactionCode === dto.transactionCode);
        if (viewer) {
          return {
            booking: {
              id: viewer.transactionId || `${property.id}-${viewer.customerPhone}`,
              propertyId: property.id,
              propertyTitle: property.title,
              customerName: viewer.customerName || 'Unknown',
              customerPhone: viewer.customerPhone,
              customerEmail: viewer.customerEmail,
              date: viewer.date || property.createdAt.toISOString(),
              amount: viewer.amount || 0,
              transactionCode: viewer.transactionCode || '',
              reason: viewer.reason,
              status: viewer.status || 'booked',
              location: property.location,
            },
          };
        }
      }

      return { booking: null };
    } catch (err) {
      this.logger.error(`Failed to get booking by code ${dto.transactionCode}:`, err);
      throw err;
    }
  }

  async getBookingsByPhone(dto: { customerPhone: string; page: number; limit: number }): Promise<{ bookings: Array<{ id: string; propertyId: string; propertyTitle: string; customerName: string; customerPhone: string; customerEmail?: string; date: string; amount: number; transactionCode: string; reason?: string; status?: string; location: string }>; total: number }> {
    try {
      const page = Number(dto.page) || 1;
      const limit = Number(dto.limit) || 10;

      const [properties] = await this.propertyRepo.findAndCount({
        where: {},
        skip: (page - 1) * limit,
        take: limit,
      });

      const bookings: Array<{ id: string; propertyId: string; propertyTitle: string; customerName: string; customerPhone: string; customerEmail?: string; date: string; amount: number; transactionCode: string; reason?: string; status?: string; location: string }> = [];

      for (const property of properties) {
        const viewers = property.allowedViewers || [];
        for (const viewer of viewers) {
          if (viewer && viewer.customerPhone === dto.customerPhone) {
            bookings.push({
              id: viewer.transactionId || `${property.id}-${viewer.customerPhone}`,
              propertyId: property.id,
              propertyTitle: property.title,
              customerName: viewer.customerName || 'Unknown',
              customerPhone: viewer.customerPhone,
              customerEmail: viewer.customerEmail,
              date: viewer.date || property.createdAt.toISOString(),
              amount: viewer.amount || 0,
              transactionCode: viewer.transactionCode || '',
              reason: viewer.reason,
              status: viewer.status || 'booked',
              location: property.location,
            });
          }
        }
      }

      return { bookings, total: bookings.length };
    } catch (err) {
      this.logger.error(`Failed to get bookings by phone ${dto.customerPhone}:`, err);
      throw err;
    }
  }

  async SearchPropertiesByBrokerTitle(dto: { query: string; sessionToken?: string; page: number; limit: number; lat?: number; lng?: number; radiusKm?: number }): Promise<{ properties: Array<{ id: string; title: string; description: string; propertyType: string; location: string; brokersUniqueCode: string; isAvailable: boolean; createdAt: Date; photoCount: number; videoCount: number; postgisSpatialField: string | null; imageUrl: string[]; videoUrl: string[]; distanceKm: number | null; bookingState: any; totalBrokerProperties: number }>; total: number }> {
    try {
      const page = Number(dto.page) || 1;
      const limit = Number(dto.limit) || 10;

      // Resolve brokers whose name/title/email/brandName match the query,
      // so properties can also be matched by their broker's brand name.
      const brokers = await lastValueFrom(
        this.brokerClient.getService('BrokerService').SearchBrokers({ query: dto.query }),
      ).catch(() => ({ brokers: [] }));
      const brokerCodes = (brokers.brokers || []).map((b: any) => b.brokerCode).filter(Boolean);

      let query = this.propertyRepo.createQueryBuilder('property')
        .where('property.isAvailable = :isAvailable', { isAvailable: true });

      if (dto.query) {
        query = query.andWhere(
          '(property.title ILIKE :title OR property.brokersUniqueCode IN (:...codes))',
          {
            title: `%${dto.query}%`,
            codes: brokerCodes.length ? brokerCodes : ['__none__'],
          },
        );
      }

      if (dto.lat != null && dto.lng != null) {
        const radiusKm = dto.radiusKm || 10;
        const earthRadius = 6371;
        query = query.andWhere(
          `(${earthRadius} * acos(cos(radians(:lat)) * cos(radians((property.postgis_spatial_field->>'lat')::numeric)) * cos(radians((property.postgis_spatial_field->>'lng')::numeric) - radians(:lng)) + sin(radians(:lat)) * sin(radians((property.postgis_spatial_field->>'lat')::numeric)))) <= :radius`,
          { lat: dto.lat, lng: dto.lng, radius: radiusKm }
        );
      }

      query = query.orderBy('property.createdAt', 'DESC');
      query = query.skip((page - 1) * limit).take(limit);

      const [properties, total] = await query.getManyAndCount();

      const resultBrokerCodes = [...new Set(properties.map((p) => p.brokersUniqueCode))];
      const brokerPropertyCounts: Record<string, number> = {};
      if (resultBrokerCodes.length > 0) {
        const counts = await this.propertyRepo.createQueryBuilder('property')
          .select('property.brokersUniqueCode', 'brokerCode')
          .addSelect('COUNT(*)', 'count')
          .where('property.brokersUniqueCode IN (:...codes)', { codes: resultBrokerCodes })
          .groupBy('property.brokersUniqueCode')
          .getRawMany();
        for (const row of counts) {
          brokerPropertyCounts[row.brokerCode] = Number(row.count);
        }
      }

      return {
        properties: properties.map(p => {
          const geo = p.postgis_spatial_field;
          const distance = geo && dto.lat != null && dto.lng != null
            ? this.haversineDistance(dto.lat, dto.lng, geo.lat, geo.lng)
            : null;
          return {
            ...this.serializeProperty(p, geo),
            distanceKm: distance ? Math.round(distance * 100) / 100 : null,
            totalBrokerProperties: brokerPropertyCounts[p.brokersUniqueCode] || 0,
          };
        }),
        total,
      };
    } catch (err) {
      this.logger.error(`Failed to search properties by broker title for query ${dto.query}:`, err);
      throw err;
    }
  }

  private async validateCustomerSession(sessionToken: string): Promise<{ valid: boolean; sessionId: string; deviceId: string }> {
    try {
      this.logger.log(`[validateCustomerSession] START sessionToken=${sessionToken.substring(0, 8)}...`);
      const result = await firstValueFrom(
        this.authClient.getService('AuthService').ValidateCustomerSession({ sessionToken }).pipe(
          timeout(5000),
        ),
      );
      this.logger.log(`[validateCustomerSession] SUCCESS result=${JSON.stringify(result)}`);
      return { valid: !!result?.valid, sessionId: result?.sessionId || '', deviceId: result?.deviceId || '' };
    } catch (err) {
      this.logger.error(`[validateCustomerSession] FAILED error=${err}`);
      return { valid: false, sessionId: '', deviceId: '' };
    }
  }

  async GetPropertyClients(dto: { propertyId: string }): Promise<{ clients: Array<{ id: string; customerName: string; customerPhone: string; customerEmail?: string; date: string; amount: number; transactionCode: string; status?: string; reason?: string }>; total: number }> {
    try {
      const property = await this.propertyRepo.findOne({ where: { id: dto.propertyId } });
      if (!property) {
        return { clients: [], total: 0 };
      }
      const viewers = property.allowedViewers || [];
      return {
        clients: viewers.map((v, idx) => ({
          id: `${property.id}-${idx}`,
          customerName: v.customerName,
          customerPhone: v.customerPhone,
          customerEmail: v.customerEmail,
          date: v.date,
          amount: v.amount,
          transactionCode: v.transactionCode,
          status: v.status,
          reason: v.reason,
        })),
        total: viewers.length,
      };
    } catch (err) {
      this.logger.error(`Failed to get property clients for ${dto.propertyId}:`, err);
      throw err;
    }
  }

  async getFeaturedProperties(limit = 6): Promise<{ properties: any[]; total: number }> {
    try {
      const properties = await this.propertyRepo.find({
        order: { createdAt: 'DESC' },
        take: limit,
      });

      return {
        properties: properties.map(p => ({
          id: p.id,
          title: p.title,
          description: p.description,
          propertyType: p.propertyType,
          location: p.location,
          brokersUniqueCode: p.brokersUniqueCode,
          isAvailable: p.isAvailable,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          photoCount: p.photoCount,
          videoCount: p.videoCount,
          postgisSpatialField: p.postgis_spatial_field ? JSON.stringify(p.postgis_spatial_field) : null,
          imageUrl: p.imageUrl,
          videoUrl: p.videoUrl,
          price: p.price,
          brokerBookingFee: p.brokerBookingFee,
          bookingState: this.computeBookingState(p),
        })),
        total: properties.length,
      };
    } catch (err) {
      this.logger.error('Failed to get featured properties:', err);
      throw err;
    }
  }

  async recordSearch(dto: { sessionToken: string; query?: string; location?: string; radius?: number; propertyType?: string; filters?: any; resultPropertyIds?: string[]; resultCount?: number; minPrice?: number; maxPrice?: number; subCounty?: string; district?: string }): Promise<{ success: boolean }> {
    try {
      const sessionToken = dto.sessionToken;
      let sessionId = '';

      if (sessionToken) {
        const validation = await this.validateCustomerSession(sessionToken);
        if (validation.valid) {
          sessionId = validation.sessionId;
        }
      }

      const search = this.searchRepo.create({
        sessionId: sessionId || `anon-${Date.now()}`,
        sessionToken: sessionToken || '',
        query: dto.query || '',
        location: dto.location || '',
        radius: Number(dto.radius) || 0,
        propertyType: dto.propertyType || '',
        filtersJson: dto.filters ? JSON.stringify(dto.filters) : '',
        resultPropertyIdsJson: dto.resultPropertyIds ? JSON.stringify(dto.resultPropertyIds) : '',
        resultCount: Number(dto.resultCount) || 0,
        minPrice: Number(dto.minPrice) || 0,
        maxPrice: Number(dto.maxPrice) || 0,
        subCounty: dto.subCounty || '',
        district: dto.district || '',
      });

      await this.searchRepo.save(search);
      return { success: true };
    } catch (err) {
      this.logger.error(`Failed to record search: ${(err as Error).message}`);
      return { success: false };
    }
  }

  async getCustomerSearches(dto: { sessionToken: string; page: number; limit: number }): Promise<{ searches: any[]; total: number }> {
    try {
      const validation = await this.validateCustomerSession(dto.sessionToken);
      if (!validation.valid) {
        throw new BadRequestException('Invalid customer session');
      }

      const page = Number(dto.page) || 1;
      const limit = Number(dto.limit) || 10;

      const [searches, total] = await this.searchRepo.findAndCount({
        where: { sessionId: validation.sessionId },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return {
        searches: searches.map(s => ({
          id: s.id,
          query: s.query,
          location: s.location,
          radius: s.radius,
          propertyType: s.propertyType,
          filters: s.filtersJson ? JSON.parse(s.filtersJson) : null,
          resultCount: s.resultCount,
          resultPropertyIds: s.resultPropertyIdsJson ? JSON.parse(s.resultPropertyIdsJson) : [],
          createdAt: s.createdAt,
        })),
        total,
      };
    } catch (err) {
      this.logger.error(`Failed to get customer searches: ${(err as Error).message}`);
      throw err;
    }
  }

  async toggleFavorite(dto: { sessionToken: string; propertyId: string; propertyTitle: string; propertyLocation?: string; brokerCode?: string; imageUrl?: string; price?: number }): Promise<{ favorited: boolean }> {
    try {
      const validation = await this.validateCustomerSession(dto.sessionToken);
      if (!validation.valid) {
        throw new BadRequestException('Invalid customer session');
      }

      const existing = await this.favoriteRepo.findOne({
        where: { sessionId: validation.sessionId, propertyId: dto.propertyId },
      });

      if (existing) {
        await this.favoriteRepo.remove(existing);
        return { favorited: false };
      }

      const favorite = this.favoriteRepo.create({
        sessionId: validation.sessionId,
        sessionToken: dto.sessionToken,
        propertyId: dto.propertyId,
        propertyTitle: dto.propertyTitle,
        propertyLocation: dto.propertyLocation || '',
        brokerCode: dto.brokerCode || '',
        imageUrl: dto.imageUrl || '',
        price: Number(dto.price) || 0,
      });

      await this.favoriteRepo.save(favorite);
      return { favorited: true };
    } catch (err) {
      this.logger.error(`Failed to toggle favorite: ${(err as Error).message}`);
      throw err;
    }
  }

  async getCustomerFavorites(dto: { sessionToken: string; page: number; limit: number }): Promise<{ favorites: Array<{ id: string; propertyId: string; propertyTitle: string; propertyLocation: string; brokerCode: string; imageUrl: string; price: number; createdAt: Date }>; total: number }> {
    try {
      const validation = await this.validateCustomerSession(dto.sessionToken);
      if (!validation.valid) {
        throw new BadRequestException('Invalid customer session');
      }

      const page = Number(dto.page) || 1;
      const limit = Number(dto.limit) || 10;

      const [favorites, total] = await this.favoriteRepo.findAndCount({
        where: { sessionId: validation.sessionId },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return {
        favorites: favorites.map(f => ({
          id: f.id,
          propertyId: f.propertyId,
          propertyTitle: f.propertyTitle,
          propertyLocation: f.propertyLocation,
          brokerCode: f.brokerCode,
          imageUrl: f.imageUrl,
          price: f.price,
          createdAt: f.createdAt,
        })),
        total,
      };
    } catch (err) {
      this.logger.error(`Failed to get customer favorites: ${(err as Error).message}`);
      throw err;
    }
  }

  async addComment(dto: { sessionToken: string; propertyId: string; customerName: string; customerPhone: string; customerEmail?: string; comment: string; rating?: number }): Promise<{ success: boolean; commentId?: string }> {
    try {
      const validation = await this.validateCustomerSession(dto.sessionToken);
      if (!validation.valid) {
        throw new BadRequestException('Invalid customer session');
      }

      const comment = this.commentRepo.create({
        sessionId: validation.sessionId,
        sessionToken: dto.sessionToken,
        propertyId: dto.propertyId,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        customerEmail: dto.customerEmail || '',
        comment: dto.comment,
        rating: Number(dto.rating) || 0,
      });

      const saved = await this.commentRepo.save(comment);

      const ratings = await this.commentRepo.find({ where: { propertyId: dto.propertyId } });
      const avg = ratings.reduce((sum, r) => sum + (r.rating || 0), 0) / (ratings.length || 1);

      const ratingEntity = await this.ratingRepo.findOne({ where: { propertyId: dto.propertyId } });
      if (ratingEntity) {
        ratingEntity.averageRating = avg;
        ratingEntity.reviewCount = ratings.length;
        ratingEntity.updatedAt = new Date();
        await this.ratingRepo.save(ratingEntity);
      } else {
        const newRating = this.ratingRepo.create({
          propertyId: dto.propertyId,
          averageRating: avg,
          reviewCount: ratings.length,
        });
        await this.ratingRepo.save(newRating);
      }

      return { success: true, commentId: saved.id };
    } catch (err) {
      this.logger.error(`Failed to add comment: ${(err as Error).message}`);
      throw err;
    }
  }

  async getPropertyComments(dto: { propertyId: string; page: number; limit: number }): Promise<{ comments: any[]; total: number; averageRating: number }> {
    try {
      const page = Number(dto.page) || 1;
      const limit = Number(dto.limit) || 10;

      const [comments, total] = await this.commentRepo.findAndCount({
        where: { propertyId: dto.propertyId },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      const rating = await this.ratingRepo.findOne({ where: { propertyId: dto.propertyId } });

      return {
        comments: comments.map(c => ({
          id: c.id,
          customerName: c.customerName,
          customerPhone: c.customerPhone,
          customerEmail: c.customerEmail,
          comment: c.comment,
          rating: c.rating,
          createdAt: c.createdAt,
        })),
        total,
        averageRating: rating?.averageRating || 0,
      };
    } catch (err) {
      this.logger.error(`Failed to get property comments: ${(err as Error).message}`);
      throw err;
    }
  }

  async getAllComments(dto: { page: number; limit: number; propertyId?: string }): Promise<{ comments: any[]; total: number }> {
    try {
      const page = Number(dto.page) || 1;
      const limit = Number(dto.limit) || 10;

      const where = dto.propertyId ? { propertyId: dto.propertyId } : {};

      const [comments, total] = await this.commentRepo.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return {
        comments: comments.map(c => ({
          id: c.id,
          propertyId: c.propertyId,
          customerName: c.customerName,
          customerPhone: c.customerPhone,
          customerEmail: c.customerEmail,
          comment: c.comment,
          rating: c.rating,
          createdAt: c.createdAt,
        })),
        total,
      };
    } catch (err) {
      this.logger.error(`Failed to get all comments: ${(err as Error).message}`);
      throw err;
    }
  }
}
