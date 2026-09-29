import {
  extractMoneySnippets,
  parseNumberToken,
  textContainsAmount,
} from './money-in-text';

describe('money in text', () => {
  it('reads both decimal conventions', () => {
    expect(parseNumberToken('3.199.999,06')).toContain(3_199_999.06);
    expect(parseNumberToken('3,199,999.06')).toContain(3_199_999.06);
    expect(parseNumberToken('1.234')).toEqual(
      expect.arrayContaining([1234, 1.234]),
    );
  });

  it('finds an amount written in the Portuguese format', () => {
    const text = 'Preço contratual: 3.199.999,06 € (sem IVA)';

    expect(textContainsAmount(text, 3_199_999.06)).toBe(true);
    expect(textContainsAmount(text, 3_199_999_063)).toBe(false);
  });

  it('finds amounts with space and apostrophe thousands', () => {
    expect(textContainsAmount('Prix : 4 865 587,34 EUR HT', 4_865_587.34)).toBe(
      true,
    );
    expect(textContainsAmount("CHF 1'344'000.00", 1_344_000)).toBe(true);
    const nbsp = String.fromCharCode(0xa0);
    expect(textContainsAmount(`1${nbsp}209${nbsp}891,08 €`, 1_209_891.08)).toBe(
      true,
    );
  });

  it('applies million words written after the number', () => {
    expect(
      textContainsAmount('concurso de 3,4 milhões de euros', 3_400_000),
    ).toBe(true);
    expect(
      textContainsAmount('entrate per 2,3 milioni di euro', 2_300_000),
    ).toBe(true);
    expect(textContainsAmount('Auftragswert 12 Mio. EUR', 12_000_000)).toBe(
      true,
    );
    expect(textContainsAmount('3,4 milhões de euros', 3_400_000_000)).toBe(
      false,
    );
  });

  it('does not match other numbers of the text', () => {
    expect(
      textContainsAmount('Contrato n.º 2023/145, prazo 365 dias', 3_199_999),
    ).toBe(false);
  });

  it('keeps only the parts around big numbers', () => {
    const filler = 'x'.repeat(1000);
    const text = `${filler} valor 3.199.999,06 € ${filler} page 12 ${filler}`;
    const snippets = extractMoneySnippets(text, { radius: 20 });

    expect(snippets).toContain('3.199.999,06');
    expect(snippets).not.toContain('page 12');
    expect(snippets.length).toBeLessThan(80);
  });
});
