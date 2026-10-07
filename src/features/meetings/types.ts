import type { Phone } from '../leads/types';

export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled';

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export type Meeting = {
  id: string;
  lead_id: string | null;
  guest_name: string | null;
  guest_country_code: string | null;
  guest_number: string | null;
  title: string | null;
  location: string | null;
  scheduled_at: string;
  status: MeetingStatus;
  notes: string | null;
  leads: { contacts: { name: string; contact_phones: Pick<Phone, 'country_code' | 'number'>[] } | null } | null;
};

export const MEETING_SELECT = '*, leads(contacts(name, contact_phones(country_code, number)))';

/** Who the meeting is with: the lead's contact, or the custom guest. */
export function meetingWith(m: Meeting): { name: string; phone: string | null } {
  if (m.lead_id) {
    const c = m.leads?.contacts;
    const p = c?.contact_phones[0];
    return { name: c?.name ?? 'Lead', phone: p ? `${p.country_code} ${p.number}` : null };
  }
  return { name: m.guest_name ?? 'Guest', phone: m.guest_number ? `${m.guest_country_code} ${m.guest_number}` : null };
}
