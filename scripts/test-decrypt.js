const crypto = require('crypto');

const PAYLOAD = 'yjKmyo146Wt6V9olghnFZd/FSIAp4V2OwpdIkEKF9S/5pePaQ/UXwfwLbudVsAndRhAZL/C7EOhQtJYDGOovYsSIB1JSodmKo/nGOeCNtzMmZkcTk6XQBI8GeEWeq3ZswTSk1mSXK8PcW6wQEWBZxFmDdqm0oMapuR85vWsxKEIE';
const FALLBACK_KEY = 'sBXZBcqwKPmzNv+ifnUFdgVkh01jgTqDgGALrBgMIRLmQbcwJtc6Vb4W+axZRe+w';

function tryDecrypt(label, keyInput) {
  try {
    const keyBuffer = Buffer.from(keyInput, 'hex');
    if (keyBuffer.length !== 32) {
      const alt = Buffer.from(keyInput, 'base64').subarray(0, 32);
      if (alt.length === 32) {
        return doDecrypt(label, alt);
      }
      console.log(`[${label}] key length after decode=${keyBuffer.length}, skipped`);
      return;
    }
    return doDecrypt(label, keyBuffer);
  } catch (error) {
    console.log(`[${label}] failed: ${error.message}`);
  }
}

function doDecrypt(label, keyBuffer) {
  const buffer = Buffer.from(PAYLOAD, 'base64');
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  console.log(`[${label}] decrypted:`, decrypted);
  return decrypted;
}

tryDecrypt('fallback-base64', FALLBACK_KEY);
tryDecrypt('fallback-hex', Buffer.from(FALLBACK_KEY, 'base64').toString('hex'));

const backendKey = process.env.ENCRYPTION_KEY;
if (backendKey) {
  tryDecrypt('env-hex', backendKey);
  tryDecrypt('env-base64', backendKey);
} else {
  console.log('[env] ENCRYPTION_KEY is not set');
}
