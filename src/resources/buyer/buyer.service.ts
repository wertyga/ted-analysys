import { Injectable } from '@nestjs/common';
import { BuyerNormalizer } from './buyer.normalizer';

@Injectable()
export class BuyerService {
  normalizer = new BuyerNormalizer();
}
