import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';
import { NotificationMessage } from '../entities/notification-message.entity';

export interface SendSmsOptions {
  to: string;
  message: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);
  
  private brevoApiKey: string;
  private brevoSenderName: string;
  private brevoSenderEmail: string;
  
  private renderApiKey: string;
  private renderFromEmail: string;
  private renderApiUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    @InjectRepository(NotificationMessage)
    private readonly notificationMessageRepository: Repository<NotificationMessage>,
  ) {
    this.brevoApiKey = this.configService.get('BREVO_API_KEY') || '';
    this.brevoSenderName = this.configService.get('BREVO_SENDER_NAME') || 'SafetyMint';
    this.brevoSenderEmail = this.configService.get('BREVO_SENDER_EMAIL') || 'noreply@safetymint.com';
    
    this.renderApiKey = this.configService.get('RENDER_API_KEY') || '';
    this.renderFromEmail = this.configService.get('RENDER_FROM_EMAIL') || 'SafetyMint <noreply@safetymint.com>';
    this.renderApiUrl = this.configService.get('RENDER_API_URL') || 'https://api.render.com/v1';
  }

  async sendSms(options: SendSmsOptions): Promise<{ success: boolean; message: string; id?: string }> {
    const messageId = uuidv4();
    
    const notificationRecord = {
      id: messageId,
      type: 'transactional' as any,
      channel: 'sms' as any,
      to: options.to,
      subject: null,
      message: options.message,
      status: 'pending' as any,
      sentAt: null,
      failureReason: null,
    };

    try {
      this.databaseService.insertNotification(notificationRecord);
      
      if (!this.brevoApiKey) {
        this.logger.warn('Brevo API key not configured, storing notification only');
        this.databaseService.updateNotificationStatus(messageId, 'failed', undefined, 'Brevo API key not configured');
        return { success: false, message: 'Brevo API not configured', id: messageId };
      }
      
      const brevoResponse = await axios.post(
        'https://api.brevo.com/v3/sms/send',
        {
          sender: {
            name: this.brevoSenderName,
            email: this.brevoSenderEmail,
          },
          recipient: options.to.replace(/^\+/, ''),
          content: options.message,
        },
        {
          headers: {
            'api-key': this.brevoApiKey,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );
      
      if (brevoResponse.data?.messageId) {
        this.databaseService.updateNotificationStatus(messageId, 'sent', new Date().toISOString());
        this.logger.log(`SMS sent successfully to ${options.to}`);
        return { success: true, message: 'SMS sent successfully', id: messageId };
      }
      
      throw new Error(brevoResponse.data?.message || 'SMS sending failed');
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      this.logger.error(`Failed to send SMS to ${options.to}: ${errorMessage}`);
      this.databaseService.updateNotificationStatus(messageId, 'failed', undefined, errorMessage);
      return { success: false, message: errorMessage, id: messageId };
    }
  }

  async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; message: string; id?: string }> {
    const messageId = uuidv4();
    
    const notificationRecord = {
      id: messageId,
      type: 'transactional' as any,
      channel: 'email' as any,
      to: options.to,
      subject: options.subject,
      message: options.html,
      status: 'pending' as any,
      sentAt: null,
      failureReason: null,
    };

    try {
      this.databaseService.insertNotification(notificationRecord);
      
      if (!this.renderApiKey) {
        this.logger.warn('Render API key not configured, storing notification only');
        this.databaseService.updateNotificationStatus(messageId, 'failed', undefined, 'Render API key not configured');
        return { success: false, message: 'Render API not configured', id: messageId };
      }
      
      const renderResponse = await axios.post(
        `${this.renderApiUrl}/ostriches`,
        {
          from: this.renderFromEmail,
          to: options.to,
          subject: options.subject,
          html_body: options.html,
          text_body: options.text || this.stripHtml(options.html),
        },
        {
          headers: {
            'Authorization': `Bearer ${this.renderApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 20000,
        }
      );
      
      if (renderResponse.data?.uuid || renderResponse.data?.id) {
        this.databaseService.updateNotificationStatus(messageId, 'sent', new Date().toISOString());
        this.logger.log(`Email sent successfully to ${options.to}`);
        return { success: true, message: 'Email sent successfully', id: messageId };
      }
      
      throw new Error(renderResponse.data?.message || 'Email sending failed');
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      this.logger.error(`Failed to send email to ${options.to}: ${errorMessage}`);
      this.databaseService.updateNotificationStatus(messageId, 'failed', undefined, errorMessage);
      return { success: false, message: errorMessage, id: messageId };
    }
  }

  async sendOtpEmail(email: string, otp: string): Promise<{ success: boolean; message: string }> {
    return this.sendEmail({
      to: email,
      subject: 'Your SafetyMint Verification Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #00d4aa 0%, #00a88a 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; color: white; font-size: 24px; }
            .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px; }
            .otp-box { background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
            .otp-code { font-size: 32px; font-weight: bold; color: #00d4aa; letter-spacing: 8px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>SafetyMint</h1>
            </div>
            <div class="content">
              <h2>Email Verification</h2>
              <p>Your verification code is:</p>
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              <p><strong>This code expires in 10 minutes.</strong></p>
              <p>If you didn't request this code, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} SafetyMint. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Your SafetyMint verification code is: ${otp}. This code expires in 10 minutes.`,
    });
  }

  async sendWithdrawalNotification(
    phone: string,
    amount: number,
    fee: number,
    netAmount: number,
    provider: string
  ): Promise<{ success: boolean; message: string }> {
    return this.sendSms({
      to: phone,
      message: `SafetyMint: UGX ${netAmount.toLocaleString()} sent to your ${provider} account. Fee: UGX ${fee.toLocaleString()}. Reference: WD-${Date.now()}`,
    });
  }

  async sendPaymentReceivedNotification(
    phone: string,
    amount: number,
    memberName: string
  ): Promise<{ success: boolean; message: string }> {
    return this.sendSms({
      to: phone,
      message: `SafetyMint: Payment of UGX ${amount.toLocaleString()} received from ${memberName}. Thank you!`,
    });
  }

  async sendWelcomeEmail(email: string, name: string): Promise<{ success: boolean; message: string }> {
    return this.sendEmail({
      to: email,
      subject: 'Welcome to SafetyMint',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #00d4aa 0%, #00a88a 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; color: white; font-size: 24px; }
            .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px; }
            .feature { display: flex; align-items: center; margin: 15px 0; }
            .feature-icon { width: 40px; height: 40px; background: #00d4aa; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; }
            .feature-icon span { color: white; font-weight: bold; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>SafetyMint</h1>
            </div>
            <div class="content">
              <h2>Welcome, ${name}!</h2>
              <p>Thank you for joining SafetyMint. Your account has been created successfully.</p>
              <p>With SafetyMint, you can:</p>
              <div class="feature">
                <div class="feature-icon"><span>$</span></div>
                <div>Manage loans and payments seamlessly</div>
              </div>
              <div class="feature">
                <div class="feature-icon"><span>@</span></div>
                <div>Track all transactions in real-time</div>
              </div>
              <div class="feature">
                <div class="feature-icon"><span>&#9888;</span></div>
                <div>Get instant notifications</div>
              </div>
              <p>If you have any questions, please contact our support team.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} SafetyMint. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Welcome to SafetyMint, ${name}! Your account has been created successfully. With SafetyMint, you can manage loans and payments seamlessly, track all transactions in real-time, and get instant notifications.`,
    });
  }

  async sendWithdrawalEmail(
    email: string,
    amount: number,
    fee: number,
    netAmount: number,
    phoneNumber: string,
    provider: string,
    reference: string
  ): Promise<{ success: boolean; message: string }> {
    return this.sendEmail({
      to: email,
      subject: `Withdrawal Confirmed - UGX ${amount.toLocaleString()}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #00d4aa 0%, #00a88a 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; color: white; font-size: 24px; }
            .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px; }
            .amount-box { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .amount-row { display: flex; justify-content: space-between; margin: 10px 0; }
            .amount-label { color: #666; }
            .amount-value { font-weight: bold; }
            .total { border-top: 2px solid #00d4aa; padding-top: 10px; margin-top: 10px; }
            .reference { font-size: 12px; color: #888; text-align: center; margin-top: 20px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>SafetyMint</h1>
            </div>
            <div class="content">
              <h2>Withdrawal Confirmed</h2>
              <p>Your withdrawal has been processed successfully.</p>
              <div class="amount-box">
                <div class="amount-row">
                  <span class="amount-label">Amount Requested:</span>
                  <span class="amount-value">UGX ${amount.toLocaleString()}</span>
                </div>
                <div class="amount-row">
                  <span class="amount-label">Platform Fee (5%):</span>
                  <span class="amount-value" style="color: #e74c3c;">- UGX ${fee.toLocaleString()}</span>
                </div>
                <div class="amount-row total">
                  <span class="amount-label">Net Amount Sent:</span>
                  <span class="amount-value" style="color: #00d4aa; font-size: 18px;">UGX ${netAmount.toLocaleString()}</span>
                </div>
              </div>
              <p><strong>Sent to:</strong> ${provider} (${phoneNumber})</p>
              <div class="reference">Reference: ${reference}</div>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} SafetyMint. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Withdrawal Confirmed - UGX ${netAmount.toLocaleString()} sent to ${provider} (${phoneNumber}). Reference: ${reference}`,
    });
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  async createMessage(data: {
    type: string;
    content: string;
    referenceId?: string;
    metadata?: any;
  }): Promise<NotificationMessage> {
    const messageId = uuidv4();
    
    const message = this.notificationMessageRepository.create({
      id: messageId,
      type: data.type,
      channel: 'system',
      to: data.referenceId || 'system',
      subject: data.type === 'error' ? 'Error' : 'Information',
      message: data.content,
      status: 'sent',
      sentAt: new Date(),
      failureReason: null,
    });
    
    return this.notificationMessageRepository.save(message);
  }
}
