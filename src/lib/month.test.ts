import { describe, expect, it } from 'vitest';
import { formatMonthYear } from './month';

describe('formatMonthYear', () => {
  it('formats a first-of-month date and a month input value', () => {
    expect(formatMonthYear('2027-03-01')).toBe('Mar 2027');
    expect(formatMonthYear('2026-12')).toBe('Dec 2026');
  });
  it('returns a dash for empty or invalid values', () => {
    expect(formatMonthYear(null)).toBe('—');
    expect(formatMonthYear('')).toBe('—');
    expect(formatMonthYear('2027-13-01')).toBe('—');
  });
});
