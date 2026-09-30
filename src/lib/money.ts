const LAKH = 100_000;
const CRORE = 10_000_000;

export type PriceRange = { min: number; max: number };

function toRupees(value: number, unit: string | undefined): number {
  const u = unit?.toLowerCase();
  if (u === 'cr') return Math.round(value * CRORE);
  if (u === 'l') return Math.round(value * LAKH);
  return Math.round(value);
}

/**
 * Parses sheet-style prices: "71 - 79 L", "1.06 Cr", "97 L - 1.02 Cr",
 * "1.09 Cr - 1.22 Cr". Returns null for "NA"/empty/unparseable input.
 * A unit on only one side of a range applies to both sides unless the
 * other side has its own unit.
 */
export function parsePriceRange(input: string | null | undefined): PriceRange | null {
  if (!input) return null;
  const parts = input
    .trim()
    .split(/\s*-\s*/)
    .map((p) => p.match(/^([\d.]+)\s*(cr|l)?$/i));
  if (parts.length < 1 || parts.length > 2 || parts.some((m) => !m)) return null;

  const fallbackUnit = parts.map((m) => m![2]).find(Boolean);
  const values = parts.map((m) => toRupees(parseFloat(m![1]), m![2] ?? fallbackUnit));
  if (values.some(Number.isNaN)) return null;
  return { min: values[0], max: values[values.length - 1] };
}

export function formatINR(rupees: number | null | undefined): string {
  if (rupees == null) return 'NA';
  if (rupees >= CRORE) return `${trim(rupees / CRORE)} Cr`;
  return `${trim(rupees / LAKH)} L`;
}

export function formatPriceRange(min: number | null, max: number | null): string {
  if (min == null) return 'NA';
  if (max == null || max === min) return formatINR(min);
  const a = formatINR(min);
  const b = formatINR(max);
  const unitA = a.split(' ')[1];
  return unitA === b.split(' ')[1] ? `${a.split(' ')[0]} - ${b}` : `${a} - ${b}`;
}

function trim(n: number): string {
  return String(parseFloat(n.toFixed(2)));
}
