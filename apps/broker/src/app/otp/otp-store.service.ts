import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_OTP_CLIENT } from './redis-otp.provider';

export type OtpChannel = 'email' | 'phone';

/**
 * OtpStoreService generates, stores and verifies short-lived OTP codes.
 * Codes are stored in Redis with a TTL so they expire automatically.
 */
@Injectable()
export class OtpStoreService {
  /** OTP validity window in seconds. */
  readonly ttlSeconds = 300; // 5 minutes

  /** OTP length in digits. */
  private readonly otpLength = 6;

  /** Minimum seconds a caller must wait between OTP requests for a target. */
  readonly resendCooldownSeconds = 60;

  constructor(@Inject(REDIS_OTP_CLIENT) private readonly redis: Redis) {}

  /**
   * Enforces a per-destination cooldown between OTP dispatches. Returns the
   * number of seconds the caller must wait, or 0 when a new OTP may be sent.
   * Sets the cooldown lock atomically when allowed.
   */
  async checkAndSetCooldown(channel: OtpChannel, destination: string): Promise<number> {
    const key = this.cooldownKey(channel, destination);
    // NX + EX: only set (and allow) when no active cooldown exists.
    const acquired = await this.redis.set(key, '1', 'EX', this.resendCooldownSeconds, 'NX');
    if (acquired === 'OK') {
      return 0;
    }
    const ttl = await this.redis.ttl(key);
    return ttl > 0 ? ttl : this.resendCooldownSeconds;
  }

  private cooldownKey(channel: OtpChannel, destination: string): string {
    return `otp:cooldown:${channel}:${destination}`;
  }

  /**
   * Generates a numeric OTP, stores it in Redis keyed by channel + destination,
   * and returns the plaintext code so the caller can dispatch it.
   */
  async generateAndStore(channel: OtpChannel, destination: string): Promise<string> {
    const otp = this.randomOtp();
    await this.redis.set(this.key(channel, destination), otp, 'EX', this.ttlSeconds);
    return otp;
  }

  /**
   * Verifies a submitted OTP against the stored value. On success the stored
   * OTP is deleted so it cannot be reused.
   */
  async verify(channel: OtpChannel, destination: string, submittedOtp: string): Promise<boolean> {
    if (!submittedOtp) return false;

    const key = this.key(channel, destination);
    const storedOtp = await this.redis.get(key);
    if (!storedOtp) return false;

    const isValid = storedOtp === String(submittedOtp).trim();
    if (isValid) {
      await this.redis.del(key);
    }
    return isValid;
  }

  private randomOtp(): string {
    const min = 10 ** (this.otpLength - 1);
    const max = 10 ** this.otpLength - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
  }

  private key(channel: OtpChannel, destination: string): string {
    return `otp:${channel}:${destination}`;
  }
}
