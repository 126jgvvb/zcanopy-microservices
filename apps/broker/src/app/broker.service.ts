import { BadRequestException, Inject, Injectable, NotFoundException, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { BrokerDto, RequestOtpDto, ResendOtpDto, LoginBrokerDto, CreateBrokerSessionDto, GetBrokerSessionsDto, RevokeBrokerSessionDto, GetBrokerByCodeDto, UpdateBrokerSettingsDto, GetAvailableTiersDto, SubmitBrokerFeedbackDto, GetBrokerMessagesDto, LogoutBrokerDto, UnsubscribeBrokerDto, RequestUnsubscribeOtpDto, SetupBrokerAccountDto, SearchBrokersDto } from './dtos/broker-dto';
import { BrokerEntity } from '../entity/broker.entity';
import { PayoutsEntity } from '../entity/payouts.entity';
import { BrokerWalletTransactionEntity } from '../entity/broker-wallet-transaction.entity';
import { BrokerFeedbackEntity } from '../entity/broker-feedback.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
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

        constructor(
            @InjectRepository(BrokerEntity)
            private readonly brokerRepo:Repository<BrokerEntity>,
            @InjectRepository(PayoutsEntity)
            private readonly payoutsRepo:Repository<PayoutsEntity>,
            @InjectRepository(BrokerWalletTransactionEntity)
            private readonly _walletTransactionRepo:Repository<BrokerWalletTransactionEntity>,
            @InjectRepository(BrokerFeedbackEntity)
            private readonly feedbackRepo:Repository<BrokerFeedbackEntity>,
            @Inject('REDIS_CLIENT') private readonly redisClient:ClientProxy,
            @Inject('PROPERTY_CLIENT') private readonly propertyClient: ClientProxy,
            @Inject('PAYMENT_CLIENT') private readonly paymentClient: ClientProxy,
            @Inject('ADMIN_CLIENT') private readonly _adminClient: ClientProxy,
            private readonly otpStore:OtpStoreService
        ){}


        async onModuleInit() {
            this.subscriber = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: Number(process.env.REDIS_PORT) || 6379,
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
        }

        async handleAdminMessageToBroker(data: { brokerId: string; message: AdminMessagePayload }) {
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
        }

        async handleUpdateBrokerWallet(brokerCode: string, amount: number) {
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
        }

        async handleBrokerApproved(data: { brokerId: string }) {
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
        }

        async onModuleDestroy() {
            if (this.subscriber) {
                await this.subscriber.quit();
            }
        }

        async sendAsyncMessage(payload: Record<string, unknown>) {
            // .emit() triggers a fire-and-forget asynchronous message
            this.redisClient.emit('user_created_event', payload);
            return { success: true, message: 'Event emitted asynchronously.' };
        }

    /**
     * Step 0 of registration: generate OTP codes for the broker's email and
     * phone and dispatch them via the notification microservice over Redis.
     * The broker must then submit both codes to `createBroker`.
     */
    @GrpcMethod('BrokerService', 'request-otp')
    async requestOtp(dto: RequestOtpDto) {
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
    }
        

    @GrpcMethod('BrokerService', 'GetAllBrokers')
    async getAllBrokers(query: { page: number; limit: number }) {
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
    }
    



    @GrpcMethod('BrokerService', 'GetBrokerById')
    async getBrokerById(id: string) {
        const broker = await this.brokerRepo.findOne({ where: { id } });
        if (!broker) {
            throw new NotFoundException(`Broker with id ${id} not found`);
        }
        return broker;
    }

    @GrpcMethod('BrokerService', 'ValidateBroker')
    async validateBroker(dto: { email: string; password: string }) {
        const broker = await this.brokerRepo.findOne({ where: { email: dto.email } });
        if (!broker) {
            throw new NotFoundException('Broker not found');
        }

        if (broker.password !== dto.password) {
            throw new BadRequestException('Invalid password');
        }

        const { password: _, ...sanitized } = broker;
        return sanitized;
    }

    /*
    1.confirm email & phone thru otp,
    2.generate code,
    3.save,
    4.send code to broker,
    5. alert admin
    */
    @GrpcMethod('BrokerService', 'CreateBroker')
    async createBroker(broker: BrokerDto) {
        // 1. Verify the broker owns both the email and phone via OTP before
        //    doing anything else. OTPs must first be requested via `requestOtp`.
        if (!broker.emailOtp || !broker.phoneOtp) {
            throw new BadRequestException('emailOtp and phoneOtp are required. Request an OTP first.');
        }

        const isEmailValid = await this.otpStore.verify('email', broker.email, broker.emailOtp);
        if (!isEmailValid) {
            throw new BadRequestException('Invalid or expired email OTP');
        }

        const isPhoneValid = await this.otpStore.verify('phone', broker.phoneNumber, broker.phoneOtp);
        if (!isPhoneValid) {
            throw new BadRequestException('Invalid or expired phone OTP');
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
    }

    /**
     * Called (via a Redis event) when an admin has reviewed the broker's
     * documents and approved them. Flips the broker's verification flag and
     * notifies the property microservice to create a linked property record.
     */
    async markBrokerVerified(brokerId: string) {
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
                this.propertyClient.send('create-property', {
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
    }

    @GrpcMethod('BrokerService', 'ProcessSubscriptionPayment')
    async processSubscriptionPayment(dto: { phoneNumber: string; tier: string; brokerId: string }) {
        const broker = await this.brokerRepo.findOne({ where: { id: dto.brokerId } });
        if (!broker) {
            throw new NotFoundException(`Broker with id ${dto.brokerId} not found`);
        }

        const tierLimits = this.getSubscriptionLimits(dto.tier);
        const amount = this.getTierPrice(dto.tier);

        try {
            //initiating payment to the payment microservice
            const paymentResponse = await lastValueFrom(
                this.paymentClient.send('process-subscription-payment', {
                    phoneNumber: dto.phoneNumber,
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

    @GrpcMethod('BrokerService', 'GetAvailableTiers')
    async getAvailableTiers(_: GetAvailableTiersDto) {
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
    }

    @GrpcMethod('BrokerService', 'SubmitBrokerFeedback')
    async submitBrokerFeedback(dto: SubmitBrokerFeedbackDto) {
        const broker = await this.brokerRepo.findOne({ where: { brokerCode: dto.brokerCode } });
        if (!broker) {
            throw new NotFoundException(`Broker with code ${dto.brokerCode} not found`);
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
    }

    @GrpcMethod('BrokerService', 'ProcessPropertyPayment')
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
            throw new NotFoundException(`Broker with id ${dto.brokerId} not found`);
        }

        try {
            //initiating request to payment ms
            const paymentResponse = await lastValueFrom(
                this.paymentClient.send('process-property-payment', {
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
                this.propertyClient.send('add-allowed-viewer', {
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
        let code: string;
        let exists = true;

        do {
            code = Math.floor(10000000 + Math.random() * 90000000).toString();
            exists = await this.brokerRepo.exists({ where: { brokerCode: code } });
        } while (exists);

        return code;
    }



    @GrpcMethod('BrokerService', 'UpdateBroker')
    async updateBroker(id: string, broker: BrokerDto) {
        const existing = await this.brokerRepo.findOne({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`Broker with id ${id} not found`);
        }
        await this.brokerRepo.update(id, {
            username: broker.username,
            email: broker.email,
            brokerImage: broker.IDFront,
            ninImages: [broker.IDFront, broker.IDBack],
            updatedAt: new Date(),
        });
        return await this.brokerRepo.findOne({ where: { id } });
    }

    @GrpcMethod('BrokerService', 'UpdateBrokerSettings')
    async updateBrokerSettings(dto: UpdateBrokerSettingsDto) {
        const broker = await this.brokerRepo.findOne({ where: { brokerCode: dto.brokerCode } });
        if (!broker) {
            throw new NotFoundException(`Broker with code ${dto.brokerCode} not found`);
        }

        await this.brokerRepo.update(broker.id, {
            bookingNotificationsEnabled: dto.bookingNotificationsEnabled,
            updatedAt: new Date(),
        });

        await this.invalidateBrokerCache(dto.brokerCode);

        const updated = await this.brokerRepo.findOne({ where: { id: broker.id } });
        if (!updated) {
            throw new NotFoundException(`Broker with code ${dto.brokerCode} not found after update`);
        }

        const { password: _, ...sanitized } = updated;
        return sanitized;
    }

    private async handleBrokerPropertyPayment(data: { brokerCode: string; propertyId: string; amount: number; customerName: string; customerPhone: string; transactionCode: string; netAmount: number }) {
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
    }

    private async handleBrokerBookingCreated(data: { brokerCode: string; propertyId: string; propertyTitle: string; customerName: string; customerPhone: string; amount: number; transactionCode: string }) {
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
    }



    @GrpcMethod('BrokerService', 'GetPendingVerifications')
    async getPendingVerifications(query: { page: number; limit: number }) {
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
    }

    @GrpcMethod('BrokerService', 'GetRecentSignups')
    async getRecentSignups(query: { limit: number }) {
        const limit = Number(query.limit) || 10;
        const brokers = await this.brokerRepo.find({
            order: { createdAt: 'DESC' },
            take: limit,
        });
        return { brokers };
    }

    @GrpcMethod('BrokerService', 'EditBrokerTier')
    async editBrokerTier(dto: { id: string; subscriptionTier: string }) {
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
    }

    @GrpcMethod('BrokerService', 'DeleteBroker')
    async deleteBroker(id: string) {
        const existing = await this.brokerRepo.findOne({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`Broker with id ${id} not found`);
        }
        await this.brokerRepo.delete(id);
        return { message: `Broker with id ${id} deleted successfully` };
    }

    @GrpcMethod('BrokerService', 'GetBrokerDashboard')
    async getBrokerDashboard(dto: { brokerId: string }) {
        const broker = await this.brokerRepo.findOne({ where: { id: dto.brokerId } });
        if (!broker) {
            throw new NotFoundException(`Broker with id ${dto.brokerId} not found`);
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

        let minimumWithdrawal = 10000;
        try {
          const commissions = await lastValueFrom(
            this._adminClient.send('GetCommissions', {}),
          );
          minimumWithdrawal = commissions.minimumWithdrawal ?? 10000;
        } catch (err) {
          this.logger.warn(`Failed to fetch minimum withdrawal: ${(err as Error).message}`);
        }

        return {
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
    }

    @GrpcMethod('BrokerService', 'CreditWallet')
    async creditWallet(dto: { brokerId: string; amount: number; reason: string; createdBy: string; referenceNumber?: string }) {
        const broker = await this.brokerRepo.findOne({ where: { id: dto.brokerId } });
        if (!broker) {
            throw new NotFoundException(`Broker with id ${dto.brokerId} not found`);
        }

        const currentBalance = broker.walletBalance || 0;
        const newBalance = currentBalance + dto.amount;

        await this.brokerRepo.update(dto.brokerId, {
            walletBalance: newBalance,
            updatedAt: new Date(),
        });

        this.logger.log(`Credited wallet for broker ${dto.brokerId}: UGX ${dto.amount}. New balance: ${newBalance}`);

        return {
            newBalance,
            message: 'Wallet credited successfully',
        };
    }

    @GrpcMethod('BrokerService', 'DebitWallet')
    async debitWallet(dto: { brokerId: string; amount: number; reason: string; createdBy: string; referenceNumber?: string }) {
        const broker = await this.brokerRepo.findOne({ where: { id: dto.brokerId } });
        if (!broker) {
            throw new NotFoundException(`Broker with id ${dto.brokerId} not found`);
        }

        const currentBalance = broker.walletBalance || 0;
        if (currentBalance < dto.amount) {
            throw new BadRequestException('Insufficient wallet balance');
        }

        const newBalance = currentBalance - dto.amount;

        await this.brokerRepo.update(dto.brokerId, {
            walletBalance: newBalance,
            updatedAt: new Date(),
        });

        this.logger.log(`Debited wallet for broker ${dto.brokerId}: UGX ${dto.amount}. New balance: ${newBalance}`);

        return {
            newBalance,
            message: 'Wallet debited successfully',
        };
    }

    @GrpcMethod('BrokerService', 'Withdraw')
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
      this.logger.log(`Received broker withdraw request: amount=${dto.amount}, phone=${dto.phoneNumber}`);
      const result = await lastValueFrom(
        this.paymentClient.send('withdraw', {
          ...dto,
          walletType: 'broker',
        }),
      );
      return result;
    }

    @GrpcMethod('BrokerService', 'GetWallet')
    async getWallet(dto: { walletId?: string }) {
      this.logger.log(`Received broker getWallet request: ${dto.walletId || 'default'}`);
      const result = await lastValueFrom(
        this.paymentClient.send('getWallet', {
          walletType: 'broker',
          walletId: dto.walletId,
        }),
      );
      return result;
    }

    @GrpcMethod('BrokerService', 'GetWalletTransactions')
    async getWalletTransactions(dto: { brokerId: string; page: number; limit: number }) {
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
    }

    @GrpcMethod('BrokerService', 'ResendOtp')
    async resendOtp(dto: ResendOtpDto) {
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
    }

    @GrpcMethod('BrokerService', 'LoginBroker')
    async loginBroker(dto: LoginBrokerDto) {
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
    }

    @GrpcMethod('BrokerService', 'CreateBrokerSession')
    async createBrokerSession(dto: CreateBrokerSessionDto) {
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
    }

    @GrpcMethod('BrokerService', 'GetBrokerSessions')
    async getBrokerSessions(dto: GetBrokerSessionsDto) {
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
    }

    @GrpcMethod('BrokerService', 'RevokeBrokerSession')
    async revokeBrokerSession(dto: RevokeBrokerSessionDto) {
        if (!dto.brokerCode || !dto.sessionId) {
            throw new BadRequestException('brokerCode and sessionId are required');
        }

        await (this.redisClient as any).store.del(`broker:session:${dto.sessionId}`);
        await (this.redisClient as any).store.sRem(`broker:sessions:${dto.brokerCode}`, dto.sessionId);

        return {
            success: true,
            message: 'Session revoked successfully',
        };
    }

    @GrpcMethod('BrokerService', 'GetBrokerByCode')
    async getBrokerByCode(dto: GetBrokerByCodeDto) {
        if (!dto.brokerCode) {
            throw new BadRequestException('brokerCode is required');
        }

        const cached = await this.getBrokerCache(dto.brokerCode);
        if (cached) {
            return cached;
        }

        const broker = await this.brokerRepo.findOne({ where: { brokerCode: dto.brokerCode } });
        if (!broker) {
            throw new NotFoundException('Broker not found');
        }

        await this.setBrokerCache(dto.brokerCode, broker);
        const { password: _, ...sanitized } = broker;
        return sanitized;
    }

    @GrpcMethod('BrokerService', 'SearchBrokers')
    async searchBrokers(dto: SearchBrokersDto) {
        if (!dto.query || dto.query.trim().length === 0) {
            return { brokers: [] };
        }

        const searchTerm = `%${dto.query.trim().toLowerCase()}%`;
        const brokers = await this.brokerRepo
            .createQueryBuilder('broker')
            .where('LOWER(broker.username) LIKE :searchTerm', { searchTerm })
            .orWhere('LOWER(broker.title) LIKE :searchTerm', { searchTerm })
            .getMany();

        const sanitized = brokers.map(({ password: _, ...rest }) => rest);
        return { brokers: sanitized };
    }

    @GrpcMethod('BrokerService', 'GetBrokerMessages')
    async getBrokerMessages(dto: GetBrokerMessagesDto) {
        const broker = await this.brokerRepo.findOne({ where: { id: dto.brokerId } });
        if (!broker) {
            throw new NotFoundException(`Broker with id ${dto.brokerId} not found`);
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
            messages,
            categorized,
            total: messages.length,
        };
    }

    @GrpcMethod('BrokerService', 'LogoutBroker')
    async logoutBroker(dto: LogoutBrokerDto) {
        const broker = await this.brokerRepo.findOne({ where: { brokerCode: dto.brokerCode } });
        if (!broker) {
            throw new NotFoundException(`Broker with code ${dto.brokerCode} not found`);
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
    }

    /**
     * Step 1 of the unsubscribe flow. Before a broker can unsubscribe/delete
     * their account we send a one-time code to their registered email. The
     * broker must confirm this code (via `unsubscribeBroker`) to proceed.
     */
    @GrpcMethod('BrokerService', 'RequestUnsubscribeOtp')
    async requestUnsubscribeOtp(dto: RequestUnsubscribeOtpDto) {
        if (!dto.brokerCode) {
            throw new BadRequestException('brokerCode is required');
        }

        const broker = await this.brokerRepo.findOne({ where: { brokerCode: dto.brokerCode } });
        if (!broker) {
            throw new NotFoundException(`Broker with code ${dto.brokerCode} not found`);
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
    }

    @GrpcMethod('BrokerService', 'UnsubscribeBroker')
    async unsubscribeBroker(dto: UnsubscribeBrokerDto) {
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
    }

    @GrpcMethod('BrokerService', 'SetupBrokerAccount')
    async setupBrokerAccount(dto: SetupBrokerAccountDto) {
        const { brokerCode, password, deviceId } = dto;

        if (!brokerCode) {
            throw new BadRequestException('brokerCode is required');
        }
        if (!password) {
            throw new BadRequestException('password is required');
        }
        if (!deviceId) {
            throw new BadRequestException('deviceId is required');
        }

        const broker = await this.brokerRepo.findOne({ where: { brokerCode } });
        if (!broker) {
            throw new NotFoundException(`Broker with code ${brokerCode} not found`);
        }

        // Set the password and bind the device for this broker's first sign-in.
        await this.brokerRepo.update(broker.id, {
            password,
            deviceId,
            lastLogin: new Date(),
            isActive: true,
            updatedAt: new Date(),
        });

        await this.invalidateBrokerCache(brokerCode);

        const updated = await this.brokerRepo.findOne({ where: { brokerCode } });
        if (!updated) {
            throw new NotFoundException(`Broker with code ${brokerCode} not found after setup`);
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