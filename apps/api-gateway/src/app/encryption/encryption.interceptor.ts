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
        this.logger.log(`Response before encryption [${route}]: ${JSON.stringify(data)}`);
        try {
          return await this.encryptionService.encryptResponse(data);
        } catch {
          return data;
        }
      }),
    );
  }
}
