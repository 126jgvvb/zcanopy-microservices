import { Controller, Logger} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PropertyService } from './property.service';
import type { CreatePropertyDto, AddAllowedViewerDto, RecordSearchDto, FindNearbyDto } from './property.service';

interface SearchRequest {
  sessionToken: string;
  query?: string;
  location?: string;
  radius?: number;
  propertyType?: string;
  limit?: number;
}

interface TrackRequest {
  sessionToken: string;
  lat: number;
  lng: number;
  radiusKm: number;
  propertyType?: string;
}

interface UpdatePropertyRequest {
  id: string;
  title?: string;
  description?: string;
  location?: string;
  propertyType?: string;
  imageUrl?: string[];
  videoUrl?: string[];
  lat?: number;
  lng?: number;
}

@Controller()
export class PropertyController {
  private readonly logger = new Logger(PropertyController.name);

  constructor(private readonly propertyService: PropertyService) {}

  @GrpcMethod('PropertyService', 'CreateProperty')
  async createProperty(dto: CreatePropertyDto) {
    this.logger.log(`Received create-property request for broker code ${dto.brokersUniqueCode}`);
    const property = await this.propertyService.createProperty(dto);
    return {
      id: property.id,
      brokersUniqueCode: property.brokersUniqueCode,
      title: property.title,
      success: true,
      message: 'Property created successfully',
    };
  }

  @GrpcMethod('PropertyService', 'AddAllowedViewer')
  async addAllowedViewer(dto: AddAllowedViewerDto) {
    this.logger.log(`Received add-allowed-viewer request for broker code ${dto.brokerCode}`);
    const property = await this.propertyService.addAllowedViewer(dto);
    return {
      success: true,
      message: `Allowed viewer added to property ${property.id}`,
    };
  }

  @GrpcMethod('PropertyService', 'GetProperties')
  async getProperties(dto: { page: number; limit: number; brokerCode?: string; location?: string; sortBy?: string; sortOrder?: string; minAmount?: number; maxAmount?: number; fromDate?: string; toDate?: string }) {
    this.logger.log(`Received get-properties request`);
    return this.propertyService.getProperties(dto);
  }

  @GrpcMethod('PropertyService', 'GetPropertyLocations')
  async getPropertyLocations() {
    this.logger.log(`Received get-property-locations request`);
    return this.propertyService.getPropertyLocations();
  }

  @GrpcMethod('PropertyService', 'GetBrokerBookings')
  async getBrokerBookings(dto: { brokerCode: string }) {
    this.logger.log(`Received get-broker-bookings request for broker code ${dto.brokerCode}`);
    return this.propertyService.getBrokerBookings(dto.brokerCode);
  }

  @GrpcMethod('PropertyService', 'RecordSearch')
  async recordSearch(dto: RecordSearchDto) {
    this.logger.log(`Received record-search request for session ${dto.sessionToken}`);
    return this.propertyService.recordSearch(dto);
  }

  @GrpcMethod('PropertyService', 'GetRecentSearches')
  async getRecentSearches(dto: SearchRequest) {
    this.logger.log(`Received get-recent-searches request for session ${dto.sessionToken}`);
    return this.propertyService.getRecentSearches(dto);
  }

  @GrpcMethod('PropertyService', 'FindNearbyProperties')
  async findNearbyProperties(dto: FindNearbyDto) {
    this.logger.log(`Received find-nearby-properties request for lat=${dto.lat}, lng=${dto.lng}`);
    return this.propertyService.findNearbyProperties(dto);
  }

  @GrpcMethod('PropertyService', 'TrackNearbyProperties')
  async trackNearbyProperties(dto: TrackRequest) {
    this.logger.log(`Received track-nearby-properties request for session ${dto.sessionToken}`);
    return this.propertyService.trackNearbyProperties(dto);
  }

  @GrpcMethod('PropertyService', 'UpdateProperty')
  async updateProperty(dto: UpdatePropertyRequest) {
    this.logger.log(`Received update-property request for id ${dto.id}`);
    const property = await this.propertyService.updateProperty(dto.id, dto);
    return {
      id: property.id,
      brokersUniqueCode: property.brokersUniqueCode,
      title: property.title,
      success: true,
      message: 'Property updated successfully',
    };
  }

  @GrpcMethod('PropertyService', 'DeleteProperty')
  async deleteProperty(dto: { id: string }) {
    this.logger.log(`Received delete-property request for id ${dto.id}`);
    return this.propertyService.deleteProperty(dto.id);
  }

  @GrpcMethod('PropertyService', 'ResolveLocationName')
  async resolveLocationName(dto: { lat: number; lng: number }) {
    this.logger.log(`Received resolve-location-name request for lat=${dto.lat}, lng=${dto.lng}`);
    return this.propertyService.resolveLocationName(dto);
  }

  @GrpcMethod('PropertyService', 'GetCustomerProperties')
  async getCustomerProperties(dto: { sessionToken: string; page: number; limit: number; lat?: number; lng?: number; radiusKm?: number; propertyType?: string }) {
    this.logger.log(`Received get-customer-properties request`);
    return this.propertyService.getCustomerProperties(dto);
  }

  @GrpcMethod('PropertyService', 'InitiatePropertyAccessPayment')
  async initiatePropertyAccessPayment(dto: { sessionToken: string; brokerCode: string; propertyId?: string; amount: number; customerEmail?: string; customerPhone?: string; customerName?: string; careerExamples?: string }) {
    this.logger.log(`Received initiate-property-access-payment request for broker ${dto.brokerCode}`);
    return this.propertyService.initiatePropertyAccessPayment(dto);
  }

  @GrpcMethod('PropertyService', 'GetBrokerPropertiesForCustomer')
  async getBrokerPropertiesForCustomer(dto: { sessionToken: string; brokerCode: string; page: number; limit: number }) {
    this.logger.log(`Received get-broker-properties-for-customer request for broker ${dto.brokerCode}`);
    return this.propertyService.getBrokerPropertiesForCustomer(dto);
  }

  @GrpcMethod('PropertyService', 'CreateCustomerBooking')
  async createCustomerBooking(dto: { sessionToken: string; propertyId: string; customerName: string; customerPhone: string; customerEmail?: string; date: string; amount: number; reason?: string; status?: string }) {
    this.logger.log(`Received create-customer-booking request for property ${dto.propertyId}`);
    return this.propertyService.createCustomerBooking(dto);
  }

  @GrpcMethod('PropertyService', 'GetPropertyDetailsForCustomer')
  async getPropertyDetailsForCustomer(dto: { sessionToken: string; propertyId: string }) {
    this.logger.log(`Received get-property-details-for-customer request for property ${dto.propertyId}`);
    return this.propertyService.getPropertyDetailsForCustomer(dto);
  }

  @GrpcMethod('PropertyService', 'GetCustomerBookings')
  async getCustomerBookings(dto: { sessionToken: string; page: number; limit: number }) {
    this.logger.log(`Received get-customer-bookings request`);
    return this.propertyService.getCustomerBookings(dto);
  }

  @GrpcMethod('PropertyService', 'GetBookingByCode')
  async getBookingByCode(dto: { transactionCode: string }) {
    this.logger.log(`Received get-booking-by-code request for code ${dto.transactionCode}`);
    return this.propertyService.getBookingByCode(dto);
  }

  @GrpcMethod('PropertyService', 'GetBookingsByPhone')
  async getBookingsByPhone(dto: { customerPhone: string; page: number; limit: number }) {
    this.logger.log(`Received get-bookings-by-phone request for phone ${dto.customerPhone}`);
    return this.propertyService.getBookingsByPhone(dto);
  }
}
