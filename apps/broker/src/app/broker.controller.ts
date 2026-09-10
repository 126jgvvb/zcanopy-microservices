import { Controller, Logger } from '@nestjs/common';
import { BrokerService } from './broker.service';
import { GrpcMethod } from '@nestjs/microservices';
import { LoginBrokerDto, SetupBrokerAccountDto, VerifyBrokerOtpDto, VerifyOtpDto, GetBrokerByCodeDto, GetBrokerByIdDto, SearchBrokersDto, GetSubscriptionDetailsDto, SaveUserInfoDto, UpdateUserFieldDto, SubmitBrokerFeedbackDto, GetBrokerMessagesDto, LogoutBrokerDto, UnsubscribeBrokerDto, RequestUnsubscribeOtpDto, ResendOtpDto, GetBrokerSessionsDto, RevokeBrokerSessionDto, CreateBrokerSessionDto, UpdateBrokerSettingsDto, GetAvailableTiersDto, RequestOtpDto, RegisterBrokerDto, SendBrokerOtpDto, ValidateBrokerDto } from './dtos/broker-dto';
import { GrpcMethod } from '@nestjs/microservices';

@Controller()
export class BrokerController {
  private readonly logger = new Logger(BrokerController.name);

  constructor(private readonly brokerService: BrokerService) {}

  @GrpcMethod('BrokerService','RequestOtp')
  async requestOtp(dto: RequestOtpDto) {
    this.logger.log(`RequestOtp called for ${dto.email}`);
    return this.brokerService.requestOtp(dto);
  }

  @GrpcMethod('BrokerService','RegisterBroker')
  async registerBroker(dto: RegisterBrokerDto) {
    this.logger.log(`RegisterBroker called for ${dto.email}`);
    return this.brokerService.registerBroker(dto);
  }

  @GrpcMethod('BrokerService','SendBrokerOtp')
  async sendBrokerOtp(dto: SendBrokerOtpDto) {
    this.logger.log(`SendBrokerOtp called for ${dto.email}`);
    return this.brokerService.sendBrokerOtp(dto);
  }

  @GrpcMethod('BrokerService','VerifyBrokerOtp')
  async verifyBrokerOtp(dto: VerifyBrokerOtpDto) {
    this.logger.log(`VerifyBrokerOtp called for ${dto.email}`);
    return this.brokerService.verifyBrokerOtp(dto);
  }

  @GrpcMethod('BrokerService','GetAllBrokers')
  async getAllBrokers(dto: { page: number; limit: number }) {
    this.logger.log(`GetAllBrokers called page=${dto.page} limit=${dto.limit}`);
    return this.brokerService.getAllBrokers(dto);
  }

  @GrpcMethod('BrokerService','CreateBroker')
  async createBroker(dto: any) {
    this.logger.log(`CreateBroker called for ${dto.email || ''}`);
    return this.brokerService.createBroker(dto);
  }

  @GrpcMethod('BrokerService','MarkBrokerVerified')
  async markBrokerVerified(dto: { brokerId: string }) {
    this.logger.log(`MarkBrokerVerified called for ${dto.brokerId}`);
    return this.brokerService.markBrokerVerified(dto.brokerId);
  }

  @GrpcMethod('BrokerService','GetAvailableTiers')
  async getAvailableTiers(dto: GetAvailableTiersDto) {
    this.logger.log('GetAvailableTiers called');
    return this.brokerService.getAvailableTiers(dto);
  }

  @GrpcMethod('BrokerService','ProcessSubscriptionPayment')
  async processSubscriptionPayment(dto: { phoneNumber?: string; tier: string; brokerId: string }) {
    this.logger.log(`ProcessSubscriptionPayment called for broker ${dto.brokerId} tier=${dto.tier}`);
    return this.brokerService.processSubscriptionPayment(dto);
  }

  @GrpcMethod('BrokerService','SubmitBrokerFeedback')
  async submitBrokerFeedback(dto: SubmitBrokerFeedbackDto) {
    this.logger.log(`SubmitBrokerFeedback called for ${dto.brokerCode}`);
    return this.brokerService.submitBrokerFeedback(dto);
  }

  @GrpcMethod('BrokerService','SubmitVerificationDocuments')
  async submitVerificationDocuments(dto: { brokerCode: string; idFrontUrl: string; idBackUrl: string }) {
    this.logger.log(`SubmitVerificationDocuments called for broker=${dto.brokerCode}`);
    return this.brokerService.submitVerificationDocuments(dto);
  }

  @GrpcMethod('BrokerService','SaveBrokerFcmToken')
  async saveBrokerFcmToken(dto: { brokerCode: string; fcmToken: string; deviceId?: string }) {
    this.logger.log(`SaveBrokerFcmToken called for ${dto.brokerCode}`);
    return this.brokerService.saveBrokerFcmToken(dto);
  }

  @GrpcMethod('BrokerService','UpdateBroker')
  async updateBroker(dto: { id: number; username: string; email: string; IDFront: string; IDBack: string }) {
    this.logger.log(`UpdateBroker called for id=${dto.id}`);
    return this.brokerService.updateBroker(dto);
  }

  @GrpcMethod('BrokerService','UpdateBrokerSettings')
  async updateBrokerSettings(dto: UpdateBrokerSettingsDto) {
    this.logger.log(`UpdateBrokerSettings called for ${dto.brokerCode}`);
    return this.brokerService.updateBrokerSettings(dto);
  }

  @GrpcMethod('BrokerService','GetPendingVerifications')
  async getPendingVerifications(dto: { page: number; limit: number }) {
    this.logger.log(`GetPendingVerifications called page=${dto.page} limit=${dto.limit}`);
    return this.brokerService.getPendingVerifications(dto);
  }

  @GrpcMethod('BrokerService','GetRecentSignups')
  async getRecentSignups(dto: { limit: number }) {
    this.logger.log(`GetRecentSignups called limit=${dto.limit}`);
    return this.brokerService.getRecentSignups(dto);
  }

  @GrpcMethod('BrokerService','EditBrokerTier')
  async editBrokerTier(dto: { id: string; subscriptionTier: string }) {
    this.logger.log(`EditBrokerTier called for id=${dto.id} tier=${dto.subscriptionTier}`);
    return this.brokerService.editBrokerTier(dto);
  }

  @GrpcMethod('BrokerService','DeleteBroker')
  async deleteBroker(dto: { id: number }) {
    this.logger.log(`DeleteBroker called for id=${dto.id}`);
    return this.brokerService.deleteBroker(dto.id);
  }

  @GrpcMethod('BrokerService','GetBrokerDashboard')
  async getBrokerDashboard(dto: { brokerId: string }) {
    this.logger.log(`GetBrokerDashboard called for ${dto.brokerId}`);
    return this.brokerService.getBrokerDashboard(dto);
  }

  @GrpcMethod('BrokerService','CreditWallet')
  async creditWallet(dto: { brokerId: string; amount: number; reason: string; createdBy: string; referenceNumber?: string }) {
    this.logger.log(`CreditWallet called for ${dto.brokerId} amount=${dto.amount}`);
    return this.brokerService.creditWallet(dto);
  }

  @GrpcMethod('BrokerService','DebitWallet')
  async debitWallet(dto: { brokerId: string; amount: number; reason: string; createdBy: string; referenceNumber?: string }) {
    this.logger.log(`DebitWallet called for ${dto.brokerId} amount=${dto.amount}`);
    return this.brokerService.debitWallet(dto);
  }

  @GrpcMethod('BrokerService','Withdraw')
  async withdraw(dto: any) {
    this.logger.log(`Withdraw called for broker=${dto.brokerCode} amount=${dto.amount}`);
    return this.brokerService.withdraw(dto);
  }

  @GrpcMethod('BrokerService','GetWallet')
  async getWallet(dto: { walletId?: string }) {
    this.logger.log(`GetWallet called for ${dto.walletId || 'default'}`);
    return this.brokerService.getWallet(dto);
  }

  @GrpcMethod('BrokerService','GetWalletTransactions')
  async getWalletTransactions(dto: { brokerCode: string; page: number; limit: number }) {
    this.logger.log(`GetWalletTransactions called for ${dto.brokerCode} page=${dto.page} limit=${dto.limit}`);
    return this.brokerService.getWalletTransactions(dto);
  }

  @GrpcMethod('BrokerService','ResendOtp')
  async resendOtp(dto: ResendOtpDto) {
    this.logger.log(`ResendOtp called for ${dto.email} channel=${dto.channel}`);
    return this.brokerService.resendOtp(dto);
  }

  @GrpcMethod('BrokerService','LoginBroker')
  async loginBroker(dto: LoginBrokerDto) {
    this.logger.log(`LoginBroker called for code=${dto.brokerCode}`);
    return this.brokerService.loginBroker(dto);
  }

  @GrpcMethod('BrokerService','CreateBrokerSession')
  async createBrokerSession(dto: CreateBrokerSessionDto) {
    this.logger.log(`CreateBrokerSession called for broker=${dto.brokerCode}`);
    return this.brokerService.createBrokerSession(dto);
  }

  @GrpcMethod('BrokerService','GetBrokerSessions')
  async getBrokerSessions(dto: GetBrokerSessionsDto) {
    this.logger.log(`GetBrokerSessions called for ${dto.brokerCode}`);
    return this.brokerService.getBrokerSessions(dto);
  }

  @GrpcMethod('BrokerService','RevokeBrokerSession')
  async revokeBrokerSession(dto: RevokeBrokerSessionDto) {
    this.logger.log(`RevokeBrokerSession called for session=${dto.sessionToken}`);
    return this.brokerService.revokeBrokerSession(dto);
  }

  @GrpcMethod('BrokerService','GetBrokerByCode')
  async getBrokerByCode(dto: GetBrokerByCodeDto) {
    this.logger.log(`GetBrokerByCode called for ${dto.brokerCode}`);
    return this.brokerService.getBrokerByCode(dto);
  }

  @GrpcMethod('BrokerService','SearchBrokers')
  async searchBrokers(dto: SearchBrokersDto) {
    this.logger.log(`SearchBrokers called for query=${dto.query}`);
    return this.brokerService.searchBrokers(dto);
  }

  @GrpcMethod('BrokerService','DeleteBrokerAccount')
  async deleteBrokerAccount(dto: { brokerCode: string }) {
    this.logger.log(`DeleteBrokerAccount called for ${dto.brokerCode}`);
    return this.brokerService.deleteBrokerAccount(dto);
  }

  @GrpcMethod('BrokerService','GetBrokerMessages')
  async getBrokerMessages(dto: GetBrokerMessagesDto) {
    this.logger.log(`GetBrokerMessages called for brokerId=${dto.brokerId}`);
    return this.brokerService.getBrokerMessages(dto);
  }

  @GrpcMethod('BrokerService','LogoutBroker')
  async logoutBroker(dto: LogoutBrokerDto) {
    this.logger.log(`LogoutBroker called for ${dto.brokerCode}`);
    return this.brokerService.logoutBroker(dto);
  }

  @GrpcMethod('BrokerService','RequestUnsubscribeOtp')
  async requestUnsubscribeOtp(dto: RequestUnsubscribeOtpDto) {
    this.logger.log(`RequestUnsubscribeOtp called for ${dto.brokerCode}`);
    return this.brokerService.requestUnsubscribeOtp(dto);
  }

  @GrpcMethod('BrokerService','UnsubscribeBroker')
  async unsubscribeBroker(dto: UnsubscribeBrokerDto) {
    this.logger.log(`UnsubscribeBroker called for ${dto.brokerCode}`);
    return this.brokerService.unsubscribeBroker(dto);
  }

  @GrpcMethod('BrokerService','SetupBrokerAccount')
  async setupBrokerAccount(dto: SetupBrokerAccountDto) {
    this.logger.log(`SetupBrokerAccount called for ${dto.brokerCode}`);
    return this.brokerService.setupBrokerAccount(dto);
  }

  @GrpcMethod('BrokerService','ValidateBroker')
  async validateBroker(dto: ValidateBrokerDto) {
    this.logger.log(`ValidateBroker called for ${dto.email}`);
    return this.brokerService.validateBroker(dto);
  }
  
  @GrpcMethod('BrokerService','VerifyOtp')
  async verifyOtp(dto: VerifyOtpDto) {
    this.logger.log(`VerifyOtp called for ${dto.email} and otp ${dto.otp}`);
    return this.brokerService.verifyOtp(dto);
  }

  @GrpcMethod('BrokerService','GetBrokerById')
  async getBrokerById(dto: GetBrokerByIdDto) {
    this.logger.log(`GetBrokerById called for ${dto.id}`);
    return this.brokerService.getBrokerById(dto);
  }

  @GrpcMethod('BrokerService','GetSubscriptionDetails')
  async getSubscriptionDetails(dto: GetSubscriptionDetailsDto) {
    this.logger.log(`GetSubscriptionDetails called for ${dto.brokerCode}`);
    return this.brokerService.getSubscriptionDetails(dto);
  }

  @GrpcMethod('BrokerService','SaveUserInfo')
  async saveUserInfo(dto: SaveUserInfoDto) {
    this.logger.log(`SaveUserInfo called for userId=${dto.userId}`);
    return this.brokerService.saveUserInfo(dto);
  }

  @GrpcMethod('BrokerService','UpdateUserField')
  async updateUserField(dto: UpdateUserFieldDto) {
    this.logger.log(`UpdateUserField called for id=${dto.id} field=${dto.field}`);
    return this.brokerService.updateUserField(dto);
  }
}
