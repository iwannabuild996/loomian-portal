import { describe, expect, it } from 'vitest';
import { formatINR, formatPriceRange, parsePriceRange } from './money';

describe('parsePriceRange', () => {
  it('parses lakh ranges', () => {
    expect(parsePriceRange('71 - 79 L')).toEqual({ min: 7_100_000, max: 7_900_000 });
  });
  it('parses single crore values', () => {
    expect(parsePriceRange('1.06 Cr')).toEqual({ min: 10_600_000, max: 10_600_000 });
  });
  it('parses mixed units', () => {
    expect(parsePriceRange('97 L - 1.02 Cr')).toEqual({ min: 9_700_000, max: 10_200_000 });
  });
  it('parses crore ranges', () => {
    expect(parsePriceRange('1.09 Cr - 1.22 Cr')).toEqual({ min: 10_900_000, max: 12_200_000 });
  });
  it('shares a trailing unit across the range', () => {
    expect(parsePriceRange('1.10 - 1.14 Cr')).toEqual({ min: 11_000_000, max: 11_400_000 });
  });
  it('returns null for NA/empty', () => {
    expect(parsePriceRange('NA')).toBeNull();
    expect(parsePriceRange('')).toBeNull();
    expect(parsePriceRange(null)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats lakhs and crores', () => {
    expect(formatINR(7_100_000)).toBe('71 L');
    expect(formatINR(10_600_000)).toBe('1.06 Cr');
    expect(formatINR(null)).toBe('NA');
  });
  it('formats ranges', () => {
    expect(formatPriceRange(7_100_000, 7_900_000)).toBe('71 - 79 L');
    expect(formatPriceRange(5_000_000, 5_000_000)).toBe('50 L');
  });
});
