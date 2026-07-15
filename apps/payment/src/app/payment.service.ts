import { Injectable, Logger, HttpException, HttpStatus, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import Redis from 'ioredis';
import { TransactionEntity } from './entity/transaction.entity';

export interface ProcessPaymentDto {
  phoneNumber: string;
  tier: string;
  amount: number;
  brokerId: string;
  brokerCode: string;
}

export interface ProcessPropertyPaymentDto {
  customerPhone: string;
  customerEmail: string;
  customerName: string;
  amount: number;
  reasonForPayment: string;
  propertyId: string;
  brokerCode: string;
}

export interface WithdrawDto {
  walletType: 'broker' | 'platform_commission';
  amount: number;
  phoneNumber: string;
  provider: 'MTN' | 'AIRTEL';
  payeeName?: string;
  payeeEmail?: string;
  externalId?: string;
  payerNote?: string;
  payeeNote?: string;
  currency?: string;
  bankId?: string;
  bankIdentificationCode?: string;
  bankTransferType?: string;
  sendAt?: string;
}

export interface GetWalletDto {
  walletType?: 'broker' | 'platform_commission';
  walletId?: string;
}

const IOTEC_BASE_URL = process.env.IOTEC_SERVICE_URL || 'http://localhost:2000';
const IOTEC_WALLET_ID = process.env.IOTEC_WALLET_ID;
const MIN_WITHDRAWAL = 10000;
const PLATFORM_COMMISSION_WALLET_USER_ID = process.env.PLATFORM_COMMISSION_WALLET_USER_ID || 'platform-commission';

@Injectable()
export class PaymentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentService.name);
  private subscriber!: Redis;

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    private readonly httpService: HttpService,
    @Inject('REDIS_CLIENT') private readonly redisClient: ClientProxy,
    @Inject('ADMIN_CLIENT') private readonly adminClient: ClientProxy,
  ) {}

  async onModuleInit() {
    this.subscriber = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });

    this.subscriber.subscribe('create_broker_wallet', (err) => {
      if (err) {
        console.error('Failed to subscribe to create_broker_wallet', err);
      }
    });

    this.subscriber.on('message', async (channel, message) => {
      if (channel === 'create_broker_wallet') {
        try {
          const data = JSON.parse(message);
          await this.createIotecWallet(data.brokerCode, data.currency || 'UGX', data.phoneNumber);
        } catch (error) {
          this.logger.error(`Failed to create broker wallet for ${message}: ${(error as Error).message}`);
        }
      }
    });

    this.logger.log('Subscribed to create_broker_wallet Redis channel');

    await this.ensurePlatformCommissionWallet();
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
  }

  private async createIotecWallet(userId: string, currency = 'UGX', phone?: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${IOTEC_BASE_URL}/wallets`, {
          userId,
          currency,
          initialBalance: 0,
          phone,
        }),
      );

      this.logger.log(`Created iotec wallet for user ${userId}: ${response.data?.id}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create iotec wallet for user ${userId}: ${(error as Error).message}`);
      throw error;
    }
  }

  private async ensurePlatformCommissionWallet(): Promise<void> {
    try {
      this.logger.log('Ensuring platform commission wallet exists...');
      await this.createIotecWallet(PLATFORM_COMMISSION_WALLET_USER_ID, 'UGX');
      this.logger.log('Platform commission wallet ensured');
    } catch (error) {
      this.logger.error(`Failed to ensure platform commission wallet: ${(error as Error).message}`);
    }
  }

   async processSubscriptionPayment(dto: ProcessPaymentDto): Promise<{
    success: boolean;
    message: string;
    transactionId?: string;
    referenceNumber?: string;
  }> {
    const externalId = `collect-sub-${dto.brokerId}-${Date.now()}`;
    const referenceNumber = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    try {
      const collectResult = await firstValueFrom(
        this.httpService.post(`${IOTEC_BASE_URL}/iotec/collect`, {
          amount: dto.amount,
          payer: dto.phoneNumber,
          externalId,
          payerNote: `Subscription upgrade to ${dto.tier}`,
          payeeNote: dto.brokerCode,
          currency: 'UGX',
          category: 'MobileMoney',
          walletId: IOTEC_WALLET_ID,
          transactionChargesCategory: 'ChargeWallet',
        }),
      );

      const commissions = await lastValueFrom(
        this.adminClient.send('GetCommissions', {}),
      );

      const iotecStatus = collectResult.data?.status || 'Pending';
      const isSuccess = iotecStatus === 'Success' || collectResult.data?.code;

      const platformCommissionAmount = collectResult.data?.amount * (commissions.platformCommission / 100);

      const transaction = this.transactionRepo.create({
        propertyID: dto.brokerCode,
        clientPhone: dto.phoneNumber,
        provider: 'iotec-collection',
        referenceNumber,
        amount: collectResult.data?.amount || collectResult.data?.amount,
        platformCommission: platformCommissionAmount,
        createdAt: new Date(),
        paymentStatus: isSuccess ? 'SUCCESS' : 'PENDING',
        reasonForPayment: `Subscription upgrade to ${dto.tier}`,
      });

      const saved = await this.transactionRepo.save(transaction);
      this.logger.log(`Processed subscription payment for broker ${dto.brokerId}: ${referenceNumber}, iotec status: ${iotecStatus}`);

      this.redisClient.emit('update_platform_commission', {
        amount: platformCommissionAmount,
        brokerId: dto.brokerId,
        externalId,
      });

      return {
        success: isSuccess,
        message: isSuccess ? 'Payment processed successfully' : 'Payment is being processed',
        transactionId: saved.id,
        referenceNumber: saved.referenceNumber,
      };
    } catch (error) {
      this.logger.error(`Subscription payment failed for broker ${dto.brokerId}: ${(error as Error).message}`);

      const commissions = await lastValueFrom(
        this.adminClient.send('GetCommissions', {}),
      );

      const failedTransaction = this.transactionRepo.create({
        propertyID: dto.brokerCode,
        clientPhone: dto.phoneNumber,
        provider: 'iotec-collection',
        referenceNumber,
        amount: dto.amount,
        platformCommission: dto.amount * (commissions.platformCommission / 100),
        createdAt: new Date(),
        paymentStatus: 'FAILED',
        reasonForPayment: `Subscription upgrade to ${dto.tier}`,
      });

      await this.transactionRepo.save(failedTransaction);

      return {
        success: false,
        message: `Payment processing failed: ${(error as Error).message}`,
        transactionId: failedTransaction.id,
        referenceNumber,
      };
    }
  }

   async processPropertyPayment(dto: ProcessPropertyPaymentDto): Promise<{
    success: boolean;
    message: string;
    transactionId?: string;
    referenceNumber?: string;
    transactionCode?: string;
    netAmount?: number;
    customerPhone?: string;
    customerName?: string;
    customerEmail?: string;
    platformCommission:number;
    bookingCommission:number;
    date?: string;
  }> {
    const externalId = `collect-prop-${dto.propertyId}-${Date.now()}`;
    const referenceNumber = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const transactionCode = Math.floor(10000000 + Math.random() * 90000000).toString();

    let netAmount = dto.amount;
    let bookingCommissionAmount = 0;
    let platformCommissionAmount = 0;

    try {
      const commissions = await lastValueFrom(
        this.adminClient.send('GetCommissions', {}),
      );

     

      const collectResult = await firstValueFrom(
        this.httpService.post(`${IOTEC_BASE_URL}/iotec/collect`, {
          amount: dto.amount,
          payer: dto.customerPhone,
          externalId,
          payerNote: dto.reasonForPayment,
          payeeNote: dto.brokerCode,
          currency: 'UGX',
          category: 'MobileMoney',
          walletId: IOTEC_WALLET_ID,
          transactionChargesCategory: 'ChargeWallet',
        }),
      );

      if (dto.reasonForPayment !== 'booking') {
        platformCommissionAmount = collectResult.data?.amount * (commissions.platformCommission / 100);
        netAmount = collectResult.data?.amount - platformCommissionAmount;
      } else if (dto.reasonForPayment === 'booking') {
        bookingCommissionAmount = collectResult.data?.amount * (commissions.bookingCommission / 100);
        netAmount = netAmount - bookingCommissionAmount;
      }

      const iotecStatus = collectResult.data?.status || 'Pending';
      const isSuccess = iotecStatus === 'Success' || collectResult.data?.code;

      const transaction = this.transactionRepo.create({
        propertyID: dto.brokerCode,
        clientPhone: dto.customerPhone,
        provider: 'iotec-collection',
        referenceNumber,
        amount: collectResult.data?.amount,
        platformCommission: platformCommissionAmount,
        createdAt: new Date(),
        paymentStatus: isSuccess ? 'SUCCESS' : 'PENDING',
        reasonForPayment: dto.reasonForPayment,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        transactionCode,
      });

      const saved = await this.transactionRepo.save(transaction);
      this.logger.log(`Processed property payment ${referenceNumber} for property ${dto.propertyId}, iotec status: ${iotecStatus}`);

      if (bookingCommissionAmount !== 0 || platformCommissionAmount !== 0) {
        this.logger.log(`Commission deducted: platform=${platformCommissionAmount}, booking=${bookingCommissionAmount}`);

        this.redisClient.emit('update_platform_commission', {
          amount: platformCommissionAmount,
          brokerId: dto.brokerCode,
          externalId,
        });
      }


      this.redisClient.emit('update_broker_wallet', {
        brokerCode: dto.brokerCode,
        amount: netAmount,
        externalId,
      });

      this.redisClient.emit('broker_property_payment', {
        brokerCode: dto.brokerCode,
        propertyId: dto.propertyId,
        amount: collectResult.data?.amount || dto.amount,
        netAmount,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        transactionCode,
        timestamp: new Date().toISOString(),
      });

      if (dto.reasonForPayment === 'booking') {
        this.redisClient.emit('broker_booking_created', {
          brokerCode: dto.brokerCode,
          propertyId: dto.propertyId,
          propertyTitle: '',
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          amount: dto.amount,
          transactionCode,
          timestamp: new Date().toISOString(),
        });
      }

      return {
        success: isSuccess,
        message: isSuccess ? 'Payment processed successfully' : 'Payment is being processed',
        transactionId: saved.id,
        referenceNumber: saved.referenceNumber,
        transactionCode,
        netAmount,
        platformCommission: platformCommissionAmount,
        bookingCommission: bookingCommissionAmount,
        customerPhone: dto.customerPhone,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        date: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Property payment failed for property ${dto.propertyId}: ${(error as Error).message}`);

      const failedTransaction = this.transactionRepo.create({
        propertyID: dto.brokerCode,
        clientPhone: dto.customerPhone,
        provider: 'iotec-collection',
        referenceNumber,
        amount: dto.amount,
        platformCommission: platformCommissionAmount,
        createdAt: new Date(),
        paymentStatus: 'FAILED',
        reasonForPayment: dto.reasonForPayment,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        transactionCode,
      });

      await this.transactionRepo.save(failedTransaction);

      return {
        success: false,
        message: `Payment processing failed: ${(error as Error).message}`,
        platformCommission: platformCommissionAmount,
        bookingCommission: bookingCommissionAmount,
      };
    }
  }

 

  async withdraw(dto: WithdrawDto): Promise<{
    success: boolean;
    message: string;
    transactionId?: string;
    referenceNumber?: string;
    status?: string;
    netAmount?: number;
  }> {
    const externalId = dto.externalId || `withdraw-${dto.walletType}-${Date.now()}`;
    const referenceNumber = `WD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const withdrawalAmount = Number(dto.amount);

    if (withdrawalAmount < MIN_WITHDRAWAL) {
      throw new HttpException(`Minimum withdrawal amount is UGX ${MIN_WITHDRAWAL.toLocaleString()}`, HttpStatus.BAD_REQUEST);
    }

    let iotecEndpoint: string;
    let payload: any;

    if (dto.walletType === 'platform_commission') {
//      const netAmount = withdrawalAmount - WITHDRAWAL_FEE;
const netAmount = withdrawalAmount; //deduction will be done at the iotec end  
iotecEndpoint = `${IOTEC_BASE_URL}/iotec/admin-mobile-money`;

      payload = {
        amount: netAmount,
        phoneNumber: dto.phoneNumber,
        provider: dto.provider,
        reference: externalId,
        externalId,
        payeeName: dto.payeeName || 'Platform Commission',
        payeeEmail: dto.payeeEmail || null,
        payerNote: dto.payerNote || '',
        payeeNote: dto.payeeNote || 'Platform commission withdrawal',
        currency: dto.currency || 'ITX',
        payee: dto.phoneNumber,
        bankId: dto.bankId || null,
        bankIdentificationCode: dto.bankIdentificationCode || null,
        bankTransferType: dto.bankTransferType || 'InternalTransfer',
        sendAt: dto.sendAt || new Date().toISOString(),
      };
    } else {
      iotecEndpoint = `${IOTEC_BASE_URL}/iotec/mobile-money`;

      payload = {
        amount: withdrawalAmount,
        phoneNumber: dto.phoneNumber,
        provider: dto.provider,
        reference: externalId,
        externalId,
        payeeName: dto.payeeName || 'Customer',
        payeeEmail: dto.payeeEmail || null,
        payerNote: dto.payerNote || '',
        payeeNote: dto.payeeNote || `Broker wallet withdrawal (${dto.walletType})`,
        currency: dto.currency || 'ITX',
        payee: dto.phoneNumber,
        bankId: dto.bankId || null,
        bankIdentificationCode: dto.bankIdentificationCode || null,
        bankTransferType: dto.bankTransferType || 'InternalTransfer',
        sendAt: dto.sendAt || new Date().toISOString(),
      };
    }

    try {
      const withdrawResult = await firstValueFrom(
        this.httpService.post(iotecEndpoint, payload),
      );

      const status = withdrawResult.data?.status || 'Pending';

      const transaction = this.transactionRepo.create({
        propertyID: dto.walletType,
        clientPhone: dto.phoneNumber,
        provider: `iotec-${dto.walletType === 'platform_commission' ? 'admin-' : ''}mobile-money`,
        referenceNumber,
        amount:withdrawResult.data?.amount,
        platformCommission: 0,
        createdAt: new Date(),
        paymentStatus: status === 'Success' ? 'SUCCESS' : status === 'Failed' ? 'FAILED' : 'PENDING',
        reasonForPayment: `Wallet withdrawal - ${dto.walletType}`,
      });

      const saved = await this.transactionRepo.save(transaction);
      this.logger.log(`Withdrawal processed for ${dto.walletType}: ${referenceNumber}, status: ${status}`);

      return {
        success: status === 'Success',
        message: status === 'Success' ? 'Withdrawal processed successfully' : status === 'Failed' ? 'Withdrawal failed' : 'Withdrawal is being processed',
        transactionId: saved.id,
        referenceNumber: saved.referenceNumber,
        status,
        netAmount:  withdrawResult.data?.amount || withdrawalAmount,
      };
    } catch (error) {
      this.logger.error(`Withdrawal failed for ${dto.walletType}: ${(error as Error).message}`);

      const failedTransaction = this.transactionRepo.create({
        propertyID: dto.walletType,
        clientPhone: dto.phoneNumber,
        provider: `iotec-${dto.walletType === 'platform_commission' ? 'admin-' : ''}mobile-money`,
        referenceNumber,
        amount:  withdrawalAmount,
        platformCommission: 0,
        createdAt: new Date(),
        paymentStatus: 'FAILED',
        reasonForPayment: `Wallet withdrawal - ${dto.walletType}`,
      });

      await this.transactionRepo.save(failedTransaction);

      return {
        success: false,
        message: `Withdrawal failed: ${(error as Error).message}`,
        transactionId: failedTransaction.id,
        referenceNumber,
        status: 'Failed',
        netAmount: withdrawalAmount,
      };
    }
  }

  async getWallet(dto: GetWalletDto): Promise<{
    balance?: number;
    currency?: string;
    walletId?: string;
    name?: string;
  }> {
    const targetWalletId = dto.walletId || IOTEC_WALLET_ID;

    if (!targetWalletId) {
      throw new HttpException('Wallet ID is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${IOTEC_BASE_URL}/iotec/wallet/${targetWalletId}/balance`),
      );

      this.logger.log(`Retrieved wallet balance for ${targetWalletId}: ${response.data?.actualBalance}`);

      return {
        balance: response.data?.actualBalance,
        currency: response.data?.currency,
        walletId: response.data?.id || targetWalletId,
        name: response.data?.name,
      };
    } catch (error) {
      this.logger.error(`Failed to get wallet balance for ${targetWalletId}: ${(error as Error).message}`);
      const apiError = error as any;
      throw new HttpException(
        apiError.response?.data || 'Failed to retrieve wallet balance',
        apiError.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getTransactions(query: { page: number; limit: number; brokerId?: string; reason?: string }): Promise<{
    transactions: any[];
    total: number;
  }> {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const where: any = {};

    if (query.brokerId) {
      where.propertyID = query.brokerId;
    }
    if (query.reason) {
      where.reasonForPayment = query.reason;
    }

    const [transactions, total] = await this.transactionRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      transactions: transactions.map(t => ({
        id: t.id,
        propertyId: t.propertyID,
        clientPhone: t.clientPhone,
        amount: t.amount,
        platformCommission: t.platformCommission,
        paymentStatus: t.paymentStatus,
        reasonForPayment: t.reasonForPayment,
        createdAt: t.createdAt,
        referenceNumber: t.referenceNumber,
        transactionCode: t.transactionCode,
        customerName: t.customerName,
        customerEmail: t.customerEmail,
      })),
      total,
    };
  }

  private generateReference(): string {
    return 'TXN-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private generateTransactionCode(): string {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }
}