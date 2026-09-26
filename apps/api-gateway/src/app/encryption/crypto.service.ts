import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private keyBuffer: Buffer;

  constructor() {
    const key = process.env.ENCRYPTION_KEY;
    if (key) {
      console.log('[CryptoService] Using ENCRYPTION_KEY from environment');
      this.keyBuffer = Buffer.from(key, 'hex');
      if (this.keyBuffer.length !== 32) {
        this.keyBuffer = Buffer.from(key, 'base64').subarray(0, 32);
      }
      if (this.keyBuffer.length !== 32) {
        throw new Error('ENCRYPTION_KEY must decode to 32 bytes');
      }
      return;
    }
    console.log('[CryptoService] ENCRYPTION_KEY not set, using insecure development fallback key');
    this.keyBuffer = Buffer.from(
      'sBXZBcqwKPmzNv+ifnUFdgVkh01jgTqDgGALrBgMIRLmQbcwJtc6Vb4W+axZRe+w',
      'base64',
    ).subarray(0, 32);
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
