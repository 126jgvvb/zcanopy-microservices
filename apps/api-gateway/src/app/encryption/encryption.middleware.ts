import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { EncryptionService } from './encryption.service';

@Injectable()
export class EncryptionMiddleware implements NestMiddleware {
  constructor(private readonly encryptionService: EncryptionService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    if (req.body && req.body.encrypted) {
      try {
        req.body = await this.encryptionService.decryptRequestBody(req.body);
      } catch {
        res.status(400).json({ message: 'Invalid encrypted payload' });
        return;
      }
    }

    next();
  }
}
