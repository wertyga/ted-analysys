import { Freemius } from '@freemius/sdk';

let freemius: Freemius | null = null;

export function getFreemius() {
  if (freemius) {
    return freemius;
  }

  const config = {
    productId: process.env.FREEMIUS_PRODUCT_ID,
    apiKey: process.env.FREEMIUS_API_KEY,
    secretKey: process.env.FREEMIUS_SECRET_KEY,
    publicKey: process.env.FREEMIUS_PUBLIC_KEY,
  };

  const missingConfig = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingConfig.length) {
    throw new Error(
      `Missing Freemius configuration: ${missingConfig.join(', ')}`,
    );
  }

  freemius = new Freemius({
    productId: config.productId!,
    apiKey: config.apiKey!,
    secretKey: config.secretKey!,
    publicKey: config.publicKey!,
  });

  return freemius;
}
