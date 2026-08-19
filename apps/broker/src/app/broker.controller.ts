import { Controller, Logger } from '@nestjs/common';
import { BrokerService } from './broker.service';
import { GrpcMethod } from '@nestjs/microservices';
import { BrokerEntity } from '../entity/broker.entity';
import { BrokerDto, RequestOtpDto, ResendOtpDto, LoginBrokerDto, CreateBrokerSessionDto, GetBrokerSessionsDto, RevokeBrokerSessionDto, GetBrokerByCodeDto, UpdateBrokerSettingsDto, GetAvailableTiersDto, SubmitBrokerFeedbackDto, GetBrokerMessagesDto, LogoutBrokerDto, UnsubscribeBrokerDto, RequestUnsubscribeOtpDto, SetupBrokerAccountDto, SearchBrokersDto, ValidateBrokerDto, GetBrokerByIdDto, SaveUserInfoDto, UpdateUserFieldDto, RegisterBrokerDto, SendBrokerOtpDto, VerifyBrokerOtpDto } from './dtos/broker-dto';

interface GetAllBrokersRequest {
  page: number;
  limit: number;
}

interface GetAllBrokersResponse {
  brokers: BrokerEntity[];
  total: number;
  page: number;
  limit: number;
}

interface GetPendingVerificationsResponse {
  page:number;
  limit:number;
}

interface GetRecentSignupsResponse {
  brokers:any
}

interface CreateBrokerResponse {
  broker: any;
}

@Controller()
export class BrokerController {
  private readonly logger = new Logger(BrokerController.name);
  constructor(private readonly brokerService: BrokerService) {}

  @GrpcMethod('BrokerService', 'RequestOtp')
  async requestOtp(dto: RequestOtpDto) {
    this.logger.log(`requestOtp called for email=${dto.email}, phoneNumber=${dto.phoneNumber}`);
    return this.brokerService.requestOtp(dto);
  }

  @GrpcMethod('BrokerService', 'GetAllBrokers')
  async getAllBrokers(data: GetAllBrokersRequest):Promise<GetAllBrokersResponse> {
    this.logger.log(`getAllBrokers called with page=${data.page}, limit=${data.limit}`);
    const res=await this.brokerService.getAllBrokers({page:data.page,limit:data.limit});
    
    return {
        brokers: res.brokers,
        total: res.total,
        page: data.page,
        limit: data.limit,
    };
  }

  @GrpcMethod('BrokerService', 'CreateBroker')
  async createBroker(broker: BrokerDto): Promise<CreateBrokerResponse> {
    this.logger.log(`createBroker called with username=${broker.username}, email=${broker.email}, phoneNumber=${broker.phoneNumber}`);
    return await this.brokerService.createBroker(broker);
  }

  @GrpcMethod('BrokerService', 'ProcessSubscriptionPayment')
  async processSubscriptionPayment(dto: { phoneNumber?: string; tier: string; brokerId: string }) {
    this.logger.log(`processSubscriptionPayment called for broker=${dto.brokerId}, tier=${dto.tier}`);
    return this.brokerService.processSubscriptionPayment(dto);
  }

  @GrpcMethod('BrokerService', 'GetAvailableTiers')
  async getAvailableTiers(_: GetAvailableTiersDto) {
    this.logger.log('getAvailableTiers called');
    return this.brokerService.getAvailableTiers(_);
  }

  @GrpcMethod('BrokerService', 'SubmitBrokerFeedback')
  async submitBrokerFeedback(dto: SubmitBrokerFeedbackDto) {
    this.logger.log(`submitBrokerFeedback called for broker=${dto.brokerCode}`);
    return this.brokerService.submitBrokerFeedback(dto);
  }

  @GrpcMethod('BrokerService', 'ProcessPropertyPayment')
  async processPropertyPayment(dto: { customerPhone: string; customerEmail: string; customerName: string }) {
    this.logger.log(`processPropertyPayment called for customer=${dto.customerName}`);
    return this.brokerService.processPropertyPayment(dto);
  }

  @GrpcMethod('BrokerService', 'SaveBrokerFcmToken')
  async saveBrokerFcmToken(dto: { brokerCode: string; fcmToken: string; deviceId?: string }) {
    this.logger.log(`saveBrokerFcmToken called with brokerCode=${dto.brokerCode}, deviceId=${dto.deviceId}`);
    return this.brokerService.saveBrokerFcmToken(dto);
  }

  @GrpcMethod('BrokerService', 'UpdateBroker')
  async updateBroker(dto: { id: number; username: string; email: string; IDFront: string; IDBack: string }) {
    this.logger.log(`updateBroker called for id=${dto.id}`);
    return this.brokerService.updateBroker(dto);
  }  

  @GrpcMethod('BrokerService', 'UpdateBrokerSettings')
  async updateBrokerSettings(dto: UpdateBrokerSettingsDto) {
    this.logger.log(`updateBrokerSettings called for broker=${dto.brokerCode}`);
    return this.brokerService.updateBrokerSettings(dto);
  }

  @GrpcMethod('BrokerService', 'DeleteBroker')
  async deleteBroker(dto: { id: number }) {
    this.logger.log(`deleteBroker called for id=${dto.id}`);
    return this.brokerService.deleteBroker(dto.id);
  }   

  @GrpcMethod('BrokerService', 'GetBrokerDashboard')
  async getBrokerDashboard(dto: { brokerId: string }) {
    this.logger.log(`getBrokerDashboard called for broker=${dto.brokerId}`);
    return this.brokerService.getBrokerDashboard(dto);
  }

  @GrpcMethod('BrokerService', 'CreditWallet')
  async creditWallet(dto: { brokerId: string; amount: number; reason: string; createdBy: string; referenceNumber?: string }) {
    this.logger.log(`creditWallet called for broker=${dto.brokerId}, amount=${dto.amount}`);
    return this.brokerService.creditWallet(dto);
  }

  @GrpcMethod('BrokerService', 'DebitWallet')
  async debitWallet(dto: { brokerId: string; amount: number; reason: string; createdBy: string; referenceNumber?: string }) {
    this.logger.log(`debitWallet called for broker=${dto.brokerId}, amount=${dto.amount}`);
    return this.brokerService.debitWallet(dto);
  }

  @GrpcMethod('BrokerService', 'Withdraw')
  async withdraw(dto: { amount: number; phoneNumber: string; provider: 'MTN' | 'AIRTEL'; payeeName?: string }) {
    this.logger.log(`withdraw called for phone=${dto.phoneNumber}, amount=${dto.amount}`);
    return this.brokerService.withdraw(dto);
  }

  @GrpcMethod('BrokerService', 'GetWallet')
  async getWallet(dto: { walletId?: string }) {
    this.logger.log(`getWallet called for wallet=${dto.walletId || 'default'}`);
    return this.brokerService.getWallet(dto);
  }

  @GrpcMethod('BrokerService', 'GetWalletTransactions')
  async getWalletTransactions(dto: { brokerId: string; page: number; limit: number }) {
    this.logger.log(`getWalletTransactions called for broker=${dto.brokerId}, page=${dto.page}`);
    return this.brokerService.getWalletTransactions(dto);
  }

  @GrpcMethod('BrokerService', 'ResendOtp')
  async resendOtp(dto: ResendOtpDto) {
    this.logger.log(`resendOtp called for email=${dto.email}`);
    return this.brokerService.resendOtp(dto);
  }

  @GrpcMethod('BrokerService', 'LoginBroker')
  async loginBroker(dto: LoginBrokerDto) {
    this.logger.log(`loginBroker called for broker=${dto.brokerCode}`);
    return this.brokerService.loginBroker(dto);
  }

  @GrpcMethod('BrokerService', 'CreateBrokerSession')
  async createBrokerSession(dto: CreateBrokerSessionDto) {
    this.logger.log(`createBrokerSession called for broker=${dto.brokerCode}`);
    return this.brokerService.createBrokerSession(dto);
  }

  @GrpcMethod('BrokerService', 'GetBrokerSessions')
  async getBrokerSessions(dto: GetBrokerSessionsDto) {
    this.logger.log(`getBrokerSessions called for broker=${dto.brokerCode}`);
    return this.brokerService.getBrokerSessions(dto);
  }

  @GrpcMethod('BrokerService', 'RevokeBrokerSession')
  async revokeBrokerSession(dto: RevokeBrokerSessionDto) {
    this.logger.log(`revokeBrokerSession called for broker=${dto.brokerCode}`);
    return this.brokerService.revokeBrokerSession(dto);
  }

  @GrpcMethod('BrokerService', 'GetBrokerByCode')
  async getBrokerByCode(dto: GetBrokerByCodeDto) {
    this.logger.log(`getBrokerByCode called for broker=${dto.brokerCode}`);
    return this.brokerService.getBrokerByCode(dto);
  }

  @GrpcMethod('BrokerService', 'SearchBrokers')
  async searchBrokers(dto: SearchBrokersDto) {
    this.logger.log(`searchBrokers called for query=${dto.query}`);
    return this.brokerService.searchBrokers(dto);
  }

  @GrpcMethod('BrokerService', 'GetBrokerMessages')
  async getBrokerMessages(dto: GetBrokerMessagesDto) {
    this.logger.log(`getBrokerMessages called for broker=${dto.brokerId}`);
    return this.brokerService.getBrokerMessages(dto);
  }

  @GrpcMethod('BrokerService', 'LogoutBroker')
  async logoutBroker(dto: LogoutBrokerDto) {
    this.logger.log(`logoutBroker called for broker=${dto.brokerCode}`);
    return this.brokerService.logoutBroker(dto);
  }

  @GrpcMethod('BrokerService', 'RequestUnsubscribeOtp')
  async requestUnsubscribeOtp(dto: RequestUnsubscribeOtpDto) {
    this.logger.log(`requestUnsubscribeOtp called for broker=${dto.brokerCode}`);
    return this.brokerService.requestUnsubscribeOtp(dto);
  }

  @GrpcMethod('BrokerService', 'UnsubscribeBroker')
  async unsubscribeBroker(dto: UnsubscribeBrokerDto) {
    this.logger.log(`unsubscribeBroker called for broker=${dto.brokerCode}`);
    return this.brokerService.unsubscribeBroker(dto);
  }

  @GrpcMethod('BrokerService', 'SetupBrokerAccount')
  async setupBrokerAccount(dto: SetupBrokerAccountDto) {
    this.logger.log(`setupBrokerAccount called for broker=${dto.brokerCode}`);
    return this.brokerService.setupBrokerAccount(dto);
  }

  @GrpcMethod('BrokerService', 'ValidateBroker')
  async validateBroker(dto: ValidateBrokerDto) {
    this.logger.log(`validateBroker called for email=${dto.email}`);
    return this.brokerService.validateBroker(dto);
  }

  @GrpcMethod('BrokerService', 'GetBrokerById')
  async getBrokerById(dto: GetBrokerByIdDto): Promise<{ broker: any }> {
    this.logger.log(`getBrokerById called for id=${dto.id}`);
    return this.brokerService.getBrokerById(dto);
  }

  @GrpcMethod('BrokerService', 'GetPendingVerifications')
  async getPendingVerifications(dto:{page:number,limit:number}):Promise<GetPendingVerificationsResponse>{
    this.logger.log(`getPendingVerifications called with page=${dto.page}, limit=${dto.limit}`);
    return await this.brokerService.getPendingVerifications(dto);
  }

  @GrpcMethod('BrokerService','EditBrokerTier')
  async editBrokerTier(dto: { id: string; subscriptionTier: string }) {
    this.logger.log(`editBrokerTier called for ${dto.id}, tier=${dto.subscriptionTier}`);
    return await this.brokerService.editBrokerTier(dto);
  }

  @GrpcMethod('BrokerService','GetRecentSignups')
  async getRecentSignups(dto:{limit:number}):Promise<GetRecentSignupsResponse>{
    this.logger.log(`getRecentSignups called with limit=${dto.limit}`);
    return await this.brokerService.getRecentSignups(dto);
  }

  @GrpcMethod('BrokerService','SaveUserInfo')
  async saveUserInfo(dto: SaveUserInfoDto) {
    this.logger.log(`saveUserInfo called for userId=${dto.userId}`);
    return this.brokerService.saveUserInfo(dto);
  }

  @GrpcMethod('BrokerService','UpdateUserField')
  async updateUserField(dto: UpdateUserFieldDto) {
    this.logger.log(`updateUserField called for id=${dto.id}`);
    return this.brokerService.updateUserField(dto);
  }

  @GrpcMethod('BrokerService','DeleteBrokerAccount')
  async deleteBrokerAccount(dto: { brokerCode: string }) {
    this.logger.log(`deleteBrokerAccount called for brokerCode=${dto.brokerCode}`);
    return this.brokerService.deleteBrokerAccount(dto);
  }

  @GrpcMethod('BrokerService','RegisterBroker')
  async registerBroker(dto: RegisterBrokerDto) {
    this.logger.log(`registerBroker called for email=${dto.email}`);
    return this.brokerService.registerBroker(dto);
  }

  @GrpcMethod('BrokerService','SendBrokerOtp')
  async sendBrokerOtp(dto: SendBrokerOtpDto) {
    this.logger.log(`sendBrokerOtp called for email=${dto.email}`);
    return this.brokerService.sendBrokerOtp(dto);
  }

  @GrpcMethod('BrokerService','VerifyBrokerOtp')
  async verifyBrokerOtp(dto: VerifyBrokerOtpDto) {
    this.logger.log(`verifyBrokerOtp called for email=${dto.email}`);
    return this.brokerService.verifyBrokerOtp(dto);
  }

}