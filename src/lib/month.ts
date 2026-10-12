const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2027-03-01" (or "2027-03") -> "Mar 2027"; anything else -> "—". Parsed by hand so the timezone can't shift the month. */
export function formatMonthYear(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(value ?? '');
  const month = m ? Number(m[2]) : 0;
  return m && month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${m[1]}` : '—';
}
