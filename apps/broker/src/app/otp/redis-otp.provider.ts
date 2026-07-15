import { Provider } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Injection token for the low-level ioredis client used for OTP key/value
 * storage (with TTL). This is separate from the `REDIS_CLIENT` ClientProxy,
 * which is used for pub/sub style microservice events.
 */
export const REDIS_OTP_CLIENT = 'REDIS_OTP_CLIENT';

export const redisOtpProvider: Provider = {
  provide: REDIS_OTP_CLIENT,
  useFactory: () =>
    new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    }),
};
