import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EncryptionService } from './encryption.service';

@Injectable()
export class EncryptionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(EncryptionInterceptor.name);

  constructor(private readonly encryptionService: EncryptionService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(async (data) => {
        const route = context.getClass().name + '/' + context.getHandler().name;
        if (route.includes('devLogin')) {
          return data;
        }
        if (route.startsWith('WebAuthController/') || route.startsWith('WebCustomerController/') || route.startsWith('WebBrokerController/')) {
          return data;
        }
        if (!this.shouldEncryptResponse(data)) {
          return data;
        }
        const jsonStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
        this.logger.log(`Encrypting response [${route}] (${jsonStr.length} bytes)`);
        try {
          return await this.encryptionService.encryptResponse(data);
        } catch {
          return data;
        }
      }),
    );
  }

  private shouldEncryptResponse(data: any): boolean {
    if (data === null || data === undefined) {
      return false;
    }

    if (Array.isArray(data)) {
      return false;
    }

    if (typeof data !== 'object') {
      return true;
    }

    const hasPaginationShape =
      data &&
      typeof data === 'object' &&
      ('total' in data || 'page' in data || 'limit' in data || 'hasMore' in data || 'totalPages' in data);

    if (hasPaginationShape) {
      return false;
    }

    const jsonStr = JSON.stringify(data);
    return jsonStr.length < 4096;
  }
}
