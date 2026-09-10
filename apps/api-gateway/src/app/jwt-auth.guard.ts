import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      this.logger.warn('JwtAuthGuard: no token found in Authorization header');
      throw new UnauthorizedException('No token provided');
    }

    const segments = token.split('.');
    this.logger.log(`JwtAuthGuard: received token length=${token.length}, segments=${segments.length}`);
    this.logger.log(`JwtAuthGuard: full token=${token}`);

    if (segments.length === 3) {
      try {
        const payloadJson = Buffer.from(segments[1], 'base64').toString('utf8');
        this.logger.log(`JwtAuthGuard: raw payload=${payloadJson}`);
      } catch (err) {
        this.logger.error(`JwtAuthGuard: failed to base64-decode payload: ${(err as Error).message}`);
      }
    }

    const devBypass = process.env.JWT_DEV_BYPASS_VERIFY === 'true';

    try {
      if (devBypass && segments.length === 3) {
        this.logger.warn('JwtAuthGuard: JWT_DEV_BYPASS_VERIFY is enabled - skipping signature verification');
        const payloadJson = Buffer.from(segments[1], 'base64').toString('utf8');
        const payload = JSON.parse(payloadJson);
        this.logger.log(`JwtAuthGuard: bypassed verification for email=${payload.email}, brokerCode=${payload.brokerCode}`);
        request.user = payload;
        return true;
      }

      const payload = this.jwtService.verify(token);
      this.logger.log(`JwtAuthGuard: token verified for email=${payload.email}, brokerCode=${payload.brokerCode}`);
      request.user = payload;
    } catch (err) {
      this.logger.error(`JwtAuthGuard: invalid token - ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
