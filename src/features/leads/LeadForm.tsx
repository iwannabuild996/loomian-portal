import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { COUNTRY_CODES, isValidPhone, normalizeNumber } from '../../lib/phone';
import { field, friendlyError } from '../admin/ResourcePage';
import { useOptions } from '../admin/useOptions';
import { QUALITY_LABEL, type Lead, type Phone, type Quality } from './types';

type Existing = { id: string; name: string; email: string | null };

const emptyPhone = (): Phone => ({ country_code: '+91', number: '', has_whatsapp: false });

export function LeadForm({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const qc = useQueryClient();
  const sources = useOptions('lead_sources', 'name', 'sort_order');
  const [name, setName] = useState(lead?.contacts?.name ?? '');
  const [email, setEmail] = useState(lead?.contacts?.email ?? '');
  const [phones, setPhones] = useState<Phone[]>(lead?.contacts?.contact_phones.length ? lead.contacts.contact_phones : [emptyPhone()]);
  const [enquiry, setEnquiry] = useState(lead?.enquiry ?? '');
  const [sourceId, setSourceId] = useState(lead?.lead_source_id ?? '');
  const [projectType, setProjectType] = useState(lead?.project_type ?? '');
  const [requirement, setRequirement] = useState(lead?.requirement ?? '');
  const [budgetMin, setBudgetMin] = useState(lead?.budget_min_lakhs == null ? '' : String(lead.budget_min_lakhs));
  const [budgetMax, setBudgetMax] = useState(lead?.budget_max_lakhs == null ? '' : String(lead.budget_max_lakhs));
  const builders = useOptions('builders', 'name');
  const [builderIds, setBuilderIds] = useState<string[]>(lead?.lead_builders.map((x) => x.builder_id) ?? []);
  const locations = useOptions('locations', 'name');
  const [locationIds, setLocationIds] = useState<string[]>(lead?.lead_locations.map((x) => x.location_id) ?? []);
  const [quality, setQuality] = useState<Quality>(lead?.quality ?? 'warm');
  const [remarks, setRemarks] = useState(lead?.remarks ?? '');
  const [existing, setExisting] = useState<Existing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patchPhone = (i: number, patch: Partial<Phone>) =>
    setPhones((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  // Live duplicate check (new leads only): a number that already belongs to a contact reuses that contact.
  const checkPhone = async (p: Phone) => {
    if (lead || !isValidPhone(p.country_code, p.number)) return;
    const { data } = await supabase.rpc('find_contact_by_phone', { p_phone: p.country_code + p.number });
    const found = (data as Existing[] | null)?.[0] ?? null;
    setExisting(found);
    if (found) {
      setName((n) => n || found.name);
      setEmail((e) => e || found.email || '');
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('save_lead', {
        p_lead_id: lead?.id ?? null,
        p_name: name.trim(),
        p_email: email.trim(),
        p_phones: phones.map(({ country_code, number, has_whatsapp }) => ({ country_code, number, has_whatsapp })),
        p_lead: {
          enquiry: enquiry.trim(),
          lead_source_id: sourceId || null,
          project_type: projectType || null,
          requirement: requirement.trim(),
          budget_min_lakhs: budgetMin.trim() ? Number(budgetMin) : null,
          budget_max_lakhs: budgetMax.trim() ? Number(budgetMax) : null,
          location_ids: locationIds,
          builder_ids: builderIds,
          quality,
          remarks: remarks.trim(),
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      onClose();
    },
    onError: (e) =>
      setError((e as { code?: string }).code === '23505' ? 'One of these phone numbers already belongs to another contact.' : friendlyError(e)),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required');
    for (const b of [budgetMin, budgetMax]) {
      if (b.trim() && (!Number.isFinite(Number(b)) || Number(b) < 0)) return setError('Budget must be a positive number of lakhs');
    }
    if (budgetMin.trim() && budgetMax.trim() && Number(budgetMax) < Number(budgetMin)) return setError('Budget end must not be less than the start');
    const seen = new Set<string>();
    for (const p of phones) {
      if (!isValidPhone(p.country_code, p.number)) return setError('Enter each phone as a country code like +91 and 4–14 digits');
      const key = p.country_code + p.number;
      if (seen.has(key)) return setError(`${key} is entered twice`);
      seen.add(key);
    }
    setError(null);
    save.mutate();
  };

  const label = 'mb-1 block text-sm font-medium';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={onSubmit} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{lead ? 'Edit lead' : 'Add lead'}</h2>
          <button type="button" aria-label="Close" onClick={onClose}><X className="size-5" /></button>
        </div>

        <div>
          <span className={label}>Phone numbers <span className="text-red-600">*</span></span>
          <div className="space-y-2">
            {phones.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  aria-label="Country code"
                  className={`${field} !w-36 shrink-0`}
                  value={p.country_code}
                  onChange={(e) => patchPhone(i, { country_code: e.target.value })}
                >
                  {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.code} {c.label}</option>)}
                  {!COUNTRY_CODES.some((c) => c.code === p.country_code) && <option value={p.country_code}>{p.country_code}</option>}
                </select>
                <input
                  aria-label="Phone number"
                  inputMode="numeric"
                  className={field}
                  value={p.number}
                  onChange={(e) => patchPhone(i, { number: normalizeNumber(e.target.value) })}
                  onBlur={() => checkPhone(p)}
                />
                <label className="flex shrink-0 items-center gap-1 text-xs">
                  <input type="checkbox" checked={p.has_whatsapp} onChange={(e) => patchPhone(i, { has_whatsapp: e.target.checked })} />
                  WhatsApp
                </label>
                {phones.length > 1 && (
                  <button type="button" aria-label="Remove phone" className="rounded p-1.5 text-red-600 hover:bg-red-50" onClick={() => setPhones((ps) => ps.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="mt-2 flex items-center gap-1 text-sm text-indigo-600" onClick={() => setPhones((ps) => [...ps, emptyPhone()])}>
            <Plus className="size-4" /> Add another number
          </button>
          {existing && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
              This number already belongs to <b>{existing.name}</b>. The lead will be added to that contact instead of creating a duplicate.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="lead-name" className={label}>Name <span className="text-red-600">*</span></label>
          <input id="lead-name" className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="lead-email" className={label}>Email</label>
          <input id="lead-email" type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="lead-enquiry" className={label}>Enquiry</label>
          <textarea id="lead-enquiry" rows={3} className={field} value={enquiry} onChange={(e) => setEnquiry(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="lead-source" className={label}>Lead source</label>
            <select id="lead-source" className={field} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">None</option>
              {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="lead-type" className={label}>Project type</label>
            <select id="lead-type" className={field} value={projectType} onChange={(e) => setProjectType(e.target.value as typeof projectType)}>
              <option value="">None</option>
              <option value="apartment">Apartment</option>
              <option value="villa">Villa</option>
            </select>
          </div>
          <div>
            <span className={label}>Budget (lakhs)</span>
            <div className="flex items-center gap-2">
              <input aria-label="Budget from (lakhs)" placeholder="From" type="number" step="any" min="0" className={field} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
              <span className="text-slate-500">to</span>
              <input aria-label="Budget to (lakhs)" placeholder="To" type="number" step="any" min="0" className={field} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor="lead-quality" className={label}>Lead quality</label>
            <select id="lead-quality" className={field} value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
              {(Object.keys(QUALITY_LABEL) as Quality[]).map((q) => <option key={q} value={q}>{QUALITY_LABEL[q]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <span className={label}>Builders</span>
          <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
            {builders.map((b) => {
              const on = builderIds.includes(b.value);
              return (
                <label key={b.value} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${on ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-300'}`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => setBuilderIds((ids) => (on ? ids.filter((x) => x !== b.value) : [...ids, b.value]))}
                  />
                  {b.label}
                </label>
              );
            })}
            {builders.length === 0 && <p className="text-sm text-slate-500">No builders yet. Add them under Admin → Builders.</p>}
          </div>
        </div>
        <div>
          <span className={label}>Preferred locations</span>
          <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
            {locations.map((l) => {
              const on = locationIds.includes(l.value);
              return (
                <label key={l.value} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${on ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-300'}`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => setLocationIds((ids) => (on ? ids.filter((x) => x !== l.value) : [...ids, l.value]))}
                  />
                  {l.label}
                </label>
              );
            })}
            {locations.length === 0 && <p className="text-sm text-slate-500">No locations yet. Add them under Admin → Locations.</p>}
          </div>
        </div>
        <div>
          <label htmlFor="lead-req" className={label}>Requirement</label>
          <textarea id="lead-req" rows={2} className={field} value={requirement} onChange={(e) => setRequirement(e.target.value)} />
        </div>
        <div>
          <label htmlFor="lead-remarks" className={label}>Remarks</label>
          <textarea id="lead-remarks" rows={2} className={field} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
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
