import { describe, expect, it } from 'vitest';
import { isValidPhone, normalizeCountryCode, normalizeNumber } from './phone';

describe('phone helpers', () => {
  it('strips punctuation and leading zeros', () => {
    expect(normalizeNumber('098765 43210')).toBe('9876543210');
    expect(normalizeNumber('98-76-54-32-10')).toBe('9876543210');
  });
  it('normalises country codes', () => {
    expect(normalizeCountryCode('91')).toBe('+91');
    expect(normalizeCountryCode('+ 971')).toBe('+971');
    expect(normalizeCountryCode('')).toBe('');
  });
  it('validates length', () => {
    expect(isValidPhone('+91', '9876543210')).toBe(true);
    expect(isValidPhone('+91', '123')).toBe(false);
    expect(isValidPhone('91', '9876543210')).toBe(false);
  });
});
