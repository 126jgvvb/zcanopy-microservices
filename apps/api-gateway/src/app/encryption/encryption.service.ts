import { Injectable, BadRequestException } from '@nestjs/common';
import { CryptoService } from './crypto.service';

@Injectable()
export class EncryptionService {
  constructor(private readonly cryptoService: CryptoService) {}

  async decryptRequestBody(body: any): Promise<any> {
    if (!body || !body.encrypted) {
      return body;
    }

    try {
      if (typeof body.payload === 'string') {
        const decrypted = await this.cryptoService.decrypt(body.payload);
        return JSON.parse(decrypted);
      }

      return body;
    } catch {
      throw new BadRequestException('Failed to decrypt request payload');
    }
  }

  async encryptResponse(data: any): Promise<any> {
    if (!data) {
      return data;
    }

    try {
      const jsonStr = JSON.stringify(data);
      const encrypted = await this.cryptoService.encrypt(jsonStr);
      return { encrypted: true, payload: encrypted };
    } catch {
      throw new BadRequestException('Failed to encrypt response payload');
    }
  }
}
