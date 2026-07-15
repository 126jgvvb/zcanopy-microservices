/**
 * Shape of the OTP messages received from other microservices over Redis.
 * These are emitted by the broker (and other) services when an OTP needs to
 * be delivered to a user through one of the supported channels.
 */
export interface OtpNotificationPayload {
  /** The one-time password to deliver. */
  otp: string;

  /** Destination email address (required for the email channel). */
  email?: string;

  /** Destination phone number in E.164 format (required for sms/whatsapp). */
  phoneNumber?: string;

  /** Optional human friendly name used in the message body. */
  username?: string;

  /** How long the OTP stays valid, in seconds. Used for the message copy. */
  ttlSeconds?: number;

  /** Free form context, e.g. "broker-registration". */
  purpose?: string;
}

export type OtpChannel = 'email' | 'sms' | 'whatsapp';
