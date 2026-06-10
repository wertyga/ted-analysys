import crypto from 'crypto';
import { HASH_CONFIG } from '@/config/hash.config';

export const generateHash = (value: string) => {
  return crypto
    .createHmac('sha256', HASH_CONFIG.secret)
    .update(value)
    .digest('hex');
};

export const generateToken = (fieldToHash: string = '') => {
  return `${generateHash(fieldToHash)}.${generateHash(crypto.randomUUID())}`;
};
