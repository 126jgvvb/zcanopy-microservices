import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PropertyService } from './property.service';
import type { CreatePropertyDto, AddAllowedViewerDto, FindNearbyDto } from './property.service';

interface SearchRequest {
  customerId: string;
  query?: string;
  location?: string;
  radius?: number;
  propertyType?: string;
  limit?: number;
}

interface TrackRequest {
  customerId: string;
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
  price?: number;
  brokerBookingFee?: number;
}

interface GetPropertyLocationsResponse {
  locations: any
}

@Controller()
export class PropertyController {
  private readonly logger = new Logger(PropertyController.name);

  constructor(private readonly propertyService: PropertyService) {}

  @GrpcMethod('PropertyService', 'CreateProperty')
  async createProperty(dto: CreatePropertyDto) {
    this.logger.log(`Received create-property ${JSON.stringify(dto)} request for broker code ${dto.brokersUniqueCode}`);
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
  async getPropertyLocations(): Promise<GetPropertyLocationsResponse> {
    this.logger.log(`Received get-property-locations request`);
    return await this.propertyService.getPropertyLocations();
  }

  @GrpcMethod('PropertyService', 'GetBrokerBookings')
  async getBrokerBookings(dto: { brokerCode: string }) {
    this.logger.log(`Received get-broker-bookings request for broker code ${dto.brokerCode}`);
    return this.propertyService.getBrokerBookings(dto.brokerCode);
  }

  @GrpcMethod('PropertyService', 'RecordSearch')
  async recordSearch(dto: { customerId: string; query?: string; location?: string; radius?: number; propertyType?: string; filters?: any; resultPropertyIds?: string[]; resultCount?: number; minPrice?: number; maxPrice?: number; subCounty?: string; district?: string }) {
    this.logger.log(`Received record-search request for customer ${dto.customerId}`);
    return this.propertyService.recordSearch(dto);
  }

  @GrpcMethod('PropertyService', 'GetRecentSearches')
  async getRecentSearches(dto: SearchRequest) {
    this.logger.log(`Received get-recent-searches request for customer ${dto.customerId}`);
    return this.propertyService.getRecentSearches(dto);
  }

  @GrpcMethod('PropertyService', 'FindNearbyProperties')
  async findNearbyProperties(dto: FindNearbyDto) {
    this.logger.log(`Received find-nearby-properties request for lat=${dto.lat}, lng=${dto.lng}`);
    return this.propertyService.findNearbyProperties(dto);
  }

  @GrpcMethod('PropertyService', 'TrackNearbyProperties')
  async trackNearbyProperties(dto: TrackRequest) {
    this.logger.log(`Received track-nearby-properties request for customer ${dto.customerId}`);
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
  async getCustomerProperties(dto: { customerId: string; page: number; limit: number; lat?: number; lng?: number; radiusKm?: number; propertyType?: string; minPrice?: number; maxPrice?: number; location?: string; brokerCode?: string; brokerBrandName?: string; subCounty?: string; district?: string; fromDate?: string; toDate?: string }) {
    this.logger.log(`Received get-customer-properties request for customer ${dto.customerId}`);
    return this.propertyService.getCustomerProperties(dto);
  }

  @GrpcMethod('PropertyService', 'InitiatePropertyAccessPayment')
  async initiatePropertyAccessPayment(dto: { customerId: string; brokerCode: string; propertyId?: string; amount: number; customerEmail?: string; customerPhone?: string; customerName?: string; careerExamples?: string }) {
    this.logger.log(`Received initiate-property-access-payment request for customer ${dto.customerId}`);
    return this.propertyService.initiatePropertyAccessPayment(dto);
  }

  @GrpcMethod('PropertyService', 'GetBrokerPropertiesForCustomer')
  async getBrokerPropertiesForCustomer(dto: { customerId: string; brokerCode: string; page: number; limit: number }) {
    this.logger.log(`Received get-broker-properties-for-customer request for customer ${dto.customerId}`);
    return this.propertyService.getBrokerPropertiesForCustomer(dto);
  }

  @GrpcMethod('PropertyService', 'CreateCustomerBooking')
  async createCustomerBooking(dto: { customerId: string; propertyId: string; customerName: string; customerPhone: string; customerEmail?: string; date: string; amount: number; reason?: string; status?: string }) {
    this.logger.log(`Received create-customer-booking request for customer ${dto.customerId}`);
    return this.propertyService.createCustomerBooking(dto);
  }

  @GrpcMethod('PropertyService', 'GetPropertyDetailsForCustomer')
  async getPropertyDetailsForCustomer(dto: { customerId: string; propertyId: string }) {
    this.logger.log(`Received get-property-details-for-customer request for customer ${dto.customerId}`);
    return this.propertyService.getPropertyDetailsForCustomer(dto);
  }

  @GrpcMethod('PropertyService', 'GetPublicPropertyDetails')
  async getPublicPropertyDetails(dto: { propertyId: string }) {
    this.logger.log(`Received get-public-property-details request for property ${dto.propertyId}`);
    return this.propertyService.getPublicPropertyDetails(dto);
  }

  @GrpcMethod('PropertyService', 'GetSimilarProperties')
  async getSimilarProperties(dto: { customerId: string; propertyId: string; limit?: number }) {
    this.logger.log(`Received get-similar-properties request for customer ${dto.customerId}`);
    return this.propertyService.getSimilarProperties(dto);
  }

  @GrpcMethod('PropertyService', 'GetCustomerBookings')
  async getCustomerBookings(dto: { customerId: string; page: number; limit: number }) {
    this.logger.log(`Received get-customer-bookings request for customer ${dto.customerId}`);
    return this.propertyService.getCustomerBookings(dto);
  }

  @GrpcMethod('PropertyService', 'GetBookingByCode')
  async getBookingByCode(dto: { transactionCode: string }) {
    this.logger.log(`Received get-booking-by-code request for code ${dto.transactionCode}`);
    return this.propertyService.getBookingByCode(dto);
  }

  @GrpcMethod('PropertyService', 'GetBookingByBookingCode')
  async getBookingByBookingCode(dto: { bookingCode: string; customerPhone?: string }) {
    this.logger.log(`Received get-booking-by-booking-code request for code ${dto.bookingCode}`);
    return this.propertyService.getBookingByBookingCode(dto);
  }

  @GrpcMethod('PropertyService', 'GetBookingsByPhone')
  async getBookingsByPhone(dto: { customerPhone: string; page: number; limit: number }) {
    this.logger.log(`Received get-bookings-by-phone request for phone ${dto.customerPhone}`);
    return this.propertyService.getBookingsByPhone(dto);
  }

  @GrpcMethod('PropertyService', 'GetPropertyClients')
  async getPropertyClients(dto: { propertyId: string }) {
    this.logger.log(`Received get-property-clients request for property ${dto.propertyId}`);
    return this.propertyService.GetPropertyClients(dto);
  }

  @GrpcMethod('PropertyService', 'DeclineBooking')
  async declineBooking(dto: { transactionCode: string }) {
    this.logger.log(`Received decline-booking request for transactionCode=${dto.transactionCode}`);
    return this.propertyService.declineBooking(dto);
  }

  @GrpcMethod('PropertyService', 'SearchPropertiesByBrokerTitle')
  async searchPropertiesByBrokerTitle(dto: { query: string; customerId?: string; page: number; limit: number; lat?: number; lng?: number; radiusKm?: number }) {
    this.logger.log(`Received search-properties-by-broker-title request for query=${dto.query}`);
    return this.propertyService.SearchPropertiesByBrokerTitle(dto);
  }

  @GrpcMethod('PropertyService', 'DeletePropertiesByBrokerCode')
  async deletePropertiesByBrokerCode(dto: { brokerCode: string }) {
    this.logger.log(`Received delete-properties-by-broker-code request for brokerCode=${dto.brokerCode}`);
    return this.propertyService.deletePropertiesByBrokerCode(dto.brokerCode);
  }

  @GrpcMethod('PropertyService', 'GetFeaturedProperties')
  async getFeaturedProperties(dto: { limit: number }) {
    this.logger.log(`Received get-featured-properties request with limit=${dto.limit}`);
    return this.propertyService.getFeaturedProperties(dto.limit);
  }

  @GrpcMethod('PropertyService', 'RecordCustomerSearch')
  async recordCustomerSearch(dto: { customerId: string; query?: string; location?: string; radius?: number; propertyType?: string; filters?: any; resultPropertyIds?: string[]; resultCount?: number; minPrice?: number; maxPrice?: number; subCounty?: string; district?: string }) {
    this.logger.log(`Received record-customer-search request for customer ${dto.customerId}`);
    return this.propertyService.recordSearch(dto);
  }

  @GrpcMethod('PropertyService', 'GetCustomerSearches')
  async getCustomerSearches(dto: { sessionToken:string, customerId: string; page: number; limit: number }) {
    this.logger.log(`Received get-customer-searches request for customer ${dto.sessionToken} :: ${dto.customerId}`);
    dto.customerId=dto.sessionToken;
    return this.propertyService.getCustomerSearches(dto);
  }

  @GrpcMethod('PropertyService', 'GetAllCustomerSearches')
  async getAllCustomerSearches(dto: { page: number; limit: number; customerId?: string; query?: string }) {
    this.logger.log(`Received get-all-customer-searches request`);
    return this.propertyService.getAllCustomerSearches(dto);
  }

  @GrpcMethod('PropertyService', 'ToggleFavorite')
  async toggleFavorite(dto: { customerId: string; propertyId: string; propertyTitle: string; propertyLocation?: string; brokerCode?: string; imageUrl?: string; price?: number }) {
    this.logger.log(`Received toggle-favorite request for customer ${dto.customerId}`);
    return this.propertyService.toggleFavorite(dto);
  }

  @GrpcMethod('PropertyService', 'GetCustomerFavorites')
  async getCustomerFavorites(dto: any) {
    this.logger.log(`Received get-customer-favorites request for customer ${JSON.stringify(dto)}`);
    dto.customerId=dto.sessionToken;
    return this.propertyService.getCustomerFavorites(dto);
  }

  @GrpcMethod('PropertyService', 'GetAllCustomerFavorites')
  async getAllCustomerFavorites(dto: { page: number; limit: number }) {
    this.logger.log(`Received getAll-customer-favorites request`);
    return this.propertyService.getAllCustomerFavorites(dto);
  }

  @GrpcMethod('PropertyService', 'AddComment')
  async addComment(dto: { customerId: string; propertyId: string; customerName: string; customerPhone: string; customerEmail?: string; comment: string; rating?: number }) {
    this.logger.log(`Received add-comment request for customer ${dto.customerId}`);
    return this.propertyService.addComment(dto);
  }

  @GrpcMethod('PropertyService', 'GetPropertyComments')
  async getPropertyComments(dto: { propertyId: string; page: number; limit: number }) {
    this.logger.log(`Received get-property-comments request for property ${dto.propertyId}`);
    return this.propertyService.getPropertyComments(dto);
  }

  @GrpcMethod('PropertyService', 'GetAllComments')
  async getAllComments(dto: { page: number; limit: number; propertyId?: string }) {
    this.logger.log(`Received get-all-comments request`);
    return this.propertyService.getAllComments(dto);
  }

  @GrpcMethod('PropertyService', 'SearchProperties')
  async searchProperties(dto: { customerId: string; query?: string; location?: string; radius?: number; propertyType?: string; subCounty?: string; district?: string; minPrice?: number; maxPrice?: number; page?: number; limit?: number; lat?: number; lng?: number; radiusKm?: number }) {
    this.logger.log(`Received search-properties request for customer ${dto.customerId}`);
    return this.propertyService.searchProperties(dto);
  }

  @GrpcMethod('PropertyService', 'UpdateCustomerSearchCustomerId')
  async updateCustomerSearchCustomerId(dto: { customerId: string }) {
    this.logger.log(`Received update-customer-search-customer-id request`);
    return this.propertyService.updateCustomerSearchCustomerId(dto);
  }

  @GrpcMethod('PropertyService', 'GetCustomerSearchesByCustomerId')
  async getCustomerSearchesByCustomerId(dto: { customerId: string; page: number; limit: number }) {
    this.logger.log(`Received get-customer-searches-by-customer-id request for customer ${dto.customerId}`);
    return this.propertyService.getCustomerSearchesByCustomerId(dto);
  }

  @GrpcMethod('PropertyService', 'GetZeroResultSearches')
  async getZeroResultSearches(dto: { page: number; limit: number; fromDate?: string }) {
    this.logger.log(`Received get-zero-result-searches request`);
    return this.propertyService.getZeroResultSearches(dto);
  }
}