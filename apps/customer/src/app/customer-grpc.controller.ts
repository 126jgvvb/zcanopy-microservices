import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CustomerService } from './customer.service';
import type {
  RegisterCustomerDto,
  LoginCustomerDto,
  LoginCustomerGoogleDto,
  ConfirmOtpDto,
  UpdatePhoneDto,
  GetProfileDto,
  GetWalletBalanceDto,
  LogoutDto,
  UnsubscribeDto,
  GetInvoicesDto,
  GetTransactionsDto,
  GetMessagesDto,
  GetNotificationsDto,
  InitiateTransactionDto,
  RecordSearchDto,
  GetCustomerSearchesDto,
  VideoToursQueryDto,
  AllPropertiesQueryDto,
  ExplorerQueryDto,
  GetPropertyDetailsDto,
  SimilarPropertiesQueryDto,
  SearchQueryDto,
} from './dtos/customer-grpc.dto';

@Controller()
export class CustomerGrpcController {
  private readonly logger = new Logger(CustomerGrpcController.name);

  constructor(private readonly customerService: CustomerService) {}

  @GrpcMethod('CustomerService', 'RegisterCustomer')
  async registerCustomer(dto: RegisterCustomerDto) {
    this.logger.log(`gRPC RegisterCustomer for email=${dto.email}`);
    return this.customerService.registerCustomer(dto);
  }

  @GrpcMethod('CustomerService', 'LoginCustomer')
  async loginCustomer(dto: LoginCustomerDto) {
    this.logger.log(`gRPC LoginCustomer for email=${dto.email}`);
    return this.customerService.loginCustomer(dto);
  }

  @GrpcMethod('CustomerService', 'LoginCustomerGoogle')
  async loginCustomerGoogle(dto: LoginCustomerGoogleDto) {
    this.logger.log(`gRPC LoginCustomerGoogle for googleId=${dto.googleId}`);
    return this.customerService.loginCustomerGoogle(dto);
  }

  @GrpcMethod('CustomerService', 'ConfirmOtp')
  async confirmOtp(dto: ConfirmOtpDto) {
    this.logger.log(`gRPC ConfirmOtp for email=${dto.email}`);
    return this.customerService.confirmOtp(dto);
  }

  @GrpcMethod('CustomerService', 'UpdatePhoneNumber')
  async updatePhoneNumber(dto: UpdatePhoneDto) {
    this.logger.log(`gRPC UpdatePhoneNumber for customer=${dto.customerId}`);
    return this.customerService.updatePhoneNumber(dto.customerId, dto.phoneNumber);
  }

  @GrpcMethod('CustomerService', 'GetProfile')
  async getProfile(dto: GetProfileDto) {
    this.logger.log(`gRPC GetProfile for customer=${dto.customerId}`);
    return this.customerService.getProfile(dto.customerId);
  }

  @GrpcMethod('CustomerService', 'GetWalletBalance')
  async getWalletBalance(dto: GetWalletBalanceDto) {
    this.logger.log(`gRPC GetWalletBalance for customer=${dto.customerId}`);
    return this.customerService.getWalletBalance(dto.customerId);
  }

  @GrpcMethod('CustomerService', 'Logout')
  async logout(dto: LogoutDto) {
    this.logger.log(`gRPC Logout for session=${dto.sessionToken}`);
    return this.customerService.logout(dto.sessionToken);
  }

  @GrpcMethod('CustomerService', 'Unsubscribe')
  async unsubscribe(dto: UnsubscribeDto) {
    this.logger.log(`gRPC Unsubscribe for customer=${dto.customerId}`);
    return this.customerService.unsubscribe(dto.customerId);
  }

  @GrpcMethod('CustomerService', 'GetInvoices')
  async getInvoices(dto: GetInvoicesDto) {
    this.logger.log(`gRPC GetInvoices for customer=${dto.customerId}`);
    return this.customerService.getInvoices(dto.customerId, dto.page, dto.limit);
  }

  @GrpcMethod('CustomerService', 'GetTransactions')
  async getTransactions(dto: GetTransactionsDto) {
    this.logger.log(`gRPC GetTransactions for customer=${dto.customerId}`);
    return this.customerService.getTransactions(dto.customerId, dto.page, dto.limit);
  }

  @GrpcMethod('CustomerService', 'GetMessages')
  async getMessages(dto: GetMessagesDto) {
    this.logger.log(`gRPC GetMessages for customer=${dto.customerId}`);
    return this.customerService.getMessages(dto.customerId, dto.page, dto.limit);
  }

  @GrpcMethod('CustomerService', 'GetNotifications')
  async getNotifications(dto: GetNotificationsDto) {
    this.logger.log(`gRPC GetNotifications for customer=${dto.customerId}`);
    return this.customerService.getNotifications(dto.customerId, dto.page, dto.limit);
  }

  @GrpcMethod('CustomerService', 'InitiateTransaction')
  async initiateTransaction(dto: InitiateTransactionDto) {
    this.logger.log(`gRPC InitiateTransaction for customer=${dto.customerId}`);
    return this.customerService.initiateTransaction(dto);
  }

  @GrpcMethod('CustomerService', 'RecordSearch')
  async recordSearch(dto: RecordSearchDto) {
    this.logger.log(`gRPC RecordSearch for session=${dto.sessionToken}`);
    return this.customerService.recordSearch(dto);
  }

  @GrpcMethod('CustomerService', 'Search')
  async search(dto: SearchQueryDto) {
    this.logger.log(`gRPC Search for session=${dto.sessionToken}`);
    return this.customerService.search(dto);
  }

  @GrpcMethod('CustomerService', 'GetCustomerSearches')
  async getCustomerSearches(dto: GetCustomerSearchesDto) {
    this.logger.log(`gRPC GetCustomerSearches for session=${dto.sessionToken}`);
    return this.customerService.getCustomerSearches(dto.sessionToken, dto.page, dto.limit);
  }

  @GrpcMethod('CustomerService', 'VideoTours')
  async videoTours(dto: VideoToursQueryDto) {
    this.logger.log(`gRPC VideoTours for session=${dto.sessionToken}`);
    return this.customerService.videoTours(dto.sessionToken, dto);
  }

  @GrpcMethod('CustomerService', 'GetAllProperties')
  async getAllProperties(dto: AllPropertiesQueryDto) {
    this.logger.log(`gRPC GetAllProperties for session=${dto.sessionToken}`);
    return this.customerService.getAllProperties(dto.sessionToken, dto);
  }

  @GrpcMethod('CustomerService', 'Explorer')
  async explorer(dto: ExplorerQueryDto) {
    this.logger.log(`gRPC Explorer for session=${dto.sessionToken}`);
    return this.customerService.explorer(dto.sessionToken, dto);
  }

  @GrpcMethod('CustomerService', 'GetPropertyDetails')
  async getPropertyDetails(dto: GetPropertyDetailsDto) {
    this.logger.log(`gRPC GetPropertyDetails for property=${dto.propertyId}`);
    return this.customerService.getPropertyDetails(dto.sessionToken, dto.propertyId);
  }

  @GrpcMethod('CustomerService', 'GetSimilarProperties')
  async getSimilarProperties(dto: SimilarPropertiesQueryDto) {
    this.logger.log(`gRPC GetSimilarProperties for property=${dto.propertyId}`);
    return this.customerService.getSimilarProperties(dto.sessionToken, dto.propertyId);
  }
}
