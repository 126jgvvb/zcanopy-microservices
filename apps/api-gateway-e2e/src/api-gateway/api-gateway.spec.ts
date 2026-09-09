import axios from 'axios';
import { createDecipheriv } from 'crypto';

function decryptResponse(encryptedData: any): any {
  if (!encryptedData || !encryptedData.encrypted) {
    return encryptedData;
  }
  const buffer = Buffer.from(encryptedData.payload, 'base64');
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const key = Buffer.from('dev-only-insecure-encryption-key-change-me-1234567890', 'utf8').subarray(0, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

describe('GET /api', () => {
  it('should return a message', async () => {
    const res = await axios.get(`/api`);

    const decrypted = decryptResponse(res.data);

    expect(res.status).toBe(200);
    expect(decrypted).toEqual({ message: 'Hello API' });
  });
});
