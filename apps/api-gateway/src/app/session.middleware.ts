import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ProxyService } from './proxy.service';

const PUBLIC_WEB_PATHS = [
  '/api/web/auth/login',
  '/api/web/auth/broker/login',
  '/api/web/auth/broker/setup',
  '/api/web/auth/refresh',
  '/api/web/session/validate',
  '/api/web/public/properties',
  '/api/web/public/properties/featured',
  '/api/web/public/search',
  '/api/web/customer/bookings',
  '/api/broker/register',
  '/api/broker/otp',
  '/api/customer/session',
];

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private readonly proxyService: ProxyService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const path = req.path;
    if (!path.startsWith('/api/web/') && !path.startsWith('/api/broker/') && !path.startsWith('/api/customer/')) {
      return next();
    }

    let sessionId = (req.headers['x-session-id'] || req.headers['X-Session-Id']) as string | undefined;

    if (!sessionId && req.body) {
      sessionId = (req.body.sessionToken || req.body.sessionID || req.body.session_id) as string | undefined;
    }

    if (sessionId) {
      try {
        const brokerResult: any = await this.proxyService.forwardToAuth('ValidateBrokerSession', {
          sessionToken: sessionId,
        });
        if (brokerResult?.valid) {
          (req as any).session = {
            type: 'broker',
            brokerCode: brokerResult.brokerCode,
            userId: brokerResult.userId,
            email: brokerResult.email,
            deviceId: brokerResult.deviceId,
            expiresAt: brokerResult.expiresAt,
            sessionId,
          };
        }
      } catch {}

      if (!(req as any).session) {
        try {
          const customerResult: any = await this.proxyService.forwardToAuth('ValidateCustomerSession', {
            sessionToken: sessionId,
          });
          if (customerResult?.valid) {
            (req as any).session = {
              type: 'customer',
              userId: customerResult.userId,
              deviceId: customerResult.deviceId,
              expiresAt: customerResult.expiresAt,
              sessionId,
            };
          }
        } catch {}
      }
    }

    if (PUBLIC_WEB_PATHS.some((p) => path === p || path.startsWith(p + '/'))) {
      return next();
    }

    if (!sessionId) {
      throw new HttpException('x-session-id header or body sessionToken is required', HttpStatus.UNAUTHORIZED);
    }

    if (!(req as any).session) {
      throw new HttpException('Invalid or expired sessionId', HttpStatus.UNAUTHORIZED);
    }

    return next();
  }
}
