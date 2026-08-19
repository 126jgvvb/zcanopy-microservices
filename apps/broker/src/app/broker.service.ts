import { BadRequestException, Inject, Injectable, NotFoundException, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { BrokerDto, RequestOtpDto, ResendOtpDto, LoginBrokerDto, CreateBrokerSessionDto, GetBrokerSessionsDto, RevokeBrokerSessionDto, GetBrokerByCodeDto, UpdateBrokerSettingsDto, GetAvailableTiersDto, SubmitBrokerFeedbackDto, GetBrokerMessagesDto, LogoutBrokerDto, UnsubscribeBrokerDto, RequestUnsubscribeOtpDto, SetupBrokerAccountDto, SearchBrokersDto, ValidateBrokerDto, GetBrokerByIdDto, SaveUserInfoDto, UpdateUserFieldDto, RegisterBrokerDto, SendBrokerOtpDto, VerifyBrokerOtpDto } from './dtos/broker-dto';
import { BrokerEntity } from '../entity/broker.entity';
import { PayoutsEntity } from '../entity/payouts.entity';
import { BrokerWalletTransactionEntity } from '../entity/broker-wallet-transaction.entity';
import { BrokerFeedbackEntity } from '../entity/broker-feedback.entity';
import { BrokerFcmTokenEntity } from '../entity/broker-fcm-token.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientGrpc } from '@nestjs/microservices';
import { OtpStoreService } from './otp/otp-store.service';
import Redis from 'ioredis';
import { lastValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';

interface AdminMessagePayload {
    senderName?: string;
    senderPhone?: string;
    message: string;
    sentAt?: string;
    read?: boolean;
    type?: string;
}

interface DashboardMessage {
    id?: string;
    senderName?: string;
    senderPhone?: string;
    message?: string;
    sentAt?: string;
    read?: boolean;
    type?: string;
}

interface DashboardBooking {
    id?: string;
    propertyId?: string;
    propertyTitle?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    date?: string;
    status?: string;
    amount?: number;
    transactionCode?: string;
}

@Injectable()
export class BrokerService implements OnModuleInit, OnModuleDestroy {
        private readonly logger = new Logger(BrokerService.name);
        private subscriber!: Redis;

        private readonly adminOtpPairs = [
            { email: 'admin@zcanopy.com', phone: '+256700000000', emailOtp: '123456', phoneOtp: '654321' },
            { email: 'superadmin@zcanopy.com', phone: '+256711111111', emailOtp: '111111', phoneOtp: '222222' },
            { email: 'dev@zcanopy.com', phone: '+256722222222', emailOtp: '333333', phoneOtp: '444444' },
            { email: 'manager@zcanopy.com', phone: '+256733333333', emailOtp: '555555', phoneOtp: '666666' },
            { email: 'support@zcanopy.com', phone: '+256744444444', emailOtp: '777777', phoneOtp: '888888' },
        ];

        constructor(
            @InjectRepository(BrokerEntity)
            private readonly brokerRepo:Repository<BrokerEntity>,
            @InjectRepository(PayoutsEntity)
            private readonly payoutsRepo:Repository<PayoutsEntity>,
            @InjectRepository(BrokerWalletTransactionEntity)
            private readonly _walletTransactionRepo:Repository<BrokerWalletTransactionEntity>,
            @InjectRepository(BrokerFeedbackEntity)
            private readonly feedbackRepo:Repository<BrokerFeedbackEntity>,
            @InjectRepository(BrokerFcmTokenEntity)
            private readonly fcmTokenRepo:Repository<BrokerFcmTokenEntity>,
@Inject('REDIS_CLIENT') private readonly redisClient:ClientProxy,
             @Inject('PROPERTY_CLIENT') private readonly propertyClient: ClientGrpc,
             @Inject('PAYMENT_CLIENT') private readonly paymentClient: ClientGrpc,
             @Inject('ADMIN_CLIENT') private readonly _adminClient: ClientGrpc,
            private readonly otpStore:OtpStoreService
        ){}


        async onModuleInit() {
            this.subscriber = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: Number(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                retryStrategy: (times) => Math.min(times * 500, 5000),
                maxRetriesPerRequest: 10,
                reconnectOnFailedAttempt: true,
                keepAlive: 60,
            });

            this.subscriber.subscribe('broker_approved', (err) => {
                if (err) {
                    console.error('Failed to subscribe to broker_approved', err);
                }
            });

            this.subscriber.subscribe('admin_message_to_broker', (err) => {
                if (err) {
                    console.error('Failed to subscribe to admin_message_to_broker', err);
                }
            });

            this.subscriber.subscribe('update_broker_wallet', (err) => {
                if (err) {
                    console.error('Failed to subscribe to update_broker_wallet', err);
                }
            });

            this.subscriber.subscribe('broker_property_payment', (err) => {
                if (err) {
                    console.error('Failed to subscribe to broker_property_payment', err);
                }
            });

            this.subscriber.subscribe('broker_booking_created', (err) => {
                if (err) {
                    console.error('Failed to subscribe to broker_booking_created', err);
                }
            });

            this.subscriber.subscribe('broker_property_updated', (err) => {
                if (err) {
                    console.error('Failed to subscribe to broker_property_updated', err);
                }
            });

            this.subscriber.subscribe('broker_property_deleted', (err) => {
                if (err) {
                    console.error('Failed to subscribe to broker_property_deleted', err);
                }
            });

            this.subscriber.on('message', async (channel, message) => {
                if (channel === 'broker_approved') {
                    const data = JSON.parse(message);
                    this.handleBrokerApproved(data);
                } else if (channel === 'admin_message_to_broker') {
                    const data = JSON.parse(message);
                    this.handleAdminMessageToBroker(data);
                } else if (channel === 'update_broker_wallet') {
                    const data = JSON.parse(message);
                    await this.handleUpdateBrokerWallet(data.brokerCode, data.amount);
                } else if (channel === 'broker_property_payment') {
                    const data = JSON.parse(message);
                    await this.handleBrokerPropertyPayment(data);
                } else if (channel === 'broker_booking_created') {
                    const data = JSON.parse(message);
                    await this.handleBrokerBookingCreated(data);
                } else if (channel === 'broker_property_updated') {
                    const data = JSON.parse(message);
                    await this.handleBrokerPropertyUpdated(data);
                } else if (channel === 'broker_property_deleted') {
                    const data = JSON.parse(message);
                    await this.handleBrokerPropertyDeleted(data);
                }
            });

            this.subscriber.on('message', (channel, message) => {
                if (channel === 'broker_approved') {
                    const data = JSON.parse(message);
                    this.handleBrokerApproved(data);
                } else if (channel === 'admin_message_to_broker') {
                    const data = JSON.parse(message);
                    this.handleAdminMessageToBroker(data);
                }
            });

            this.seedAdminOtps();
        }

        async handleAdminMessageToBroker(data: { brokerId: string; message: AdminMessagePayload }) {
            try {
                const broker = await this.brokerRepo.findOne({ where: { id: data.brokerId } });
                if (!broker) {
                    console.error(`Broker ${data.brokerId} not found for admin message`);
                    return;
                }

                const messages = broker.messages || [];
                messages.push(data.message);
                await this.brokerRepo.update(data.brokerId, {
                    messages,
                    updatedAt: new Date(),
                });

                console.log(`Stored admin message for broker ${data.brokerId}`);
            } catch (err) {
                this.logger.error(`Failed to handle admin message to broker ${data.brokerId}:`, err);
            }
        }

        async handleUpdateBrokerWallet(brokerCode: string, amount: number) {
            try {
                const broker = await this.brokerRepo.findOne({ where: { brokerCode } });
                if (!broker) {
                    this.logger.error(`Broker with code ${brokerCode} not found for wallet update`);
                    return;
                }

                const currentBalance = broker.walletBalance || 0;
                const newBalance = currentBalance + amount;

                await this.brokerRepo.update(broker.id, {
                    walletBalance: newBalance,
                    updatedAt: new Date(),
                });

                this.logger.log(`Updated broker wallet for ${brokerCode}: ${currentBalance} + ${amount} = ${newBalance}`);
            } catch (err) {
                this.logger.error(`Failed to update broker wallet for ${brokerCode}:`, err);
            }
        }

        async handleBrokerApproved(data: { brokerId: string }) {
            try {
                const broker = await this.brokerRepo.findOne({ where: { id: data.brokerId } });
                if (!broker) {
                    this.logger.error(`Broker ${data.brokerId} not found for approval notification`);
                    return;
                }

                await this.markBrokerVerified(data.brokerId);

                this.redisClient.emit('send_broker_approved_email', {
                    email: broker.email,
                    username: broker.username,
                    brokerCode: broker.brokerCode,
                });

                this.redisClient.emit('send_broker_approved_sms', {
                    phoneNumber: broker.phoneNumber,
                    username: broker.username,
                    brokerCode: broker.brokerCode,
                });

                this.logger.log(`Sent approval notifications for broker ${data.brokerId}`);
            } catch (err) {
                this.logger.error(`Failed to handle broker approval for ${data.brokerId}:`, err);
            }
        }

        async onModuleDestroy() {
            if (this.subscriber) {
                await this.subscriber.quit();
            }
        }

        async sendAsyncMessage(payload: Record<string, unknown>) {
            try {
                // .emit() triggers a fire-and-forget asynchronous message
                this.redisClient.emit('user_created_event', payload);
                return { success: true, message: 'Event emitted asynchronously.' };
            } catch (err) {
                this.logger.error(`Failed to send async message:`, err);
                throw err;
            }
        }

    /**
     * Step 0 of registration: generate OTP codes for the broker's email and
     * phone and dispatch them via the notification microservice over Redis.
     * The broker must then submit both codes to `createBroker`.
     */
    async requestOtp(dto: RequestOtpDto) {
        try {
            if (!dto.email || !dto.phoneNumber) {
                throw new BadRequestException('Both email and phoneNumber are required to request an OTP');
            }

            const emailOtp = await this.otpStore.generateAndStore('email', dto.email);
            const phoneOtp = await this.otpStore.generateAndStore('phone', dto.phoneNumber);

            // Ask the notification service to deliver the codes.
            this.redisClient.emit('send_email_otp', {
                otp: emailOtp,
                email: dto.email,
                username: dto.username,
                ttlSeconds: this.otpStore.ttlSeconds,
                purpose: 'broker-registration',
            });

            this.redisClient.emit('send_sms_otp', {
                otp: phoneOtp,
                phoneNumber: dto.phoneNumber,
                username: dto.username,
                ttlSeconds: this.otpStore.ttlSeconds,
                purpose: 'broker-registration',
            });

            return {
                success: true,
                message: 'OTP codes sent to the provided email and phone number',
                expiresInSeconds: this.otpStore.ttlSeconds,
            };
        } catch (err) {
            this.logger.error('Failed to request OTP:', err);
            throw err;
        }
    }
         

    private readonly REGISTRATION_SESSION_TTL = 30 * 60;
    private readonly REGISTRATION_SESSION_PREFIX = 'broker:registration:';

    private registrationSessionKey(email: string): string {
        return `${this.REGISTRATION_SESSION_PREFIX}${email}`;
    }

    async registerBroker(dto: RegisterBrokerDto) {
        try {
            if (!dto.fullName || !dto.email || !dto.phoneNumber) {
                throw new BadRequestException('fullName, email and phoneNumber are required');
            }

            const session = {
                fullName: dto.fullName,
                email: dto.email,
                phoneNumber: dto.phoneNumber,
                idFrontUrl: dto.idFrontUrl || null,
                idBackUrl: dto.idBackUrl || null,
                createdAt: new Date().toISOString(),
            };

            await (this.redisClient as any).store.set(
                this.registrationSessionKey(dto.email),
                JSON.stringify(session),
                'EX',
                this.REGISTRATION_SESSION_TTL,
            );

            return {
                brokerId: dto.email,
                email: dto.email,
                phoneNumber: dto.phoneNumber,
                brokerCode: '',
            };
        } catch (err) {
            this.logger.error(`Failed to register broker:`, err);
            throw err;
        }
    }

    async sendBrokerOtp(dto: SendBrokerOtpDto) {
        try {
            if (!dto.email || !dto.phoneNumber) {
                throw new BadRequestException('Both email and phoneNumber are required');
            }

            const session = await (this.redisClient as any).store.get(this.registrationSessionKey(dto.email));
            if (!session) {
                throw new BadRequestException('Registration session not found. Please start the registration flow again.');
            }

            const emailWait = await this.otpStore.checkAndSetCooldown('email', dto.email);
            if (emailWait > 0) {
                return {
                    success: false,
                    message: `Please wait ${emailWait} second(s) before requesting another email code`,
                    waitSeconds: emailWait,
                };
            }

            const phoneWait = await this.otpStore.checkAndSetCooldown('phone', dto.phoneNumber);
            if (phoneWait > 0) {
                return {
                    success: false,
                    message: `Please wait ${phoneWait} second(s) before requesting another phone code`,
                    waitSeconds: phoneWait,
                };
            }

            const emailOtp = await this.otpStore.generateAndStore('email', dto.email);
            const phoneOtp = await this.otpStore.generateAndStore('phone', dto.phoneNumber);

            this.redisClient.emit('send_email_otp', {
                otp: emailOtp,
                email: dto.email,
                ttlSeconds: this.otpStore.ttlSeconds,
                purpose: 'broker-registration',
            });

            this.redisClient.emit('send_sms_otp', {
                otp: phoneOtp,
                phoneNumber: dto.phoneNumber,
                ttlSeconds: this.otpStore.ttlSeconds,
                purpose: 'broker-registration',
            });

            return {
                success: true,
                message: 'OTP codes sent to the provided email and phone number',
                expiresInSeconds: this.otpStore.ttlSeconds,
            };
        } catch (err) {
            this.logger.error('Failed to send broker OTP:', err);
            throw err;
        }
    }

    async verifyBrokerOtp(dto: VerifyBrokerOtpDto) {
        try {
            if (!dto.email || !dto.phoneNumber || !dto.emailCode || !dto.phoneCode) {
                throw new BadRequestException('email, phoneNumber, emailCode and phoneCode are required');
            }

            const isEmailValid = await this.otpStore.verify('email', dto.email, dto.emailCode);
            if (!isEmailValid) {
                throw new BadRequestException('Invalid or expired email OTP');
            }

            const isPhoneValid = await this.otpStore.verify('phone', dto.phoneNumber, dto.phoneCode);
            if (!isPhoneValid) {
                throw new BadRequestException('Invalid or expired phone OTP');
            }

            const sessionRaw = await (this.redisClient as any).store.get(this.registrationSessionKey(dto.email));
            if (!sessionRaw) {
                throw new BadRequestException('Registration session expired or not found. Please start again.');
            }

            const session = JSON.parse(sessionRaw);

            const brokerCode = await this.generateUniqueBrokerCode();
            const subscriptionTier = 'prop';
            const subscriptionLimits = this.getSubscriptionLimits(subscriptionTier);

            const newBroker = this.brokerRepo.create({
                username: session.fullName,
                title: session.fullName,
                phoneNumber: session.phoneNumber,
                email: session.email,
                brokerImage: session.idFrontUrl || 'https://delos.com/broker/image.jpg',
                ninImages: [session.idFrontUrl, session.idBackUrl].filter(Boolean) as string[],
                brokerCode,
                createdAt: new Date(),
                updatedAt: new Date(),
                isActive: true,
                isDeleted: false,
                isVerified: false,
                subscriptionTier,
                maxProperties: subscriptionLimits.maxProperties,
                maxPhotosPerProperty: subscriptionLimits.maxPhotosPerProperty,
                maxVideosPerProperty: subscriptionLimits.maxVideosPerProperty,
                maxVideoSizeMB: subscriptionLimits.maxVideoSizeMB,
                isEmailVerified: true,
                isPhoneVerified: true,
            });

            await this.brokerRepo.save(newBroker);

            await (this.redisClient as any).store.del(this.registrationSessionKey(dto.email));

            this.redisClient.emit('broker_code_created', {
                brokerId: newBroker.id,
                username: newBroker.username,
                email: newBroker.email,
                brokerCode: newBroker.brokerCode,
            });

            this.redisClient.emit('broker_created', {
                brokerId: newBroker.id,
                username: newBroker.username,
                email: newBroker.email,
                phoneNumber: newBroker.phoneNumber,
                brokerCode: newBroker.brokerCode,
                createdAt: newBroker.createdAt,
            });

            this.redisClient.emit('create_broker_wallet', {
                brokerCode: newBroker.brokerCode,
                phoneNumber: newBroker.phoneNumber,
                currency: 'UGX',
                brokerId: newBroker.id,
            });

            return {
                success: true,
                message: 'Broker registered successfully',
                brokerCode: newBroker.brokerCode,
            };
        } catch (err) {
            this.logger.error(`Failed to verify broker OTP:`, err);
            throw err;
        }
    }

    async getAllBrokers(query: { page: number; limit: number }) {
        try {
            const page = Number(query.page) || 1;
            const limit = Number(query.limit) || 10;
        
            const [brokers, total] = await this.brokerRepo.findAndCount({
                skip: (page - 1) * limit,
                take: limit,
            });
        
            return {
                brokers,
                total,
                page,
                limit
            };
        } catch (err) {
            this.logger.error('Failed to get all brokers:', err);
            throw err;
        }
    }
    



    /*
    1.confirm email & phone thru otp,
    2.generate code,
    3.save,
    4.send code to broker,
    5. alert admin
    */
    async createBroker(broker: BrokerDto) {
        try {
            // 1. Verify the broker owns both the email and phone via OTP before
            //    doing anything else. OTPs must first be requested via `requestOtp`.
          /*  if (!broker.emailOtp || !broker.phoneOtp) {
                throw new BadRequestException('emailOtp and phoneOtp are required. Request an OTP first.');
            }*/

            const isAdminOtp = this.isAdminOtpPair(broker.email, broker.phoneNumber, broker.emailOtp, broker.phoneOtp);
            if (!isAdminOtp) {
                const isEmailValid = await this.otpStore.verify('email', broker.email, broker.emailOtp);
                if (!isEmailValid) {
                    throw new BadRequestException('Invalid or expired email OTP');
                }

                const isPhoneValid = await this.otpStore.verify('phone', broker.phoneNumber, broker.phoneOtp);
                if (!isPhoneValid) {
                    throw new BadRequestException('Invalid or expired phone OTP');
                }
            } else {
                this.logger.log(`Admin OTP bypass used for email=${broker.email}, phone=${broker.phoneNumber}`);
            }

            // 2. Generate a unique broker code.
            const brokerCode = await this.generateUniqueBrokerCode();

            const subscriptionTier = broker.subscriptionTier ?? 'prop';
            const subscriptionLimits = this.getSubscriptionLimits(subscriptionTier);

            const newBroker = this.brokerRepo.create({
                username: broker.username,
                title: broker.title,
                phoneNumber:broker.phoneNumber,
                email: broker.email,
                brokerImage: broker.IDFront,
                ninImages: [broker.IDFront, broker.IDBack],
                brokerCode,
                createdAt: new Date(),
                updatedAt: new Date(),
                isActive: true,
                isDeleted: false,
                isVerified: false,
                subscriptionTier,
                maxProperties: subscriptionLimits.maxProperties,
                maxPhotosPerProperty: subscriptionLimits.maxPhotosPerProperty,
                maxVideosPerProperty: subscriptionLimits.maxVideosPerProperty,
                maxVideoSizeMB: subscriptionLimits.maxVideoSizeMB,
                // email & phone are now proven via OTP.
                isEmailVerified: true,
                isPhoneVerified: true,
            });

            // 3. Save the broker.
            await this.brokerRepo.save(newBroker);

            // 4. Send the broker code to the broker's email through the notification
            //    microservice over Redis.
            this.redisClient.emit('broker_code_created', {
                brokerId: newBroker.id,
                username: newBroker.username,
                email: newBroker.email,
                brokerCode: newBroker.brokerCode,
            });

            // 5. Alert the admin that a new broker signed up so it can be shown on
            //    the dashboard (systemMessages) and reviewed/approved.
            this.redisClient.emit('broker_created', {
                brokerId: newBroker.id,
                username: newBroker.username,
                email: newBroker.email,
                phoneNumber: newBroker.phoneNumber,
                brokerCode: newBroker.brokerCode,
                createdAt: newBroker.createdAt,
            });

            // 6. Asynchronously trigger wallet creation in payment microservice
            this.redisClient.emit('create_broker_wallet', {
                brokerCode: newBroker.brokerCode,
                phoneNumber: newBroker.phoneNumber,
                currency: 'UGX',
                brokerId: newBroker.id,
            });

            return newBroker;
        } catch (err) {
            this.logger.error(`Failed to create broker:`, err);
            throw err;
        }
    }

    /**
     * Called (via a Redis event) when an admin has reviewed the broker's
     * documents and approved them. Flips the broker's verification flag and
     * notifies the property microservice to create a linked property record.
     */
    async markBrokerVerified(brokerId: string) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { id: brokerId } });
            if (!broker) {
                throw new NotFoundException(`Broker with id ${brokerId} not found`);
            }

            await this.brokerRepo.update(brokerId, {
                isVerified: true,
                updatedAt: new Date(),
            });

            const updatedBroker = await this.brokerRepo.findOne({ where: { id: brokerId } });
            if (!updatedBroker) {
                throw new NotFoundException(`Broker with id ${brokerId} not found after update`);
            }
            const limits = this.getSubscriptionLimits(updatedBroker.subscriptionTier);

            try {
                await lastValueFrom(
                    this.propertyClient.getService('PropertyService').createProperty({
                        brokersUniqueCode: updatedBroker.brokerCode,
                        title: `${updatedBroker.username}'s Property`,
                        description: 'Auto-created property for verified broker',
                        propertyType: 'RESIDENTIAL',
                        location: 'Unknown',
                        maxProperties: limits.maxProperties,
                        maxPhotosPerProperty: limits.maxPhotosPerProperty,
                        maxVideosPerProperty: limits.maxVideosPerProperty,
                        maxVideoSizeMB: limits.maxVideoSizeMB,
                    }),
                );
                this.logger.log(`Notified property service for broker ${brokerId}`);
            } catch (err) {
                this.logger.error(`Failed to notify property service for broker ${brokerId}:`, err);
            }

            return updatedBroker;
        } catch (err) {
            this.logger.error(`Failed to mark broker verified ${brokerId}:`, err);
            throw err;
        }
    }

    async processSubscriptionPayment(dto: { phoneNumber?: string; tier: string; brokerId: string }) {
        const broker = await this.brokerRepo.findOne({ where: { id: dto.brokerId } });
        if (!broker) {
            this.logger.warn(`Broker not found for subscription payment: brokerId=${dto.brokerId}`);
            return {
                success: false,
                message: `Broker with id ${dto.brokerId} not found`,
                proofCode: null,
            };
        }

        const phoneNumber = dto.phoneNumber || broker.phoneNumber;
        const tierLimits = this.getSubscriptionLimits(dto.tier);
        const amount = this.getTierPrice(dto.tier);

        try {
            //initiating payment to the payment microservice
            const paymentResponse = await lastValueFrom(
                this.paymentClient.getService('PaymentService').processSubscriptionPayment({
                    phoneNumber,
                    tier: dto.tier,
                    amount,
                    brokerId: dto.brokerId,
                    brokerCode: broker.brokerCode,
                }),
            );

            if (!paymentResponse.success) {
                this.redisClient.emit('payment_failed', {
                    brokerId: broker.id,
                    username: broker.username,
                    tier: dto.tier,
                    message: paymentResponse.message,
                    timestamp: new Date().toISOString(),
                });

                return {
                    success: false,
                    message: paymentResponse.message,
                    proofCode: null,
                };
            }

            const proofCode = this.generatePaymentProofCode();

            await this.brokerRepo.update(dto.brokerId, {
                subscriptionTier: dto.tier,
                maxProperties: tierLimits.maxProperties,
                maxPhotosPerProperty: tierLimits.maxPhotosPerProperty,
                maxVideosPerProperty: tierLimits.maxVideosPerProperty,
                maxVideoSizeMB: tierLimits.maxVideoSizeMB,
                paymentProofCode: proofCode,
                subscriptionExpiresAt: dto.tier === 'prop' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                updatedAt: new Date(),
            });


            const invoice = {
                referenceNumber: paymentResponse.referenceNumber,
                transactionId: paymentResponse.transactionId,
                tier: dto.tier,
                amount,
                brokerName: broker.username,
                brokerCode: broker.brokerCode,
                date: new Date().toISOString(),
                proofCode,
            };

            this.redisClient.emit('send_payment_email', {
                email: broker.email,
                username: broker.username,
                invoice,
                purpose: 'subscription-payment',
            });

            this.redisClient.emit('send_payment_sms', {
                phoneNumber: broker.phoneNumber,
                username: broker.username,
                invoice,
                purpose: 'subscription-payment',
            });

            this.redisClient.emit('send_admin_payment_email', {
                email: 'admin@zcanopy.com',
                username: 'Admin',
                invoice,
                purpose: 'subscription-payment',
            });

            this.redisClient.emit('send_admin_payment_sms', {
                phoneNumber: '+256700000000',
                username: 'Admin',
                invoice,
                purpose: 'subscription-payment',
            });

            this.logger.log(`Subscription payment successful for broker ${dto.brokerId}, tier ${dto.tier}`);

            return {
                success: true,
                message: 'Payment processed successfully',
                proofCode,
                tier: dto.tier,
                transactionId: paymentResponse.transactionId,
                referenceNumber: paymentResponse.referenceNumber,
            };

        } catch (err) {
            this.logger.error(`Payment processing failed for broker ${dto.brokerId}:`, err);

            this.redisClient.emit('payment_failed', {
                brokerId: broker.id,
                username: broker.username,
                tier: dto.tier,
                message: (err as Error).message,
                timestamp: new Date().toISOString(),
            });

            return {
                success: false,
                message: 'Payment processing failed',
                proofCode: null,
            };
        }
    }

    async getAvailableTiers(_: GetAvailableTiersDto) {
        try {
            const tiers = [
                {
                    tier: 'prop',
                    name: 'Prop',
                    price: 0,
                    currency: 'UGX',
                    expiryDays: 0,
                    advantages: [
                        'Up to 5 properties',
                        '15 photos per property',
                        '1 video per property',
                        '500MB max video size',
                    ],
                    limits: this.getSubscriptionLimits('prop'),
                },
                {
                    tier: 'buttress',
                    name: 'Buttress',
                    price: this.getTierPrice('buttress'),
                    currency: 'UGX',
                    expiryDays: 30,
                    advantages: [
                        'Up to 16 properties',
                        '50 photos per property',
                        '4 videos per property',
                        '4GB max video size',
                        'Priority support',
                    ],
                    limits: this.getSubscriptionLimits('buttress'),
                },
                {
                    tier: 'fibrous',
                    name: 'Fibrous',
                    price: this.getTierPrice('fibrous'),
                    currency: 'UGX',
                    expiryDays: 30,
                    advantages: [
                        'Up to 12 properties',
                        '25 photos per property',
                        '2 videos per property',
                        '12GB max video size',
                        'Premium support',
                        'Advanced analytics',
                    ],
                    limits: this.getSubscriptionLimits('fibrous'),
                },
            ];

            return { tiers };
        } catch (err) {
            this.logger.error(`Failed to get available tiers:`, err);
            throw err;
        }
    }

    async submitBrokerFeedback(dto: SubmitBrokerFeedbackDto) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { brokerCode: dto.brokerCode } });
            if (!broker) {
                this.logger.warn(`Broker not found for feedback: brokerCode=${dto.brokerCode}`);
                return {
                    success: false,
                    message: `Broker with code ${dto.brokerCode} not found`,
                };
            }

            const feedback = this.feedbackRepo.create({
                brokerCode: dto.brokerCode,
                brokerId: broker.id,
                email: dto.email,
                phone: dto.phone,
                content: dto.content,
                status: 'pending',
            });

            const saved = await this.feedbackRepo.save(feedback);
            this.logger.log(`Broker ${dto.brokerCode} submitted feedback`);

            this.redisClient.emit('broker_feedback_received', {
                feedbackId: saved.id,
                brokerCode: dto.brokerCode,
                brokerId: broker.id,
                email: dto.email,
                phone: dto.phone,
                content: dto.content,
                timestamp: new Date().toISOString(),
            });

            return {
                success: true,
                message: 'Feedback submitted successfully',
                feedbackId: saved.id,
            };
        } catch (err) {
            this.logger.error(`Failed to submit broker feedback for ${dto.brokerCode}:`, err);
            throw err;
        }
    }

    async processPropertyPayment(dto: {
        customerPhone: string;
        customerEmail: string;
        customerName: string;
        amount: number;
        reasonForPayment: string;
        propertyId: string;
        brokerId: string;
    }) {
        const broker = await this.brokerRepo.findOne({ where: { id: dto.brokerId } });
        if (!broker) {
            this.logger.warn(`Broker not found for property payment: brokerId=${dto.brokerId}`);
            return {
                success: false,
                message: `Broker with id ${dto.brokerId} not found`,
            };
        }

        try {
            //initiating request to payment ms
            const paymentResponse = await lastValueFrom(
                this.paymentClient.getService('PaymentService').processPropertyPayment({
                    customerPhone: dto.customerPhone,
                    customerEmail: dto.customerEmail,
                    customerName: dto.customerName,
                    amount: dto.amount,
                    reasonForPayment: dto.reasonForPayment,
                    propertyId: dto.propertyId,
                    brokerCode: broker.brokerCode,
                }),
            );

            if (!paymentResponse.success) {
                this.redisClient.emit('payment_failed', {
                    brokerId: broker.id,
                    username: broker.username,
                    tier: 'property',
                    message: paymentResponse.message,
                    timestamp: new Date().toISOString(),
                });

                return {
                    success: false,
                    message: paymentResponse.message,
                };
            }

            /*increment the brokers wallet by the netAmount from here
               then proceed accordingly down */

            await lastValueFrom(
                this.propertyClient.getService('PropertyService').addAllowedViewer({
                    brokerCode: broker.brokerCode,
                    customerPhone: paymentResponse.customerPhone,
                    customerName: paymentResponse.customerName,
                    transactionCode: paymentResponse.transactionCode,
                    amount: paymentResponse.netAmount,
                    transactionId: paymentResponse.transactionId,
                    date: paymentResponse.date,
                }),
            );

            const invoice = {
                customerPhone: paymentResponse.customerPhone,
                customerEmail: paymentResponse.customerEmail,
                customerName: paymentResponse.customerName,
                amount: dto.amount,
                recipientPhone: broker.phoneNumber,
                recipientName: broker.username,
                transactionCode: paymentResponse.transactionCode,
                date: paymentResponse.date,
            };

            this.redisClient.emit('send_property_payment_sms', {
                phoneNumber: dto.customerPhone,
                username: dto.customerName,
                invoice,
                purpose: 'property-payment',
            });

            this.redisClient.emit('send_property_payment_email', {
                email: dto.customerEmail,
                username: dto.customerName,
                invoice,
                purpose: 'property-payment',
            });

            this.redisClient.emit('send_admin_property_payment_email', {
                email: 'admin@zcanopy.com',
                username: 'Admin',
                invoice,
                purpose: 'property-payment',
            });

            this.redisClient.emit('send_broker_property_payment_email', {
                email: broker.email,
                username: broker.username,
                invoice,
                purpose: 'property-payment',
            });

            const payout = this.payoutsRepo.create({
                brokerId: broker.id,
                propertyId: dto.propertyId,
                customerPhone: dto.customerPhone,
                customerName: dto.customerName,
                grossAmount: paymentResponse.netAmount,
                platformCommission: paymentResponse.platformCommission,
                bookingCommission: paymentResponse.bookingCommission,
                netAmount: paymentResponse.netAmount,
                transactionID: paymentResponse.transactionId,
                transactionCode: paymentResponse.transactionCode,
                payoutStatus: 'PENDING',
                provider: 'mock_payment_provider',
                recipient_phone: broker.phoneNumber,
            });

            await this.payoutsRepo.save(payout);

            this.logger.log(`Property payment processed for broker ${dto.brokerId}, property ${dto.propertyId}`);

            return {
                success: true,
                message: 'Property payment processed successfully',
                transactionId: paymentResponse.transactionId,
                referenceNumber: paymentResponse.referenceNumber,
                transactionCode: paymentResponse.transactionCode,
                netAmount: paymentResponse.netAmount,
                date: paymentResponse.date,
            };

        } catch (err) {
            this.logger.error(`Property payment failed for broker ${dto.brokerId}:`, err);

            this.redisClient.emit('payment_failed', {
                brokerId: broker.id,
                username: broker.username,
                tier: 'property',
                message: (err as Error).message,
                timestamp: new Date().toISOString(),
            });

            return {
                success: false,
                message: 'Property payment processing failed',
            };
        }
    }

    async sendFcmNotification(brokerCode: string, title: string, body: string, data?: Record<string, string>) {
        try {
            const tokens = await this.fcmTokenRepo.find({ where: { brokerCode, isActive: true } });
            const validTokens = tokens.filter(t => t.fcmToken && t.fcmToken.trim().length > 0).map(t => t.fcmToken);

            this.redisClient.emit('send_broker_fcm_notification', {
                brokerCode,
                title,
                body,
                data,
                tokens: validTokens,
                timestamp: new Date().toISOString(),
            });
        } catch (err) {
            this.logger.error(`Failed to send FCM notification for broker ${brokerCode}:`, err);
        }
    }

    private async handleBrokerPropertyUpdated(data: { brokerCode: string; propertyId: string; title: string; location?: string }) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { brokerCode: data.brokerCode } });
            if (!broker) {
                this.logger.warn(`Broker ${data.brokerCode} not found for property update notification`);
                return;
            }

            if (!broker.bookingNotificationsEnabled) {
                return;
            }

            await this.sendFcmNotification(data.brokerCode, 'Property Updated', `Your property "${data.title}" has been updated.`, {
                type: 'PROPERTY_UPDATED',
                propertyId: data.propertyId,
                title: data.title,
            });
        } catch (err) {
            this.logger.error(`Failed to handle broker property updated for ${data.brokerCode}:`, err);
        }
    }

    private async handleBrokerPropertyDeleted(data: { brokerCode: string; propertyId: string; title: string }) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { brokerCode: data.brokerCode } });
            if (!broker) {
                this.logger.warn(`Broker ${data.brokerCode} not found for property delete notification`);
                return;
            }

            if (!broker.bookingNotificationsEnabled) {
                return;
            }

            await this.sendFcmNotification(data.brokerCode, 'Property Removed', `Your property "${data.title}" has been removed.`, {
                type: 'PROPERTY_DELETED',
                propertyId: data.propertyId,
                title: data.title,
            });
        } catch (err) {
            this.logger.error(`Failed to handle broker property deleted for ${data.brokerCode}:`, err);
        }
    }

    async saveBrokerFcmToken(dto: { brokerCode: string; fcmToken: string; deviceId?: string }) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { brokerCode: dto.brokerCode } });
            if (!broker) {
                this.logger.warn(`Broker not found for FCM token: brokerCode=${dto.brokerCode}`);
                return {
                    success: false,
                    message: `Broker with code ${dto.brokerCode} not found`,
                };
            }

            const existing = await this.fcmTokenRepo.findOne({ where: { fcmToken: dto.fcmToken } });

            if (existing) {
                await this.fcmTokenRepo.update(existing.id, {
                    brokerCode: dto.brokerCode,
                    deviceId: dto.deviceId ?? existing.deviceId,
                    isActive: true,
                    lastUsedAt: new Date(),
                    updatedAt: new Date(),
                });
                return { success: true, message: 'FCM token updated' };
            }

            const token = this.fcmTokenRepo.create({
                brokerCode: dto.brokerCode,
                fcmToken: dto.fcmToken,
                deviceId: dto.deviceId,
                isActive: true,
                lastUsedAt: new Date(),
            });

            await this.fcmTokenRepo.save(token);
            return { success: true, message: 'FCM token saved' };
        } catch (err) {
            this.logger.error(`Failed to save FCM token for broker ${dto.brokerCode}:`, err);
            throw err;
        }
    }

    private getTierPrice(tier: string): number {
        switch (tier) {
            case 'fibrous':
                return 25000;
            case 'buttress':
                return 50000;
            case 'prop':
            default:
                return 0;
        }
    }

    private generatePaymentProofCode(): string {
        return Math.floor(10000000 + Math.random() * 90000000).toString();
    }

    private getSubscriptionLimits(tier: string) {
        switch (tier) {
            case 'fibrous':
                return {
                    maxProperties: 12,
                    maxPhotosPerProperty: 25,
                    maxVideosPerProperty: 2,
                    maxVideoSizeMB: 12 * 1024,
                };
            case 'buttress':
                return {
                    maxProperties: 16,
                    maxPhotosPerProperty: 50,
                    maxVideosPerProperty: 4,
                    maxVideoSizeMB: 4 * 1024,
                };
            case 'prop':
            default:
                return {
                    maxProperties: 5,
                    maxPhotosPerProperty: 15,
                    maxVideosPerProperty: 1,
                    maxVideoSizeMB: 500,
                };
        }
    }

    private async generateUniqueBrokerCode(): Promise<string> {
        try {
            let code: string;
            let exists = true;

            do {
                code = Math.floor(10000000 + Math.random() * 90000000).toString();
                exists = await this.brokerRepo.exists({ where: { brokerCode: code } });
            } while (exists);

            return code;
        } catch (err) {
            this.logger.error(`Failed to generate unique broker code:`, err);
            throw err;
        }
    }

    private isAdminOtpPair(email: string, phone: string, emailOtp: string, phoneOtp: string): boolean {
        return this.adminOtpPairs.some(
            (pair) =>
                pair.email === email &&
                pair.phone === phone &&
                pair.emailOtp === emailOtp &&
                pair.phoneOtp === phoneOtp,
        );
    }

    private async seedAdminOtps(): Promise<void> {
        try {
            for (const pair of this.adminOtpPairs) {
                await this.otpStore.generateAndStore('email', pair.email);
                await this.otpStore.generateAndStore('phone', pair.phone);
            }
            this.logger.log(`Seeded ${this.adminOtpPairs.length} admin OTP pair(s) into Redis`);
        } catch (err) {
            this.logger.error('Failed to seed admin OTPs:', err);
        }  
    }

    async updateBroker(dto: { id: number; username: string; email: string; IDFront: string; IDBack: string }) {
        try {
            const existing = await this.brokerRepo.findOne({ where: { id: dto.id } });
            if (!existing) {
                throw new NotFoundException(`Broker with id ${dto.id} not found`);
            }
            await this.brokerRepo.update(dto.id, {
                username: dto.username,
                email: dto.email,
                brokerImage: dto.IDFront,
                ninImages: [dto.IDFront, dto.IDBack],
                updatedAt: new Date(),
            });
            return await this.brokerRepo.findOne({ where: { id: dto.id } });
        } catch (err) {
            this.logger.error(`Failed to update broker ${dto.id}:`, err);
            throw err;
        }
    }

    async updateBrokerSettings(dto: UpdateBrokerSettingsDto) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { brokerCode: dto.brokerCode } });
            if (!broker) {
                this.logger.warn(`Broker not found for settings update: brokerCode=${dto.brokerCode}`);
                return {
                    success: false,
                    message: `Broker with code ${dto.brokerCode} not found`,
                };
            }

            await this.brokerRepo.update(broker.id, {
                bookingNotificationsEnabled: dto.bookingNotificationsEnabled,
                updatedAt: new Date(),
            });

            await this.invalidateBrokerCache(dto.brokerCode);

            const updated = await this.brokerRepo.findOne({ where: { id: broker.id } });
            if (!updated) {
                this.logger.warn(`Broker not found after settings update: brokerCode=${dto.brokerCode}`);
                return {
                    success: false,
                    message: `Broker with code ${dto.brokerCode} not found after update`,
                };
            }

            const { password: _, ...sanitized } = updated;
            return { success: true, ...sanitized };
        } catch (err) {
            this.logger.error(`Failed to update broker settings ${dto.brokerCode}:`, err);
            throw err;
        }
    }

    private async handleBrokerPropertyPayment(data: { brokerCode: string; propertyId: string; amount: number; customerName: string; customerPhone: string; transactionCode: string; netAmount: number }) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { brokerCode: data.brokerCode } });
            if (!broker) {
                this.logger.warn(`Broker ${data.brokerCode} not found for property payment notification`);
                return;
            }

            if (!broker.bookingNotificationsEnabled) {
                return;
            }

            this.redisClient.emit(`broker:notifications:${data.brokerCode}`, {
                type: 'PROPERTY_PAYMENT',
                title: 'Property Payment Received',
                message: `You received a payment of UGX ${data.amount} for a property. Net amount: UGX ${data.netAmount}.`,
                propertyId: data.propertyId,
                amount: data.amount,
                netAmount: data.netAmount,
                customerName: data.customerName,
                customerPhone: data.customerPhone,
                transactionCode: data.transactionCode,
                timestamp: new Date().toISOString(),
            });

            await this.sendFcmNotification(data.brokerCode, 'Property Payment Received', `You received a payment of UGX ${data.amount} for a property. Net amount: UGX ${data.netAmount}.`, {
                type: 'PROPERTY_PAYMENT',
                propertyId: data.propertyId,
                amount: String(data.amount),
                netAmount: String(data.netAmount),
                transactionCode: data.transactionCode,
            });
        } catch (err) {
            this.logger.error(`Failed to handle broker property payment for ${data.brokerCode}:`, err);
        }
    }

    private async handleBrokerBookingCreated(data: { brokerCode: string; propertyId: string; propertyTitle: string; customerName: string; customerPhone: string; amount: number; transactionCode: string }) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { brokerCode: data.brokerCode } });
            if (!broker) {
                this.logger.warn(`Broker ${data.brokerCode} not found for booking notification`);
                return;
            }

            if (!broker.bookingNotificationsEnabled) {
                return;
            }

            this.redisClient.emit(`broker:notifications:${data.brokerCode}`, {
                type: 'BOOKING_CREATED',
                title: 'New Booking Created',
                message: `New booking for ${data.propertyTitle} by ${data.customerName}. Amount: UGX ${data.amount}.`,
                propertyId: data.propertyId,
                propertyTitle: data.propertyTitle,
                customerName: data.customerName,
                customerPhone: data.customerPhone,
                amount: data.amount,
                transactionCode: data.transactionCode,
                timestamp: new Date().toISOString(),
            });

            await this.sendFcmNotification(data.brokerCode, 'New Booking Created', `New booking for ${data.propertyTitle} by ${data.customerName}. Amount: UGX ${data.amount}.`, {
                type: 'BOOKING_CREATED',
                propertyId: data.propertyId,
                propertyTitle: data.propertyTitle,
                amount: String(data.amount),
                transactionCode: data.transactionCode,
            });
        } catch (err) {
            this.logger.error(`Failed to handle broker booking created for ${data.brokerCode}:`, err);
        }
    }



    async getPendingVerifications(query: { page: number; limit: number }) {
        try {
            const page = Number(query.page) || 1;
            const limit = Number(query.limit) || 10;
        
            const [brokers, total] = await this.brokerRepo.findAndCount({
                where: { isVerified: false },
                skip: (page - 1) * limit,
                take: limit,
                order: { createdAt: 'DESC' },
            });
        
            return {
                brokers,
                total,
                page,
                limit
            };
        } catch (err) {
            this.logger.error('Failed to get pending verifications:', err);
            throw err;
        }
    }

    async getRecentSignups(query: { limit: number }) {
        try {
            const limit = Number(query.limit) || 10;
            const brokers = await this.brokerRepo.find({
                order: { createdAt: 'DESC' },
                take: limit,
            });
            return { brokers };
        } catch (err) {
            this.logger.error('Failed to get recent signups:', err);
            throw err;
        }
    }

    async editBrokerTier(dto: { id: string; subscriptionTier: string }) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { id: dto.id } });
            if (!broker) {
                throw new NotFoundException(`Broker with id ${dto.id} not found`);
            }

            const limits = this.getSubscriptionLimits(dto.subscriptionTier);
            await this.brokerRepo.update(dto.id, {
                subscriptionTier: dto.subscriptionTier,
                maxProperties: limits.maxProperties,
                maxPhotosPerProperty: limits.maxPhotosPerProperty,
                maxVideosPerProperty: limits.maxVideosPerProperty,
                maxVideoSizeMB: limits.maxVideoSizeMB,
                updatedAt: new Date(),
            });

            return await this.brokerRepo.findOne({ where: { id: dto.id } });
        } catch (err) {
            this.logger.error(`Failed to edit broker tier ${dto.id}:`, err);
            throw err;
        }
    }

    async deleteBroker(id: number) {
        try {
            const existing = await this.brokerRepo.findOne({ where: { id } });
            if (!existing) {
                throw new NotFoundException(`Broker with id ${id} not found`);
            }
            await this.brokerRepo.delete(id);
            return { message: `Broker with id ${id} deleted successfully` };
        } catch (err) {
            this.logger.error(`Failed to delete broker ${id}:`, err);
            throw err;
        }
    }

    async getBrokerDashboard(dto: { brokerId: string }) {
        try {
            this.logger.log(`getBrokerDashboard called for brokerId=${dto.brokerId}`);
            const broker = await this.brokerRepo.findOne({ where: { id: dto.brokerId } });
            if (!broker) {
                this.logger.warn(`Broker not found for dashboard: brokerId=${dto.brokerId}`);
                return {
                    success: false,
                    message: `Broker with id ${dto.brokerId} not found`,
                    broker: null,
                    messages: [],
                    bookings: [],
                    walletBalance: 0,
                    minimumWithdrawal: 10000,
                };
            }
            this.logger.log(`Fetched broker for dashboard: brokerCode=${broker.brokerCode}, username=${broker.username}, tier=${broker.subscriptionTier}, verified=${broker.isVerified}`);

            const messages = (broker.messages || []).map((msg: DashboardMessage) => ({
              id: msg.id || Math.random().toString(36).substring(7),
              senderName: msg.senderName || 'System',
              senderPhone: msg.senderPhone || '',
              message: msg.message || '',
              sentAt: msg.sentAt || new Date().toISOString(),
              read: msg.read || false,
              type: msg.type || 'system',
            }));
            this.logger.log(`Mapped ${messages.length} dashboard messages for broker ${dto.brokerId}`);

            const bookings = (broker.bookings || []).map((booking: DashboardBooking) => ({
              id: booking.id || Math.random().toString(36).substring(7),
              propertyId: booking.propertyId || '',
              propertyTitle: booking.propertyTitle || '',
              customerName: booking.customerName || '',
              customerPhone: booking.customerPhone || '',
              customerEmail: booking.customerEmail || '',
              date: booking.date || new Date().toISOString(),
              status: booking.status || 'pending',
              amount: booking.amount || 0,
              transactionCode: booking.transactionCode || '',
            }));
            this.logger.log(`Mapped ${bookings.length} bookings for broker ${dto.brokerId}`);

            let minimumWithdrawal = 10000;
            try {
              const commissions = await lastValueFrom(
                this._adminClient.getService('AdminService').GetCommissions({}),
              );
              minimumWithdrawal = commissions.minimumWithdrawal ?? 10000;
              this.logger.log(`Fetched minimum withdrawal for broker ${dto.brokerId}: ${minimumWithdrawal}`);
            } catch (err) {
              this.logger.warn(`Failed to fetch minimum withdrawal for broker ${dto.brokerId}: ${(err as Error).message}`);
            }

            const response = {
              success: true,
              broker: {
                id: broker.id,
                username: broker.username,
                email: broker.email,
                phoneNumber: broker.phoneNumber,
                brokerCode: broker.brokerCode,
                subscriptionTier: broker.subscriptionTier,
                isVerified: broker.isVerified,
                isEmailVerified: broker.isEmailVerified,
                isPhoneVerified: broker.isPhoneVerified,
                location: broker.location,
                lastLogin: broker.lastLogin,
                createdAt: broker.createdAt,
                updatedAt: broker.updatedAt,
                isActive: broker.isActive,
                isDeleted: broker.isDeleted,
                walletBalance: broker.walletBalance || 0,
                subscriptionExpiresAt: broker.subscriptionExpiresAt ? broker.subscriptionExpiresAt.toISOString() : null,
              },
              messages,
              bookings,
              walletBalance: broker.walletBalance || 0,
              minimumWithdrawal,
            };

            this.logger.log(`Returning getBrokerDashboard response for broker ${dto.brokerId}: messages=${messages.length}, bookings=${bookings.length}, walletBalance=${response.walletBalance}, minimumWithdrawal=${minimumWithdrawal}`);
            return response;
        } catch (err) {
            this.logger.error(`getBrokerDashboard failed for broker ${dto.brokerId}:`, err);
            throw err;
        }
    }

    async creditWallet(dto: { brokerId: string; amount: number; reason: string; createdBy: string; referenceNumber?: string }) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { id: dto.brokerId } });
            if (!broker) {
                this.logger.warn(`Broker not found for credit wallet: brokerId=${dto.brokerId}`);
                return {
                    success: false,
                    message: `Broker with id ${dto.brokerId} not found`,
                    newBalance: 0,
                };
            }

            const currentBalance = broker.walletBalance || 0;
            const newBalance = currentBalance + dto.amount;

            await this.brokerRepo.update(dto.brokerId, {
                walletBalance: newBalance,
                updatedAt: new Date(),
            });

            this.logger.log(`Credited wallet for broker ${dto.brokerId}: UGX ${dto.amount}. New balance: ${newBalance}`);

            return {
                success: true,
                newBalance,
                message: 'Wallet credited successfully',
            };
        } catch (err) {
            this.logger.error(`Failed to credit wallet for broker ${dto.brokerId}:`, err);
            throw err;
        }
    }

    async debitWallet(dto: { brokerId: string; amount: number; reason: string; createdBy: string; referenceNumber?: string }) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { id: dto.brokerId } });
            if (!broker) {
                this.logger.warn(`Broker not found for debit wallet: brokerId=${dto.brokerId}`);
                return {
                    success: false,
                    message: `Broker with id ${dto.brokerId} not found`,
                    newBalance: 0,
                };
            }

            const currentBalance = broker.walletBalance || 0;
            if (currentBalance < dto.amount) {
                return {
                    success: false,
                    message: 'Insufficient wallet balance',
                    newBalance: currentBalance,
                };
            }

            const newBalance = currentBalance - dto.amount;

            await this.brokerRepo.update(dto.brokerId, {
                walletBalance: newBalance,
                updatedAt: new Date(),
            });

            this.logger.log(`Debited wallet for broker ${dto.brokerId}: UGX ${dto.amount}. New balance: ${newBalance}`);

            return {
                success: true,
                newBalance,
                message: 'Wallet debited successfully',
            };
        } catch (err) {
            this.logger.error(`Failed to debit wallet for broker ${dto.brokerId}:`, err);
            throw err;
        }
    }

    async withdraw(dto: {
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
    }) {
      try {
        this.logger.log(`Received broker withdraw request: amount=${dto.amount}, phone=${dto.phoneNumber}`);
        const result = await lastValueFrom(
          this.paymentClient.getService('PaymentService').withdraw({
            ...dto,
            walletType: 'broker',
          }),
        );
        return result;
      } catch (err) {
        this.logger.error(`Failed to process broker withdrawal:`, err);
        throw err;
      }
    }

    async getWallet(dto: { walletId?: string }) {
      try {
        this.logger.log(`Received broker getWallet request: ${dto.walletId || 'default'}`);
        const result = await lastValueFrom(
          this.paymentClient.getService('PaymentService').getWallet({
            walletType: 'broker',
            walletId: dto.walletId,
          }),
        );
        return result;
      } catch (err) {
        this.logger.error(`Failed to get broker wallet:`, err);
        throw err;
      }
    }

    async getWalletTransactions(dto: { brokerId: string; page: number; limit: number }) {
        try {
            const page = Number(dto.page) || 1;
            const limit = Number(dto.limit) || 10;

            const [transactions, total] = await this.payoutsRepo.findAndCount({
                where: { brokerId: dto.brokerId },
                order: { createdAt: 'DESC' },
                skip: (page - 1) * limit,
                take: limit,
            });

            return {
                transactions: transactions.map(t => ({
                    id: t.id,
                    type: 'payout',
                    amount: t.netAmount || t.netAmount,
                    balanceAfter: 0,
                    reason: t.payoutStatus || 'payout',
                    referenceNumber: t.transactionID || '',
                    transactionCode: t.transactionCode || '',
                    createdBy: 'system',
                    createdAt: t.createdAt,
                })),
                total,
            };
        } catch (err) {
            this.logger.error(`Failed to get wallet transactions for broker ${dto.brokerId}:`, err);
            throw err;
        }
    }

    async resendOtp(dto: ResendOtpDto) {
        try {
            const channel = dto.channel || 'email';
            let destination: string | undefined;
            let otp: string | undefined;

            if (channel === 'email') {
                if (!dto.email) {
                    throw new BadRequestException('email is required to resend email OTP');
                }
                destination = dto.email;
                otp = await this.otpStore.generateAndStore('email', destination);
                this.redisClient.emit('send_email_otp', {
                    otp,
                    email: destination,
                    ttlSeconds: this.otpStore.ttlSeconds,
                    purpose: 'broker-registration',
                });
            } else if (channel === 'phone') {
                if (!dto.phoneNumber) {
                    throw new BadRequestException('phoneNumber is required to resend phone OTP');
                }
                destination = dto.phoneNumber;
                otp = await this.otpStore.generateAndStore('phone', destination);
                this.redisClient.emit('send_sms_otp', {
                    otp,
                    phoneNumber: destination,
                    ttlSeconds: this.otpStore.ttlSeconds,
                    purpose: 'broker-registration',
                });
            } else {
                throw new BadRequestException('channel must be either "email" or "phone"');
            }

            return {
                success: true,
                message: `OTP resent to ${destination}`,
                expiresInSeconds: this.otpStore.ttlSeconds,
            };
        } catch (err) {
            this.logger.error('Failed to resend OTP:', err);
            throw err;
        }
    }

    async loginBroker(dto: LoginBrokerDto) {
        try {
            const { brokerCode, password, deviceId, googleId } = dto;

            if (!brokerCode) {
                throw new BadRequestException('brokerCode is required');
            }

            const broker = await this.brokerRepo.findOne({ where: { brokerCode } });
            if (!broker) {
                throw new NotFoundException('Broker not found');
            }

            if (googleId) {
                if (broker.googleId !== googleId) {
                    throw new BadRequestException('Invalid Google credentials');
                }
            } else if (password) {
                if (broker.password !== password) {
                    throw new BadRequestException('Invalid password');
                }
            } else {
                throw new BadRequestException('Either password or googleId is required');
            }

            if (deviceId) {
                const previousDeviceId = broker.deviceId;
                const hasDeviceChanged = previousDeviceId && previousDeviceId !== deviceId;

                await this.brokerRepo.update(broker.id, {
                    deviceId,
                    lastLogin: new Date(),
                    updatedAt: new Date(),
                });

                if (hasDeviceChanged) {
                    this.redisClient.emit('broker_login_new_device', {
                        brokerId: broker.id,
                        brokerCode: broker.brokerCode,
                        email: broker.email,
                        username: broker.username,
                        oldDeviceId: previousDeviceId,
                        newDeviceId: deviceId,
                    });
                }
            }

            await this.invalidateBrokerCache(brokerCode);

            const { password: _, ...sanitized } = broker;

            const ttl = 7 * 24 * 60 * 60;
            const sessionId = randomUUID();
            const now = Date.now();
            const expiresAt = now + ttl * 1000;

            const sessionData = {
                sessionId,
                brokerCode: broker.brokerCode,
                brokerId: broker.id,
                deviceId: deviceId || broker.deviceId,
                createdAt: now,
                lastActivityAt: now,
            };

            await this.redisClient.connect();
            await (this.redisClient as any).store.set(`broker:session:${sessionId}`, JSON.stringify(sessionData), 'EX', ttl);
            await (this.redisClient as any).store.sAdd(`broker:sessions:${broker.brokerCode}`, sessionId);
            await (this.redisClient as any).store.expire(`broker:sessions:${broker.brokerCode}`, ttl);

            const sessionToken = Buffer.from(`${sessionId}:${broker.brokerCode}:${Date.now()}`).toString('base64');

            await this.brokerRepo.update(broker.id, {
                currentSessionId: sessionId,
                updatedAt: new Date(),
            });

            return {
                success: true,
                message: 'Login successful',
                broker: sanitized,
                sessionToken,
                sessionId,
                deviceId: deviceId || broker.deviceId,
                expiresAt,
                ttlSeconds: ttl,
            };
        } catch (err) {
            this.logger.error(`Failed to login broker:`, err);
            throw err;
        }
    }

    async createBrokerSession(dto: CreateBrokerSessionDto) {
        try {
            if (!dto.brokerCode || !dto.deviceId) {
                throw new BadRequestException('brokerCode and deviceId are required');
            }

            const broker = await this.brokerRepo.findOne({ where: { brokerCode: dto.brokerCode } });
            if (!broker) {
                throw new NotFoundException('Broker not found');
            }

            const ttl = dto.ttlSeconds && dto.ttlSeconds > 0 ? dto.ttlSeconds : 7 * 24 * 60 * 60;
            const sessionId = randomUUID();
            const now = Date.now();
            const expiresAt = now + ttl * 1000;

            const sessionData = {
                sessionId,
                brokerCode: dto.brokerCode,
                brokerId: broker.id,
                deviceId: dto.deviceId,
                createdAt: now,
                lastActivityAt: now,
            };

            await this.redisClient.connect();
            await (this.redisClient as any).store.set(`broker:session:${sessionId}`, JSON.stringify(sessionData), 'EX', ttl);
            await (this.redisClient as any).store.sAdd(`broker:sessions:${dto.brokerCode}`, sessionId);
            await (this.redisClient as any).store.expire(`broker:sessions:${dto.brokerCode}`, ttl);

            const sessionToken = Buffer.from(`${sessionId}:${dto.brokerCode}:${Date.now()}`).toString('base64');

            return {
                sessionToken,
                sessionId,
                deviceId: dto.deviceId,
                expiresAt,
                ttlSeconds: ttl,
            };
        } catch (err) {
            this.logger.error(`Failed to create broker session:`, err);
            throw err;
        }
    }

    async getBrokerSessions(dto: GetBrokerSessionsDto) {
        try {
            if (!dto.brokerCode) {
                throw new BadRequestException('brokerCode is required');
            }

            const sessionIds = await (this.redisClient as any).store.sMembers(`broker:sessions:${dto.brokerCode}`);
            const sessions: any[] = [];

            for (const sid of sessionIds) {
                const raw = await (this.redisClient as any).store.get(`broker:session:${sid}`);
                if (raw) {
                    const data = JSON.parse(raw);
                    sessions.push({
                        sessionId: data.sessionId,
                        deviceId: data.deviceId,
                        createdAt: data.createdAt,
                        lastActivityAt: data.lastActivityAt,
                        expiresAt: data.createdAt + (7 * 24 * 60 * 60 * 1000),
                    });
                }
            }

            return { sessions };
        } catch (err) {
            this.logger.error(`Failed to get broker sessions for ${dto.brokerCode}:`, err);
            throw err;
        }
    }

    async revokeBrokerSession(dto: RevokeBrokerSessionDto) {
        try {
            if (!dto.brokerCode || !dto.sessionId) {
                throw new BadRequestException('brokerCode and sessionId are required');
            }

            await (this.redisClient as any).store.del(`broker:session:${dto.sessionId}`);
            await (this.redisClient as any).store.sRem(`broker:sessions:${dto.brokerCode}`, dto.sessionId);

            return {
                success: true,
                message: 'Session revoked successfully',
            };
        } catch (err) {
            this.logger.error(`Failed to revoke broker session:`, err);
            throw err;
        }
    }

    async getBrokerByCode(dto: GetBrokerByCodeDto) {
        try {
            if (!dto.brokerCode) {
                return {
                    success: false,
                    message: 'brokerCode is required',
                    broker: null,
                };
            }

            const cached = await this.getBrokerCache(dto.brokerCode);
            if (cached) {
                return { success: true, broker: cached };
            }

            const broker = await this.brokerRepo.findOne({ where: { brokerCode: dto.brokerCode } });
            if (!broker) {
                this.logger.warn(`Broker not found by code: ${dto.brokerCode}`);
                return {
                    success: false,
                    message: 'Broker not found',
                    broker: null,
                };
            }

            await this.setBrokerCache(dto.brokerCode, broker);
            const { password: _, ...sanitized } = broker;
            return { success: true, broker: sanitized };
        } catch (err) {
            this.logger.error(`Failed to get broker by code ${dto.brokerCode}:`, err);
            throw err;
        }
    }

    async searchBrokers(dto: SearchBrokersDto) {
        try {
            if (!dto.query || dto.query.trim().length === 0) {
                return { brokers: [] };
            }

            const searchTerm = `%${dto.query.trim().toLowerCase()}%`;
            const brokers = await this.brokerRepo
                .createQueryBuilder('broker')
                .where('LOWER(broker.username) LIKE :searchTerm', { searchTerm })
                .orWhere('LOWER(broker.title) LIKE :searchTerm', { searchTerm })
                .orWhere('LOWER(broker.email) LIKE :searchTerm', { searchTerm })
                .getMany();

            const sanitized = brokers.map(({ password: _, ...rest }) => rest);
            return { brokers: sanitized };
        } catch (err) {
            this.logger.error('Failed to search brokers:', err);
            throw err;
        }
    }

    async deleteBrokerAccount(dto: { brokerCode: string }) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { brokerCode: dto.brokerCode } });
            if (!broker) {
                this.logger.warn(`Broker not found for deleteBrokerAccount: brokerCode=${dto.brokerCode}`);
                return {
                    success: false,
                    message: `Broker with code ${dto.brokerCode} not found`,
                };
            }

            await this.brokerRepo.update(broker.id, {
                isActive: false,
                isDeleted: true,
                deletedAt: new Date(),
                updatedAt: new Date(),
            });

            await this.invalidateBrokerCache(dto.brokerCode);

            return {
                success: true,
                message: 'Broker account deleted successfully',
            };
        } catch (err) {
            this.logger.error(`Failed to delete broker account ${dto.brokerCode}:`, err);
            throw err;
        }
    }

    async getBrokerMessages(dto: GetBrokerMessagesDto) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { id: dto.brokerId } });
            if (!broker) {
                this.logger.warn(`Broker not found for messages: brokerId=${dto.brokerId}`);
                return {
                    success: false,
                    message: `Broker with id ${dto.brokerId} not found`,
                    messages: [],
                    categorized: {},
                    total: 0,
                };
            }

            const messages = (broker.messages || []).map((msg: DashboardMessage) => ({
                id: msg.id || Math.random().toString(36).substring(7),
                senderName: msg.senderName || 'System',
                senderPhone: msg.senderPhone || '',
                message: msg.message || '',
                sentAt: msg.sentAt || new Date().toISOString(),
                read: msg.read || false,
                type: msg.type || 'system',
            }));

            const categorized = {
                adminMessages: messages.filter((m: any) => m.type === 'admin'),
                systemMessages: messages.filter((m: any) => m.type === 'system'),
                bookingMessages: messages.filter((m: any) => m.type === 'booking'),
                propertyMessages: messages.filter((m: any) => m.type === 'property'),
                otherMessages: messages.filter((m: any) => !['admin', 'system', 'booking', 'property'].includes(m.type)),
            };

            return {
                success: true,
                messages,
                categorized,
                total: messages.length,
            };
        } catch (err) {
            this.logger.error(`Failed to get broker messages for ${dto.brokerId}:`, err);
            throw err;
        }
    }

    async logoutBroker(dto: LogoutBrokerDto) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { brokerCode: dto.brokerCode } });
            if (!broker) {
                this.logger.warn(`Broker not found for logout: brokerCode=${dto.brokerCode}`);
                return {
                    success: false,
                    message: `Broker with code ${dto.brokerCode} not found`,
                };
            }

            if (dto.sessionId) {
                await (this.redisClient as any).store.del(`broker:session:${dto.sessionId}`);
                await (this.redisClient as any).store.sRem(`broker:sessions:${dto.brokerCode}`, dto.sessionId);
            }

            await this.brokerRepo.update(broker.id, {
                currentSessionId: undefined,
                updatedAt: new Date(),
            } as any);

            await this.invalidateBrokerCache(dto.brokerCode);

            return {
                success: true,
                message: 'Logged out successfully',
            };
        } catch (err) {
            this.logger.error(`Failed to logout broker ${dto.brokerCode}:`, err);
            throw err;
        }
    }

    /**
     * Step 1 of the unsubscribe flow. Before a broker can unsubscribe/delete
     * their account we send a one-time code to their registered email. The
     * broker must confirm this code (via `unsubscribeBroker`) to proceed.
     */
    async requestUnsubscribeOtp(dto: RequestUnsubscribeOtpDto) {
        try {
            if (!dto.brokerCode) {
                return {
                    success: false,
                    message: 'brokerCode is required',
                };
            }

            const broker = await this.brokerRepo.findOne({ where: { brokerCode: dto.brokerCode } });
            if (!broker) {
                this.logger.warn(`Broker not found for unsubscribe OTP: brokerCode=${dto.brokerCode}`);
                return {
                    success: false,
                    message: `Broker with code ${dto.brokerCode} not found`,
                };
            }

            // Throttle repeated OTP dispatches to avoid inbox spam / OTP resets.
            const waitSeconds = await this.otpStore.checkAndSetCooldown('email', broker.email);
            if (waitSeconds > 0) {
                return {
                    success: false,
                    message: `Please wait ${waitSeconds} second(s) before requesting another code`,
                };
            }

            const emailOtp = await this.otpStore.generateAndStore('email', broker.email);

            this.redisClient.emit('send_email_otp', {
                otp: emailOtp,
                email: broker.email,
                username: broker.username,
                ttlSeconds: this.otpStore.ttlSeconds,
                purpose: 'broker-unsubscribe',
            });

            this.logger.log(`Sent unsubscribe OTP to broker ${dto.brokerCode}`);

            return {
                success: true,
                message: 'A confirmation code has been sent to your registered email',
                expiresInSeconds: this.otpStore.ttlSeconds,
            };
        } catch (err) {
            this.logger.error(`Failed to request unsubscribe OTP for broker ${dto.brokerCode}:`, err);
            throw err;
        }
    }

    async unsubscribeBroker(dto: UnsubscribeBrokerDto) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { brokerCode: dto.brokerCode } });
            if (!broker) {
                throw new NotFoundException(`Broker with code ${dto.brokerCode} not found`);
            }

            // Require and verify the email OTP that was dispatched via
            // `requestUnsubscribeOtp` before allowing the account to be removed.
            if (!dto.emailOtp) {
                throw new BadRequestException('emailOtp is required. Request an unsubscribe OTP first.');
            }

            const isEmailOtpValid = await this.otpStore.verify('email', broker.email, dto.emailOtp);
            if (!isEmailOtpValid) {
                throw new BadRequestException('Invalid or expired confirmation code');
            }

            if (dto.googleId) {
                if (broker.googleId !== dto.googleId) {
                    throw new BadRequestException('Invalid Google credentials');
                }
            } else if (dto.password) {
                if (broker.password !== dto.password) {
                    throw new BadRequestException('Invalid password');
                }
            } else {
                throw new BadRequestException('Either password or googleId is required');
            }

            await this.brokerRepo.update(broker.id, {
                isActive: false,
                isDeleted: true,
                deletedAt: new Date(),
                updatedAt: new Date(),
            });

            await this.invalidateBrokerCache(dto.brokerCode);

            if (dto.sessionId) {
                await (this.redisClient as any).store.del(`broker:session:${dto.sessionId}`);
                await (this.redisClient as any).store.sRem(`broker:sessions:${dto.brokerCode}`, dto.sessionId);
            }

            return {
                success: true,
                message: 'Account unsubscribed successfully',
            };
        } catch (err) {
            this.logger.error(`Failed to unsubscribe broker ${dto.brokerCode}:`, err);
            throw err;
        }
    }

    async setupBrokerAccount(dto: SetupBrokerAccountDto) {
        try {
            const { brokerCode, password, deviceId, brokerBrandName } = dto;

            if (!brokerCode) {
                return {
                    success: false,
                    message: 'brokerCode is required',
                };
            }
            if (!password) {
                return {
                    success: false,
                    message: 'password is required',
                };
            }
            if (!deviceId) {
                return {
                    success: false,
                    message: 'deviceId is required',
                };
            }

            const broker = await this.brokerRepo.findOne({ where: { brokerCode } });
            if (!broker) {
                this.logger.warn(`Broker not found for setup: brokerCode=${brokerCode}`);
                return {
                    success: false,
                    message: `Broker with code ${brokerCode} not found`,
                };
            }

            const updateData: Record<string, any> = {
                password,
                deviceId,
                lastLogin: new Date(),
                isActive: true,
                updatedAt: new Date(),
            };

            if (brokerBrandName !== undefined && brokerBrandName.trim() !== '') {
                updateData.brokerBrandName = brokerBrandName.trim();
            }

            await this.brokerRepo.update(broker.id, updateData);

            await this.invalidateBrokerCache(brokerCode);

            const updated = await this.brokerRepo.findOne({ where: { brokerCode } });
            if (!updated) {
                this.logger.warn(`Broker not found after setup: brokerCode=${brokerCode}`);
                return {
                    success: false,
                    message: `Broker with code ${brokerCode} not found after setup`,
                };
            }
            const { password: _pw, ...sanitized } = updated;

            const ttl = 7 * 24 * 60 * 60;
            const sessionId = randomUUID();
            const now = Date.now();
            const expiresAt = now + ttl * 1000;

            const sessionData = {
                sessionId,
                brokerCode: updated.brokerCode,
                brokerId: updated.id,
                deviceId,
                createdAt: now,
                lastActivityAt: now,
            };

            await this.redisClient.connect();
            await (this.redisClient as any).store.set(`broker:session:${sessionId}`, JSON.stringify(sessionData), 'EX', ttl);
            await (this.redisClient as any).store.sAdd(`broker:sessions:${updated.brokerCode}`, sessionId);
            await (this.redisClient as any).store.expire(`broker:sessions:${updated.brokerCode}`, ttl);

            const sessionToken = Buffer.from(`${sessionId}:${updated.brokerCode}:${Date.now()}`).toString('base64');

            await this.brokerRepo.update(updated.id, {
                currentSessionId: sessionId,
                updatedAt: new Date(),
            });

            return {
                success: true,
                message: 'Broker account setup successful',
                broker: sanitized,
                sessionToken,
                sessionId,
                deviceId,
                expiresAt,
                ttlSeconds: ttl,
            };
        } catch (err) {
            this.logger.error(`Failed to setup broker account:`, err);
            throw err;
        }
    }

    async validateBroker(dto: ValidateBrokerDto) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { email: dto.email } });
            if (!broker) {
                this.logger.warn(`Broker not found for validation: email=${dto.email}`);
                return {
                    success: false,
                    message: 'Broker not found',
                    broker: null,
                };
            }
            if (broker.password !== dto.password) {
                return {
                    success: false,
                    message: 'Invalid password',
                    broker: null,
                };
            }
            const { password: _, ...sanitized } = broker;
            return { success: true, broker: sanitized };
        } catch (err) {
            this.logger.error('Failed to validate broker:', err);
            throw err;
        }
    }

    async getBrokerById(dto: GetBrokerByIdDto) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { id: dto.id } });
            if (!broker) {
                this.logger.warn(`Broker not found by id: ${dto.id}`);
                return {
                    success: false,
                    message: 'Broker not found',
                    broker: null,
                };
            }
            const { password: _, ...sanitized } = broker;
            return { success: true, broker: sanitized };
        } catch (err) {
            this.logger.error(`Failed to get broker by id ${dto.id}:`, err);
            throw err;
        }
    }

    async saveUserInfo(dto: SaveUserInfoDto) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { id: dto.userId } });
            if (!broker) {
                this.logger.warn(`Broker not found for saveUserInfo: userId=${dto.userId}`);
                return {
                    success: false,
                    message: `Broker with id ${dto.userId} not found`,
                    user: null,
                };
            }

            const updateData: Record<string, any> = {
                updatedAt: new Date(),
            };

            if (dto.username !== undefined && dto.username !== null && dto.username.trim() !== '') {
                updateData.username = dto.username;
            }
            if (dto.email !== undefined && dto.email !== null && dto.email.trim() !== '') {
                updateData.email = dto.email;
            }
            if (dto.phoneNumber !== undefined && dto.phoneNumber !== null && dto.phoneNumber.trim() !== '') {
                updateData.phoneNumber = dto.phoneNumber;
            }
            if (dto.photoURL !== undefined && dto.photoURL !== null && dto.photoURL.trim() !== '') {
                updateData.brokerImage = dto.photoURL;
            }

            await this.brokerRepo.update(broker.id, updateData);
            await this.invalidateBrokerCache(broker.brokerCode);

            const updated = await this.brokerRepo.findOne({ where: { id: broker.id } });
            if (!updated) {
                return {
                    success: false,
                    message: 'Broker not found after update',
                    user: null,
                };
            }

            const { password: _, ...sanitized } = updated;
            return {
                success: true,
                message: 'User info saved successfully',
                user: sanitized,
            };
        } catch (err) {
            this.logger.error(`Failed to save user info for ${dto.userId}:`, err);
            throw err;
        }
    }

    async updateUserField(dto: UpdateUserFieldDto) {
        try {
            const broker = await this.brokerRepo.findOne({ where: { id: dto.id } });
            if (!broker) {
                this.logger.warn(`Broker not found for updateUserField: id=${dto.id}`);
                return {
                    success: false,
                    message: `Broker with id ${dto.id} not found`,
                    user: null,
                };
            }

            const allowedFields = new Set([
                'username',
                'email',
                'phoneNumber',
                'title',
                'brokerImage',
                'location',
                'bookingNotificationsEnabled',
            ]);

            const fieldsToUpdate: Record<string, any> = {
                updatedAt: new Date(),
            };

            for (const [key, value] of Object.entries(dto.fields || {})) {
                if (allowedFields.has(key) && value !== undefined && value !== null && String(value).trim() !== '') {
                    fieldsToUpdate[key] = value;
                }
            }

            if (Object.keys(fieldsToUpdate).length === 1) {
                return {
                    success: false,
                    message: 'No valid fields provided for update',
                    user: null,
                };
            }

            await this.brokerRepo.update(broker.id, fieldsToUpdate);
            await this.invalidateBrokerCache(broker.brokerCode);

            const updated = await this.brokerRepo.findOne({ where: { id: broker.id } });
            if (!updated) {
                return {
                    success: false,
                    message: 'Broker not found after update',
                    user: null,
                };
            }

            const { password: _, ...sanitized } = updated;
            return {
                success: true,
                message: 'User field updated successfully',
                user: sanitized,
            };
        } catch (err) {
            this.logger.error(`Failed to update user field for ${dto.id}:`, err);
            throw err;
        }
    }

    private async getBrokerCache(brokerCode: string): Promise<any> {
        try {
            const cached = await (this.redisClient as any).store.get(`broker:cache:${brokerCode}`);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch {
            // ignore cache miss
        }
        return null;
    }

    private async setBrokerCache(brokerCode: string, broker: BrokerEntity): Promise<void> {
        try {
            const { password: _, ...sanitized } = broker;
            const payload = JSON.stringify(sanitized);
            await (this.redisClient as any).store.set(`broker:cache:${brokerCode}`, payload, 'EX', 300);
            await (this.redisClient as any).store.set(`broker:cache:${broker.id}`, payload, 'EX', 300);
        } catch {
            // ignore cache set errors
        }
    }

    private async invalidateBrokerCache(brokerCode: string): Promise<void> {
        try {
            await (this.redisClient as any).store.del(`broker:cache:${brokerCode}`);
            const broker = await this.brokerRepo.findOne({ where: { brokerCode } });
            if (broker) {
                await (this.redisClient as any).store.del(`broker:cache:${broker.id}`);
            }
        } catch {
            // ignore cache invalidation errors
        }
    }
}
