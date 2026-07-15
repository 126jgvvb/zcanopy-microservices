import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  const HEX_KEY = 'a'.repeat(64);

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('encrypts and decrypts with a configured key', async () => {
    process.env.ENCRYPTION_KEY = HEX_KEY;
    const svc = new CryptoService();
    const ciphertext = await svc.encrypt('hello world');
    expect(ciphertext).not.toBe('hello world');
    expect(await svc.decrypt(ciphertext)).toBe('hello world');
  });

  it('falls back to a dev key when ENCRYPTION_KEY is unset but still round-trips', async () => {
    delete process.env.ENCRYPTION_KEY;
    const svc = new CryptoService();
    const ciphertext = await svc.encrypt('secret');
    expect(await svc.decrypt(ciphertext)).toBe('secret');
  });

  it('throws when the key is not 32 bytes', () => {
    process.env.ENCRYPTION_KEY = 'abcd';
    expect(() => new CryptoService()).toThrow(/64-character hex/);
  });
});
