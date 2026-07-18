import { Controller, Logger} from '@nestjs/common';
import { AdminService } from './admin.service';
import { GrpcMethod } from '@nestjs/microservices';

@Controller()
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  @GrpcMethod('AdminService', 'GetCommissions')
  async getCommissions() {
    this.logger.log('Received get-commissions request');
    return this.adminService.getCommissions();
  }

  @GrpcMethod('AdminService', 'RegisterAdmin')
  async registerAdmin(dto: any) {
    this.logger.log(`Received register-admin request for ${dto.email}`);
    return this.adminService.registerAdmin(dto);
  }

  @GrpcMethod('AdminService', 'LoginAdmin')
  async loginAdmin(dto: any) {
    this.logger.log(`Received login-admin request for ${dto.email}`);
    return this.adminService.loginAdmin(dto);
  }

  @GrpcMethod('AdminService', 'ValidateAdmin')
  async validateAdmin(dto: any) {
    this.logger.log(`Received validate-admin request for ${dto.email}`);
    return this.adminService.validateAdmin(dto);
  }

  @GrpcMethod('AdminService', 'GetAdminById')
  async getAdminById(dto: any) {
    this.logger.log(`Received get-admin-by-id request for ${dto.id}`);
    return this.adminService.getAdminById(dto);
  }

  @GrpcMethod('AdminService', 'GetAllBrokers')
  async getAllBrokers(dto: any) {
    this.logger.log('Received getAllBrokers request');
    return this.adminService.getAllBrokers(dto);
  }

  @GrpcMethod('AdminService', 'GetPendingVerifications')
  async getPendingVerifications(dto: any) {
    this.logger.log('Received getPendingVerifications request');
    return this.adminService.getPendingVerifications(dto);
  }

  @GrpcMethod('AdminService', 'GetProperties')
  async getProperties(dto: any) {
    this.logger.log('Received getProperties request');
    return this.adminService.getProperties(dto);
  }

  @GrpcMethod('AdminService', 'GetRecentSignups')
  async getRecentSignups(dto: any) {
    this.logger.log('Received getRecentSignups request');
    return this.adminService.getRecentSignups(dto);
  }

  @GrpcMethod('AdminService', 'GetPropertyLocations')
  async getPropertyLocations() {
    this.logger.log('Received getPropertyLocations request');
    return this.adminService.getPropertyLocations();
  }

  @GrpcMethod('AdminService', 'GetAllAdmins')
  async getAllAdmins() {
    this.logger.log('Received getAllAdmins request');
    return this.adminService.getAllAdmins();
  }

  @GrpcMethod('AdminService', 'GenerateInvitationCode')
  async generateInvitationCode(dto: any) {
    this.logger.log(`Received generateInvitationCode request from ${dto.superAdminId}`);
    return this.adminService.generateInvitationCode(dto);
  }

  @GrpcMethod('AdminService', 'GetPendingDocuments')
  async getPendingDocuments() {
    this.logger.log('Received getPendingDocuments request');
    return this.adminService.getPendingDocuments();
  }

  @GrpcMethod('AdminService', 'GetSystemMessages')
  async getSystemMessages(dto: any) {
    this.logger.log('Received getSystemMessages request');
    return this.adminService.getSystemMessages(dto);
  }

  @GrpcMethod('AdminService', 'GetClientMessages')
  async getClientMessages(dto: any) {
    this.logger.log('Received getClientMessages request');
    return this.adminService.getClientMessages(dto);
  }

  @GrpcMethod('AdminService', 'GetBrokerDetails')
  async getBrokerDetails(dto: any) {
    this.logger.log(`Received getBrokerDetails request for ${dto.brokerId}`);
    return this.adminService.getBrokerDetails(dto);
  }

  @GrpcMethod('AdminService', 'GetBrokerDetailsFromCache')
  async getBrokerDetailsFromCache(dto: any) {
    this.logger.log(`Received getBrokerDetailsFromCache request for ${dto.brokerId}`);
    return this.adminService.getBrokerDetailsFromCache(dto);
  }

  @GrpcMethod('AdminService', 'ApproveBrokerDocument')
  async approveBrokerDocument(dto: any) {
    this.logger.log(`Received approveBrokerDocument request for broker ${dto.brokerId}`);
    return this.adminService.approveBrokerDocument(dto);
  }

  @GrpcMethod('AdminService', 'DeleteBroker')
  async deleteBroker(dto: any) {
    this.logger.log(`Received deleteBroker request for ${dto.brokerId}`);
    return this.adminService.deleteBroker(dto);
  }

  @GrpcMethod('AdminService', 'EditBrokerTier')
  async editBrokerTier(dto: any) {
    this.logger.log(`Received editBrokerTier request for ${dto.brokerId}`);
    return this.adminService.editBrokerTier(dto);
  }

  @GrpcMethod('AdminService', 'GetBrokerProperties')
  async getBrokerProperties(dto: any) {
    this.logger.log(`Received getBrokerProperties request for ${dto.brokerId}`);
    return this.adminService.getBrokerProperties(dto);
  }

  @GrpcMethod('AdminService', 'GetMonthlyIncome')
  async getMonthlyIncome() {
    this.logger.log('Received getMonthlyIncome request');
    return this.adminService.getMonthlyIncome();
  }

  @GrpcMethod('AdminService', 'GetCurrentCommission')
  async getCurrentCommission() {
    this.logger.log('Received getCurrentCommission request');
    return this.adminService.getCurrentCommission();
  }

  @GrpcMethod('AdminService', 'GetTransactions')
  async getTransactions(dto: any) {
    this.logger.log('Received getTransactions request');
    return this.adminService.getTransactions(dto);
  }

  @GrpcMethod('AdminService', 'UpdateAdminEmail')
  async updateAdminEmail(dto: any) {
    this.logger.log(`Received updateAdminEmail request for ${dto.adminId}`);
    return this.adminService.updateAdminEmail(dto);
  }

  @GrpcMethod('AdminService', 'UpdateAdminSms')
  async updateAdminSms(dto: any) {
    this.logger.log(`Received updateAdminSms request for ${dto.adminId}`);
    return this.adminService.updateAdminSms(dto);
  }

  @GrpcMethod('AdminService', 'GetLogs')
  async getLogs(dto: any) {
    this.logger.log('Received getLogs request');
    return this.adminService.getLogs(dto);
  }

  @GrpcMethod('AdminService', 'AddAdmin')
  async addAdmin(dto: any) {
    this.logger.log(`Received addAdmin request for ${dto.email}`);
    return this.adminService.addAdmin(dto);
  }

  @GrpcMethod('AdminService', 'DeleteAdmin')
  async deleteAdmin(dto: any) {
    this.logger.log(`Received deleteAdmin request for ${dto.adminId}`);
    return this.adminService.deleteAdmin(dto);
  }

  @GrpcMethod('AdminService', 'FreezeAdmin')
  async freezeAdmin(dto: any) {
    this.logger.log(`Received freezeAdmin request for ${dto.adminId}`);
    return this.adminService.freezeAdmin(dto);
  }

  @GrpcMethod('AdminService', 'SendMessage')
  async sendMessage(dto: any) {
    this.logger.log(`Received sendMessage request from admin ${dto.adminId}`);
    return this.adminService.sendMessage(dto);
  }

  @GrpcMethod('AdminService', 'Withdraw')
  async withdraw(dto: any) {
    this.logger.log(`Received admin withdraw request: amount=${dto.amount}, phone=${dto.phoneNumber}`);
    return this.adminService.withdraw(dto);
  }

  @GrpcMethod('AdminService', 'GetWallet')
  async getWallet(dto: any) {
    this.logger.log(`Received admin getWallet request: ${dto.walletId || 'default'}`);
    return this.adminService.getWallet(dto);
  }

  @GrpcMethod('AdminService', 'GetNotifications')
  async getNotifications(dto: any) {
    this.logger.log('Received getNotifications request');
    return this.adminService.getNotifications(dto);
  }

  @GrpcMethod('AdminService', 'GetActiveCustomerSessions')
  async getActiveCustomerSessions() {
    this.logger.log('Received getActiveCustomerSessions request');
    return this.adminService.getActiveCustomerSessions();
  }

  @GrpcMethod('AdminService', 'GetInvoices')
  async getInvoices(dto: any) {
    this.logger.log('Received getInvoices request');
    return this.adminService.getInvoices(dto);
  }

  @GrpcMethod('AdminService', 'DeleteInvoice')
  async deleteInvoice(dto: any) {
    this.logger.log(`Received deleteInvoice request: ${dto.invoiceId}`);
    return this.adminService.deleteInvoice(dto);
  }

  @GrpcMethod('AdminService', 'DeleteInvoices')
  async deleteInvoices(dto: any) {
    this.logger.log(`Received deleteInvoices request: ${(dto.invoiceIds || []).length} ids`);
    return this.adminService.deleteInvoices(dto);
  }

  @GrpcMethod('AdminService', 'GetBrokerCommissions')
  async getBrokerCommissions() {
    this.logger.log('Received getBrokerCommissions request');
    return this.adminService.getBrokerCommissions();
  }

  @GrpcMethod('AdminService', 'ApproveAllPendingVerifications')
  async approveAllPendingVerifications(dto: any) {
    this.logger.log('Received approveAllPendingVerifications request');
    return this.adminService.approveAllPendingVerifications(dto);
  }
}
