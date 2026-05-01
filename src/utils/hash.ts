import crypto from 'crypto';

const SECRET = 'taste-my-shit';

export const generateHash = (value: string) => {
  return crypto.createHmac('sha256', SECRET).update(value).digest('hex');
};

export const generateToken = (fieldToHash: string = '') => {
  return `${generateHash(fieldToHash)}.${generateHash(crypto.randomUUID())}`;
};
