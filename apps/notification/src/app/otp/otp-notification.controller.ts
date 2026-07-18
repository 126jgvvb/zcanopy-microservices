import { Controller, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { NotificationService } from './notification.service';
import type { OtpNotificationPayload } from './otp-payload.interface';
import type { PaymentNotificationPayload, BrokerApprovalPayload, BrokerCreatedPayload } from './notification.service';

@Controller()
export class OtpNotificationController {
  private readonly logger = new Logger(OtpNotificationController.name);

  constructor(private readonly notificationService: NotificationService) {}

  @EventPattern('send_email_otp')
  async handleEmailOtp(@Payload() payload: OtpNotificationPayload) {
    this.logger.log(`Received send_email_otp for ${payload.email}`);
    try {
      await this.notificationService.sendEmailOtp(payload);
    } catch (error) {
      this.logger.error(`Failed to send email OTP: ${(error as Error).message}`);
    }
  }

  @EventPattern('send_sms_otp')
  async handleSmsOtp(@Payload() payload: OtpNotificationPayload) {
    this.logger.log(`Received send_sms_otp for ${payload.phoneNumber}`);
    try {
      await this.notificationService.sendSmsOtp(payload);
    } catch (error) {
      this.logger.error(`Failed to send sms OTP: ${(error as Error).message}`);
    }
  }

  @EventPattern('send_whatsapp_otp')
  async handleWhatsappOtp(@Payload() payload: OtpNotificationPayload) {
    this.logger.log(`Received send_whatsapp_otp for ${payload.phoneNumber}`);
    try {
      await this.notificationService.sendWhatsappOtp(payload);
    } catch (error) {
      this.logger.error(`Failed to send whatsapp OTP: ${(error as Error).message}`);
    }
  }

  @EventPattern('send_payment_email')
  async handlePaymentEmail(@Payload() payload: PaymentNotificationPayload) {
    this.logger.log(`Received send_payment_email for ${payload.email}`);
    try {
      await this.notificationService.sendPaymentEmail(payload);
    } catch (error) {
      this.logger.error(`Failed to send payment email: ${(error as Error).message}`);
    }
  }

  @EventPattern('send_payment_sms')
  async handlePaymentSms(@Payload() payload: PaymentNotificationPayload) {
    this.logger.log(`Received send_payment_sms for ${payload.phoneNumber}`);
    try {
      await this.notificationService.sendPaymentSms(payload);
    } catch (error) {
      this.logger.error(`Failed to send payment SMS: ${(error as Error).message}`);
    }
  }

  @EventPattern('send_admin_payment_email')
  async handleAdminPaymentEmail(@Payload() payload: PaymentNotificationPayload) {
    this.logger.log(`Received send_admin_payment_email for ${payload.email}`);
    try {
      await this.notificationService.sendPaymentEmail(payload);
    } catch (error) {
      this.logger.error(`Failed to send admin payment email: ${(error as Error).message}`);
    }
  }

  @EventPattern('send_admin_payment_sms')
  async handleAdminPaymentSms(@Payload() payload: PaymentNotificationPayload) {
    this.logger.log(`Received send_admin_payment_sms for ${payload.phoneNumber}`);
    try {
      await this.notificationService.sendPaymentSms(payload);
    } catch (error) {
      this.logger.error(`Failed to send admin payment SMS: ${(error as Error).message}`);
    }
  }

  @EventPattern('send_property_payment_email')
  async handlePropertyPaymentEmail(@Payload() payload: any) {
    this.logger.log(`Received send_property_payment_email for ${payload.email}`);
    try {
      await this.notificationService.sendPropertyPaymentEmail(payload);
    } catch (error) {
      this.logger.error(`Failed to send property payment email: ${(error as Error).message}`);
    }
  }

  @EventPattern('send_property_payment_sms')
  async handlePropertyPaymentSms(@Payload() payload: any) {
    this.logger.log(`Received send_property_payment_sms for ${payload.phoneNumber}`);
    try {
      await this.notificationService.sendPropertyPaymentSms(payload);
    } catch (error) {
      this.logger.error(`Failed to send property payment SMS: ${(error as Error).message}`);
    }
  }

  @EventPattern('send_admin_property_payment_email')
  async handleAdminPropertyPaymentEmail(@Payload() payload: any) {
    this.logger.log(`Received send_admin_property_payment_email for ${payload.email}`);
    try {
      await this.notificationService.sendPropertyPaymentEmail(payload);
    } catch (error) {
      this.logger.error(`Failed to send admin property payment email: ${(error as Error).message}`);
    }
  }

  @EventPattern('send_broker_property_payment_email')
  async handleBrokerPropertyPaymentEmail(@Payload() payload: any) {
    this.logger.log(`Received send_broker_property_payment_email for ${payload.email}`);
    try {
      await this.notificationService.sendPropertyPaymentEmail(payload);
    } catch (error) {
      this.logger.error(`Failed to send broker property payment email: ${(error as Error).message}`);
    }
  }

  @EventPattern('send_admin_message_email')
  async handleAdminMessageEmail(@Payload() payload: any) {
    this.logger.log(`Received send_admin_message_email for ${payload.recipientEmail}`);
    try {
      await this.notificationService.sendAdminMessage({
        channel: 'email',
        recipientEmail: payload.recipientEmail,
        recipientName: payload.recipientName,
        subject: payload.subject,
        body: payload.body,
      });
    } catch (error) {
      this.logger.error(`Failed to send admin message email: ${(error as Error).message}`);
    }
  }

  @EventPattern('send_admin_message_sms')
  async handleAdminMessageSms(@Payload() payload: any) {
    this.logger.log(`Received send_admin_message_sms for ${payload.recipientPhone}`);
    try {
      await this.notificationService.sendAdminMessage({
        channel: 'sms',
        recipientPhone: payload.recipientPhone,
        recipientName: payload.recipientName,
        body: payload.body,
      });
    } catch (error) {
      this.logger.error(`Failed to send admin message SMS: ${(error as Error).message}`);
    }
  }

  @EventPattern('broker_code_created')
  async handleBrokerCodeCreated(@Payload() payload: { email: string; username: string; brokerCode: string }) {
    this.logger.log(`Received broker_code_created for ${payload.email}`);
    try {
      await this.notificationService.sendBrokerCodeCreated(payload);
    } catch (error) {
      this.logger.error(`Failed to send broker code created notification: ${(error as Error).message}`);
    }
  }

  @EventPattern('send_broker_approved_email')
  async handleBrokerApprovedEmail(@Payload() payload: BrokerApprovalPayload) {
    this.logger.log(`Received send_broker_approved_email for ${payload.email}`);
    try {
      await this.notificationService.sendBrokerApprovalEmail(payload);
    } catch (error) {
      this.logger.error(`Failed to send broker approval email: ${(error as Error).message}`);
    }
  }

  @EventPattern('send_broker_approved_sms')
  async handleBrokerApprovedSms(@Payload() payload: BrokerApprovalPayload) {
    this.logger.log(`Received send_broker_approved_sms for ${payload.phoneNumber}`);
    try {
      await this.notificationService.sendBrokerApprovalSms(payload);
    } catch (error) {
      this.logger.error(`Failed to send broker approval SMS: ${(error as Error).message}`);
    }
  }

  @EventPattern('broker_created')
  async handleBrokerCreated(@Payload() payload: BrokerCreatedPayload) {
    this.logger.log(`Received broker_created for ${payload.email}`);
    try {
      await this.notificationService.sendBrokerCreated(payload);
    } catch (error) {
      this.logger.error(`Failed to send broker created notification: ${(error as Error).message}`);
    }
  }

  @EventPattern('payment_failed')
  async handlePaymentFailed(@Payload() payload: any) {
    this.logger.log(`Received payment_failed for broker ${payload.brokerId}`);
    try {
      await this.notificationService.sendPaymentFailed(payload);
    } catch (error) {
      this.logger.error(`Failed to send payment failed notification: ${(error as Error).message}`);
    }
  }

  @EventPattern('broker_login_new_device')
  async handleBrokerLoginNewDevice(@Payload() payload: any) {
    this.logger.log(`Received broker_login_new_device for broker ${payload.brokerCode}`);
    try {
      await this.notificationService.sendBrokerLoginNewDevice(payload);
    } catch (error) {
      this.logger.error(`Failed to send broker new device login notification: ${(error as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Request/response message patterns (used by the API gateway)
  // ---------------------------------------------------------------------------

  @MessagePattern('get_notifications')
  async getNotifications(@Payload() payload: any) {
    this.logger.log(`Received get_notifications request (brokerCode=${payload?.brokerCode ?? ''}, recipient=${payload?.recipient ?? ''})`);
    return this.notificationService.getNotifications({
      page: payload?.page,
      limit: payload?.limit,
      status: payload?.status,
      type: payload?.type,
      channel: payload?.channel,
      recipient: payload?.recipient,
      brokerCode: payload?.brokerCode,
      read: payload?.read,
    });
  }

  @MessagePattern('mark_as_read')
  async markAsRead(@Payload() payload: any) {
    this.logger.log(`Received mark_as_read request (id=${payload?.id ?? ''}, brokerCode=${payload?.brokerCode ?? ''})`);
    return this.notificationService.markAsRead({
      id: payload?.id,
      ids: payload?.ids,
      recipient: payload?.recipient,
      brokerCode: payload?.brokerCode,
      all: payload?.all,
    });
  }
}

