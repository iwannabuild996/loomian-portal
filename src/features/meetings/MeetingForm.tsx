import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { COUNTRY_CODES, isValidPhone, normalizeNumber } from '../../lib/phone';
import { field, friendlyError } from '../admin/ResourcePage';
import { toLocalInput } from '../tasks/types';
import { MEETING_STATUS_LABEL, type Meeting, type MeetingStatus } from './types';

type LeadOption = { id: string; contacts: { name: string; contact_phones: { country_code: string; number: string }[] } | null };

const label = 'mb-1 block text-sm font-medium';

/** Adds a meeting (with a lead, or a custom name and phone), or edits `meeting`. */
export function MeetingForm({ meeting, onClose }: { meeting: Meeting | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'lead' | 'custom'>(meeting && !meeting.lead_id ? 'custom' : 'lead');
  const [leadId, setLeadId] = useState(meeting?.lead_id ?? '');
  const [search, setSearch] = useState('');
  const [guestName, setGuestName] = useState(meeting?.guest_name ?? '');
  const [countryCode, setCountryCode] = useState(meeting?.guest_country_code ?? '+91');
  const [number, setNumber] = useState(meeting?.guest_number ?? '');
  const [title, setTitle] = useState(meeting?.title ?? '');
  const [location, setLocation] = useState(meeting?.location ?? '');
  const [scheduledAt, setScheduledAt] = useState(meeting ? toLocalInput(meeting.scheduled_at) : '');
  const [status, setStatus] = useState<MeetingStatus>(meeting?.status ?? 'scheduled');
  const [notes, setNotes] = useState(meeting?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const { data: leads = [] } = useQuery({
    queryKey: ['meeting-lead-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, contacts(name, contact_phones(country_code, number))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as LeadOption[];
    },
  });

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return leads.filter(
      (l) =>
        l.id === leadId ||
        !q ||
        l.contacts?.name.toLowerCase().includes(q) ||
        (digits && l.contacts?.contact_phones.some((p) => (p.country_code + p.number).includes(digits))),
    );
  }, [leads, search, leadId]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        lead_id: mode === 'lead' ? leadId : null,
        guest_name: mode === 'custom' ? guestName.trim() : null,
        guest_country_code: mode === 'custom' ? countryCode : null,
        guest_number: mode === 'custom' ? number : null,
        title: title.trim() || null,
        location: location.trim() || null,
        scheduled_at: new Date(scheduledAt).toISOString(),
        status,
        notes: notes.trim() || null,
      };
      if (meeting) {
        const { data, error } = await supabase.from('meetings').update(payload).eq('id', meeting.id).select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('Not permitted, or the meeting no longer exists.');
      } else {
        const { error } = await supabase.from('meetings').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      onClose();
    },
    onError: (e) => setError(friendlyError(e)),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'lead' && !leadId) return setError('Choose a lead');
    if (mode === 'custom') {
      if (!guestName.trim()) return setError('Enter a name');
      if (!isValidPhone(countryCode, number)) return setError('Enter the phone as a country code like +91 and 4–14 digits');
    }
    if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) return setError('Choose a date and time');
    setError(null);
    save.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={onSubmit} className="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{meeting ? 'Edit meeting' : 'Add meeting'}</h2>
          <button type="button" aria-label="Close" onClick={onClose}><X className="size-5" /></button>
        </div>

        <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
          {([['lead', 'Existing lead'], ['custom', 'Custom name & phone']] as const).map(([key, text]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`flex-1 rounded-md px-3 py-1 font-medium ${mode === key ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            >
              {text}
            </button>
          ))}
        </div>

        {mode === 'lead' ? (
          <div>
            <label htmlFor="meeting-lead-search" className={label}>Lead <span className="text-red-600">*</span></label>
            <input
              id="meeting-lead-search"
              className={`${field} mb-2`}
              placeholder="Search by name or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select aria-label="Lead" className={field} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              <option value="">Select…</option>
              {options.map((l) => {
                const p = l.contacts?.contact_phones[0];
                return <option key={l.id} value={l.id}>{l.contacts?.name}{p ? ` · ${p.country_code} ${p.number}` : ''}</option>;
              })}
            </select>
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="meeting-name" className={label}>Name <span className="text-red-600">*</span></label>
              <input id="meeting-name" className={field} value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            </div>
            <div>
              <span className={label}>Phone <span className="text-red-600">*</span></span>
              <div className="flex gap-2">
                <select aria-label="Country code" className={`${field} !w-auto`} value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                  {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.code} {c.label}</option>)}
                  {!COUNTRY_CODES.some((c) => c.code === countryCode) && <option value={countryCode}>{countryCode}</option>}
                </select>
                <input
                  aria-label="Phone number"
                  inputMode="numeric"
                  className={field}
                  value={number}
                  onChange={(e) => setNumber(normalizeNumber(e.target.value))}
                />
              </div>
            </div>
          </>
        )}

        <div>
          <label htmlFor="meeting-at" className={label}>Date & time <span className="text-red-600">*</span></label>
          <input id="meeting-at" type="datetime-local" className={field} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </div>
        <div>
          <label htmlFor="meeting-title" className={label}>Purpose</label>
          <input id="meeting-title" className={field} placeholder="e.g. Site visit, price discussion" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor="meeting-location" className={label}>Location / link</label>
          <input id="meeting-location" className={field} value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        {meeting && (
          <div>
            <label htmlFor="meeting-status" className={label}>Status</label>
            <select id="meeting-status" className={field} value={status} onChange={(e) => setStatus(e.target.value as MeetingStatus)}>
              {(Object.keys(MEETING_STATUS_LABEL) as MeetingStatus[]).map((s) => <option key={s} value={s}>{MEETING_STATUS_LABEL[s]}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="meeting-notes" className={label}>Notes</label>
          <textarea id="meeting-notes" rows={3} className={field} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100">Cancel</button>
          <button disabled={save.isPending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
