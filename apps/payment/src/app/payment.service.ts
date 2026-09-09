import { Injectable, Logger, HttpException, HttpStatus, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, lastValueFrom, timeout } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientGrpc, ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { TransactionEntity } from './entity/transaction.entity';

export interface ProcessPaymentDto {
  phoneNumber: string;
  tier: string;
  amount: number;
  brokerId: string;
  brokerCode: string;
}

export interface ProcessCustomerPaymentDto {
  phoneNumber: string;
  amount: number;
  userId: string;
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
  brokerCode?: string;
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
const MIN_WITHDRAWAL = 100;
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
    @Inject('ADMIN_CLIENT') private readonly adminClient: ClientGrpc,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const redisHost = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const redisPort = Number(this.configService.get<string>('REDIS_PORT') || '7000');
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD') || undefined;
    const redisDb = Number(this.configService.get<string>('REDIS_DB') || '0');

    this.logger.log(
      `Redis config -> host: ${redisHost}, port: ${redisPort}, db: ${redisDb}, password: ${redisPassword ? '*****' : '(none)'}`,
    );

    this.subscriber = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      db: redisDb,
      connectTimeout: 10000,
      retryStrategy: (times) => Math.min(times * 500, 5000),
      maxRetriesPerRequest: 10,
      reconnectOnFailedAttempt: true,
      keepAlive: 60,
    });

    this.subscriber.on('error', (err) => {
      this.logger.error(`Redis subscriber error: ${err.message}`);
    });

    try {
      await this.testRedisConnection(this.subscriber, 'subscriber');
      this.logger.log('Redis subscriber connection test passed');
    } catch (err) {
      this.logger.error(`Redis subscriber connection test failed: ${(err as Error).message}`);
    }

    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      db: redisDb,
      connectTimeout: 10000,
      retryStrategy: (times) => Math.min(times * 500, 5000),
      maxRetriesPerRequest: 10,
      reconnectOnFailedAttempt: true,
      keepAlive: 60,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis client error: ${err.message}`);
    });

    try {
      await this.testRedisConnection(this.redis, 'client');
      this.logger.log('Redis client connection test passed');
    } catch (err) {
      this.logger.error(`Redis client connection test failed: ${(err as Error).message}`);
    }

    try {
      const testExternalId = `test-commission-${Date.now()}`;
      this.logger.log(`[Redis:test] Emitting test update_platform_commission amount=75 brokerId=32157953 externalId=${testExternalId}`);
      this.redisClient.emit('update_platform_commission', {
        amount: 0,
        brokerId: '32157953',
        externalId: testExternalId,
      });
      this.logger.log(`[Redis:test] Test emit sent successfully`);
    } catch (err) {
      this.logger.error(`[Redis:test] Test emit failed: ${(err as Error).message}`);
    }

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

  private async testRedisConnection(redis: Redis, label: string): Promise<void> {
    const redisHost = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const redisPort = Number(this.configService.get<string>('REDIS_PORT') || '6379');

    this.logger.log(`[Redis:${label}] Testing connection to ${redisHost}:${redisPort}...`);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout to ${redisHost}:${redisPort} after 10s`));
      }, 10000);

      redis.once('connect', () => {
        clearTimeout(timeout);
        this.logger.log(`[Redis:${label}] TCP connection established to ${redisHost}:${redisPort}`);
        resolve();
      });

      redis.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    try {
      const pong = await redis.ping();
      this.logger.log(`[Redis:${label}] PING response: ${pong}`);
    } catch (err) {
      this.logger.error(`[Redis:${label}] PING failed: ${(err as Error).message}`);
      throw err;
    }
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
       this.logger.log(`[subscription-payment] START brokerId=${dto.brokerId} amount=${dto.amount} tier=${dto.tier}`);
       const collectResult = await firstValueFrom(
         this.httpService.post(`${IOTEC_BASE_URL}/iotec/collect`, {
           amount: dto.amount,
           payer: dto.phoneNumber,
           externalId,
           payerNote: `Subscription upgrade to ${dto.tier}`,
           payeeNote: process.env.PLATFORM_PHONE_NUMBER, // platform owner is recieving everyhting, so dto.brokerCode----> const 0741882818
           currency: 'UGX',
           category: 'MobileMoney',
           walletId: IOTEC_WALLET_ID,
           transactionChargesCategory: 'ChargeWallet',
         }).pipe(
            timeout(120000),
         ),
       );
       this.logger.log(`[subscription-payment] IOTEC response status=${collectResult.data?.status}`);

        const iotecStatus = collectResult.data?.status || 'Pending';
        const isSuccess = iotecStatus === 'Success' || collectResult.data?.code;

        const commissions = await firstValueFrom(
          this.adminClient.getService('AdminService').GetCommissions({}).pipe(
            timeout(5000),
          ),
        );

        if(!Number(commissions?.platformCommission)){
          this.logger.warn('The admin service might have returned an unpredictable response');
        }

         const commissionRate = Number(commissions?.platformCommission) || 100;
         const platformCommissionAmount = Number((collectResult.data?.amount || 0) * (commissionRate / 100));

         if (!Number.isFinite(platformCommissionAmount) || platformCommissionAmount < 0) {
           this.logger.warn(`[subscription-payment] Invalid platformCommissionAmount=${platformCommissionAmount}, skipping emit`);
         } else {
           this.redisClient.emit('update_platform_commission', {
             amount: platformCommissionAmount,
             brokerId: dto.brokerId,
             externalId,
           });
         }

        const transaction = this.transactionRepo.create({
          propertyID: dto.brokerCode,
          clientPhone: dto.phoneNumber,
          provider: 'iotec-collection',
          referenceNumber,
          amount: collectResult.data?.amount || dto.amount,
          platformCommission: platformCommissionAmount,
          createdAt: new Date(),
          paymentStatus: isSuccess ? 'SUCCESS' : 'PENDING',
          reasonForPayment: `Subscription upgrade to ${dto.tier}`,
        });

        const saved = await this.transactionRepo.save(transaction);
        this.logger.log(`[subscription-payment] transaction saved id=${saved.id}`);

        return {
         success: isSuccess,
         message: isSuccess ? 'Payment processed successfully' : 'Payment is being processed',
         transactionId: saved.id,
         referenceNumber: saved.referenceNumber,
       };
      } catch (error) {
        this.logger.error(`[subscription-payment] FAILED broker=${dto.brokerId} error=${(error as Error).message}`);

        let fallbackCommissionRate = 0;
        try {
          const commissions = await firstValueFrom(
            this.adminClient.getService('AdminService').GetCommissions({}).pipe(
              timeout(5000),
            ),
          );
          fallbackCommissionRate = Number(commissions?.platformCommission) || 0;
        } catch (adminErr) {
          this.logger.warn(`[subscription-payment] catch block GetCommissions failed: ${(adminErr as Error).message}`);
        }

        const failedTransaction = this.transactionRepo.create({
          propertyID: dto.brokerCode,
          clientPhone: dto.phoneNumber,
          provider: 'iotec-collection',
          referenceNumber,
          amount: dto.amount,
          platformCommission: dto.amount * (fallbackCommissionRate / 100),
          createdAt: new Date(),
          paymentStatus: 'FAILED',
          reasonForPayment: `Subscription upgrade to ${dto.tier}`,
        });

       await this.transactionRepo.save(failedTransaction);
       this.logger.log(`[subscription-payment] failed transaction saved`);

       return {
         success: false,
         message: `Payment processing failed: ${(error as Error).message}`,
         transactionId: failedTransaction.id,
         referenceNumber,
       };
     }
   }

  async processCustomerPayment(dto: ProcessCustomerPaymentDto): Promise<{
    success: boolean;
    message: string;
    transactionId?: string;
    referenceNumber?: string;
  }> {
    const externalId = `collect-cust-${dto.userId}-${Date.now()}`;
    const referenceNumber = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    try {
      const collectResult = await firstValueFrom(
        this.httpService.post(`${IOTEC_BASE_URL}/iotec/collect`, {
          amount: dto.amount,
          payer: dto.phoneNumber,
          externalId,
          payerNote: 'Customer payment',
          payeeNote: dto.userId,
          currency: 'UGX',
          category: 'MobileMoney',
          walletId: IOTEC_WALLET_ID,
          transactionChargesCategory: 'ChargeWallet',
        }).pipe(
          timeout(120000),
        ),
      );

      const iotecStatus = collectResult.data?.status || 'Pending';
      const isSuccess = iotecStatus === 'Success' || collectResult.data?.code;

      const transaction = this.transactionRepo.create({
        propertyID: dto.userId,
        clientPhone: dto.phoneNumber,
        provider: 'iotec-collection',
        referenceNumber,
        amount: collectResult.data?.amount || dto.amount,
        platformCommission: 0,
        createdAt: new Date(),
        paymentStatus: isSuccess ? 'SUCCESS' : 'PENDING',
        reasonForPayment: 'Customer payment',
      });

      const saved = await this.transactionRepo.save(transaction);
      this.logger.log(`Processed customer payment for user ${dto.userId}: ${referenceNumber}, iotec status: ${iotecStatus}`);

      return {
        success: isSuccess,
        message: isSuccess ? 'Payment processed successfully' : 'Payment is being processed',
        transactionId: saved.id,
        referenceNumber: saved.referenceNumber,
      };
    } catch (error) {
      this.logger.error(`Customer payment failed for user ${dto.userId}: ${(error as Error).message}`);

      const failedTransaction = this.transactionRepo.create({
        propertyID: dto.userId,
        clientPhone: dto.phoneNumber,
        provider: 'iotec-collection',
        referenceNumber,
        amount: dto.amount,
        platformCommission: 0,
        createdAt: new Date(),
        paymentStatus: 'FAILED',
        reasonForPayment: 'Customer payment',
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
         this.adminClient.getService('AdminService').GetCommissions({}),
       );

      const collectResult = await firstValueFrom(
        this.httpService.post(`${IOTEC_BASE_URL}/iotec/collect`, {
          amount: dto.amount,
          payer: dto.customerPhone,
          externalId,
          payerNote: dto.reasonForPayment,
          payeeNote: process.env.PLATFORM_PHONE_NUMBER,
          currency: 'UGX',
          category: 'MobileMoney',
          walletId: IOTEC_WALLET_ID,
          transactionChargesCategory: 'ChargeWallet',
        }).pipe(
          timeout(120000),
        ),
      );

      if (dto.reasonForPayment !== 'booking') {
        const platformRate = Number(commissions?.platformCommission) || 0;
        platformCommissionAmount = Number((collectResult.data?.amount || 0) * (platformRate / 100));
        netAmount = Number((collectResult.data?.amount || 0) - platformCommissionAmount);
      } else if (dto.reasonForPayment === 'booking') {
        const bookingRate = Number(commissions?.bookingCommission) || 0;
        bookingCommissionAmount = Number((collectResult.data?.amount || 0) * (bookingRate / 100));
        netAmount = Number((collectResult.data?.amount || 0) - bookingCommissionAmount);
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

      if (Number.isFinite(platformCommissionAmount) && platformCommissionAmount > 0) {
        this.logger.log(`Commission deducted: platform=${platformCommissionAmount}, booking=${bookingCommissionAmount}`);

        this.redisClient.emit('update_platform_commission', {
          amount: platformCommissionAmount,
          brokerId: dto.brokerCode,
          externalId,
        });
      }

      if (Number.isFinite(netAmount) && netAmount >= 0) {
        this.redisClient.emit('update_broker_wallet', {
          brokerCode: dto.brokerCode,
          amount: netAmount,
          externalId,
        });
      }

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
    this.logger.log(`[withdraw] start: walletType=${dto.walletType} brokerCode=${dto.brokerCode} amount=${dto.amount} ref=${referenceNumber}`);

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

    this.logger.log(`[withdraw] calling iotec endpoint=${iotecEndpoint} payload=${JSON.stringify(payload)}`);
    try {
      const withdrawResult = await firstValueFrom(
        this.httpService.post(iotecEndpoint, payload),
      );
      this.logger.log(`[withdraw] iotec responded: status=${withdrawResult.data?.status} ref=${referenceNumber}`);

      const status = withdrawResult.data?.status || 'Pending';

      const transaction = this.transactionRepo.create({
        propertyID: dto.brokerCode || dto.walletType,
        clientPhone: dto.phoneNumber,
        provider: `iotec-${dto.walletType === 'platform_commission' ? 'admin-' : ''}mobile-money`,
        referenceNumber,
        amount:withdrawResult.data?.amount,
        platformCommission: 0,
        createdAt: new Date(),
        paymentStatus: status === 'Success' ? 'SUCCESS' : status === 'Failed' ? 'FAILED' : 'PENDING',
        reasonForPayment: `Wallet withdrawal - ${dto.walletType}`,
      });

      this.logger.log(`[withdraw] saving successful transaction ref=${referenceNumber}`);
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
      this.logger.error(`[withdraw] ERROR for ${dto.walletType} ref=${referenceNumber}: ${(error as Error).message}`, error);

      const failedTransaction = this.transactionRepo.create({
        propertyID: dto.brokerCode || dto.walletType,
        clientPhone: dto.phoneNumber,
        provider: `iotec-${dto.walletType === 'platform_commission' ? 'admin-' : ''}mobile-money`,
        referenceNumber,
        amount:  withdrawalAmount,
        platformCommission: 0,
        createdAt: new Date(),
        paymentStatus: 'FAILED',
        reasonForPayment: `Wallet withdrawal - ${dto.walletType}`,
      });

      this.logger.log(`[withdraw] saving FAILED transaction ref=${referenceNumber}`);
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

    console.log('targetWalletId', targetWalletId);

    if (!targetWalletId) {
      throw new HttpException('Wallet ID is required', HttpStatus.BAD_REQUEST);
    }

    console.log('targetWalletId', targetWalletId);

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
    try {
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
    } catch (err) {
      this.logger.error(`Failed to get transactions:`, err);
      throw err;
    }
  }

  private generateReference(): string {
    return 'TXN-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private generateTransactionCode(): string {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }
}