export type Quality = 'hot' | 'warm' | 'cold';

export const QUALITY_LABEL: Record<Quality, string> = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };

export type Phone = { id?: string; country_code: string; number: string; has_whatsapp: boolean };

export type Lead = {
  id: string;
  contact_id: string;
  enquiry: string | null;
  lead_source_id: string | null;
  project_type: 'apartment' | 'villa' | null;
  requirement: string | null;
  budget_min_lakhs: number | null;
  budget_max_lakhs: number | null;
  lead_builders: { builder_id: string; builders: { name: string } | null }[];
  lead_locations: { location_id: string; locations: { name: string } | null }[];
  quality: Quality;
  remarks: string | null;
  created_at: string;
  contacts: { name: string; email: string | null; contact_phones: Phone[] } | null;
  lead_sources: { name: string } | null;
  status_id: string;
  lead_statuses: { name: string } | null;
};

export type StatusLogEntry = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  changed_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

/** "₹40 L – ₹60 L", "from ₹40 L", "up to ₹60 L" or "—". */
export function formatBudget(min: number | null, max: number | null): string {
  if (min == null && max == null) return '—';
  if (min == null) return `up to ₹${Number(max)} L`;
  if (max == null) return `from ₹${Number(min)} L`;
  return Number(min) === Number(max) ? `₹${Number(min)} L` : `₹${Number(min)} L – ₹${Number(max)} L`;
}
