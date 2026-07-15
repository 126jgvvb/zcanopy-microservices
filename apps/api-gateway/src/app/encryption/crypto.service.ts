import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private keyBuffer: Buffer;

  constructor() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      this.keyBuffer = Buffer.from('dev-only-insecure-encryption-key-change-me-1234567890', 'utf8').subarray(0, 32);
      console.warn('ENCRYPTION_KEY is not set; using an insecure development fallback key.');
      return;
    }
    this.keyBuffer = Buffer.from(key, 'hex');
    if (this.keyBuffer.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }
  }

  encrypt(plaintext: string): Promise<string> {
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.keyBuffer, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Promise.resolve(Buffer.concat([iv, authTag, encrypted]).toString('base64'));
  }

  decrypt(ciphertext: string): Promise<string> {
    const buffer = Buffer.from(ciphertext, 'base64');
    const iv = buffer.subarray(0, 12);
    const authTag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const decipher = createDecipheriv(this.algorithm, this.keyBuffer, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return Promise.resolve(decrypted.toString('utf8'));
  }
}
