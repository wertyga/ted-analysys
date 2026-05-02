import { NotFoundException } from '@nestjs/common';
import { TendersService } from './tenders.service';

describe('TendersService publication number ids', () => {
  let service: TendersService;

  beforeEach(() => {
    service = new TendersService(
      {} as ConstructorParameters<typeof TendersService>[0],
      {} as ConstructorParameters<typeof TendersService>[1],
      {} as ConstructorParameters<typeof TendersService>[2],
    );
  });

  it('keeps ensured tender identity as clear TED publication number', () => {
    expect(
      service.ensureTedIdentity({ id: 'old', source: 'TED' }, '58725-2024'),
    ).toMatchObject({
      id: '58725-2024',
      sourceNoticeId: '58725-2024',
      publicationNumber: '58725-2024',
    });
  });

  it('rejects prefixed ids when fetching from TED', async () => {
    jest.spyOn(service, 'findLocalTender').mockResolvedValue(null);

    await expect(
      service.findByIdOrFetchFromTed('ted-58725-2024'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
