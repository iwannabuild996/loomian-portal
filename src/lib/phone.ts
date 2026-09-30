export const COUNTRY_CODES: { code: string; label: string }[] = [
  { code: '+91', label: 'India' },
  { code: '+971', label: 'UAE' },
  { code: '+966', label: 'Saudi Arabia' },
  { code: '+974', label: 'Qatar' },
  { code: '+968', label: 'Oman' },
  { code: '+965', label: 'Kuwait' },
  { code: '+973', label: 'Bahrain' },
  { code: '+1', label: 'US / Canada' },
  { code: '+61', label: 'Australia' },
  { code: '+65', label: 'Singapore' },
  { code: '+960', label: 'Maldives' },
];

/** Strips spaces, dashes and other punctuation, plus leading zeros (trunk prefix). */
export function normalizeNumber(input: string): string {
  return input.replace(/\D/g, '').replace(/^0+/, '');
}

export function normalizeCountryCode(input: string): string {
  const digits = input.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

export function isValidPhone(countryCode: string, number: string): boolean {
  return /^\+[0-9]{1,4}$/.test(countryCode) && /^[0-9]{4,14}$/.test(number);
}

export const e164 = (countryCode: string, number: string) => `${countryCode}${number}`;
