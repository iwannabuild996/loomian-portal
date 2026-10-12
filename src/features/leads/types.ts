export type Quality = 'hot' | 'warm' | 'cold';

export const QUALITY_LABEL: Record<Quality, string> = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };

export type ProjectType = 'apartment' | 'villa' | 'commercial_land' | 'residential_land' | 'office_space' | 'coworking';

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  apartment: 'Apartment',
  villa: 'Villa',
  commercial_land: 'Commercial Land',
  residential_land: 'Residential Land',
  office_space: 'Office Space',
  coworking: 'Coworking',
};

export type Category = 'project' | 'resale';

export const CATEGORY_LABEL: Record<Category, string> = { project: 'Project', resale: 'Resale' };

export type CompletionType = 'off_plan' | 'ready_to_move';

export const COMPLETION_LABEL: Record<CompletionType, string> = { off_plan: 'Off-plan', ready_to_move: 'Ready to move in' };

export type Phone = { id?: string; country_code: string; number: string; has_whatsapp: boolean };

export type Lead = {
  id: string;
  contact_id: string;
  enquiry: string | null;
  project_types: ProjectType[];
  categories: Category[];
  completion_types: CompletionType[];
  requirement: string | null;
  budget_min_lakhs: number | null;
  budget_max_lakhs: number | null;
  lead_builders: { builder_id: string; is_enquired: boolean; builders: { name: string } | null }[];
  lead_locations: { location_id: string; locations: { name: string } | null }[];
  quality: Quality;
  remarks: string | null;
  created_at: string;
  contacts: { name: string; email: string | null; contact_phones: Phone[] } | null;
  lead_source_links: { lead_source_id: string; lead_sources: { name: string } | null }[];
  status_id: string;
  lead_statuses: { name: string } | null;
  /** Only the latest entry is loaded on the leads list: its note belongs to the current status. */
  lead_status_log?: { note: string | null }[];
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
