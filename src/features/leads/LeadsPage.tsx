import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { field, friendlyError } from '../admin/ResourcePage';
import { useOptions } from '../admin/useOptions';
import { BuilderList } from './BuilderList';
import { LeadForm } from './LeadForm';
import { CATEGORY_LABEL, COMPLETION_LABEL, formatBudget, PROJECT_TYPE_LABEL, QUALITY_LABEL, type Lead, type ProjectType, type Quality } from './types';

export const QUALITY_TONE: Record<Quality, string> = {
  hot: 'bg-red-100 text-red-700',
  warm: 'bg-amber-100 text-amber-700',
  cold: 'bg-sky-100 text-sky-700',
};

const PAGE_SIZES = [25, 50, 100, 200];

export function LeadsPage() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const canWrite = role === 'admin' || role === 'editor';
  const sources = useOptions('lead_sources', 'name', 'sort_order');
  const [editing, setEditing] = useState<Lead | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [quality, setQuality] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const statuses = useOptions('lead_statuses', 'name', 'sort_order');
  const [type, setType] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*, contacts(name, email, contact_phones(id, country_code, number, has_whatsapp)), lead_source_links(lead_source_id, lead_sources(name)), lead_statuses(name), lead_status_log(note), lead_builders(builder_id, is_enquired, builders(name)), lead_locations(location_id, locations(name))')
        .order('created_at', { ascending: false })
        .order('changed_at', { referencedTable: 'lead_status_log', ascending: false })
        .limit(1, { referencedTable: 'lead_status_log' });
      if (error) throw error;
      return data as unknown as Lead[];
    },
  });

  const del = useMutation({
    mutationFn: async (lead: Lead) => {
      const { data, error } = await supabase.from('leads').delete().eq('id', lead.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Not permitted, or the lead no longer exists.');
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return data.filter(
      (l) =>
        (!quality || l.quality === quality) &&
        (!source || l.lead_source_links.some((x) => x.lead_source_id === source)) &&
        (!status || l.status_id === status) &&
        (!type || l.project_types.includes(type as ProjectType)) &&
        (!q ||
          l.contacts?.name.toLowerCase().includes(q) ||
          (digits && l.contacts?.contact_phones.some((p) => (p.country_code + p.number).includes(digits)))),
    );
  }, [data, search, quality, source, status, type]);

  useEffect(() => setPage(1), [search, quality, source, status, type, pageSize]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-slate-500">Enquiries from prospective buyers. Phone numbers are unique per contact.</p>
        </div>
        {canWrite && (
          <button onClick={() => setEditing('new')} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus className="size-4" /> Add lead
          </button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <input className={`${field} col-span-2 sm:col-span-1`} placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Status" className={field} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select aria-label="Quality" className={field} value={quality} onChange={(e) => setQuality(e.target.value)}>
          <option value="">All quality</option>
          {(Object.keys(QUALITY_LABEL) as Quality[]).map((q) => <option key={q} value={q}>{QUALITY_LABEL[q]}</option>)}
        </select>
        <select aria-label="Source" className={field} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select aria-label="Project type" className={field} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {(Object.keys(PROJECT_TYPE_LABEL) as ProjectType[]).map((t) => <option key={t} value={t}>{PROJECT_TYPE_LABEL[t]}</option>)}
        </select>
      </div>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {error && <p role="alert" className="mb-3 text-sm text-red-600">Failed to load: {error.message}</p>}
      {del.error && <p role="alert" className="mb-3 text-sm text-red-600">Delete failed: {friendlyError(del.error)}</p>}

      <div className="max-h-[calc(100vh-19rem)] overflow-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr>
              {['Name', 'Phone', 'Enquiry', 'Status', 'Requirement', 'Allocated Builders', 'Type', 'Category', 'Project status', 'Locations', 'Budget', 'Quality', 'Source', 'Added'].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
              ))}
              {canWrite && <th className="w-24 px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((l) => (
              <tr key={l.id} className="border-t border-slate-200 align-top hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <Link to={`/leads/${l.id}`} className="font-medium text-indigo-600 hover:underline">{l.contacts?.name}</Link>
                  {l.contacts?.email && <div className="text-xs text-slate-500">{l.contacts.email}</div>}
                </td>
                <td className="px-4 py-2.5">
                  {l.contacts?.contact_phones.map((p) => (
                    <div key={p.id} className="flex items-center gap-1 whitespace-nowrap">
                      {p.country_code} {p.number}
                      {p.has_whatsapp && <MessageCircle aria-label="WhatsApp" className="size-3.5 text-green-600" />}
                    </div>
                  ))}
                </td>
                <td className="px-4 py-2.5"><span className="line-clamp-2 min-w-40 text-slate-600">{l.enquiry ?? '—'}</span></td>
                <td className="px-4 py-2.5">
                  <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{l.lead_statuses?.name}</span>
                  {l.lead_status_log?.[0]?.note && <span className="mt-1 line-clamp-2 min-w-40 text-slate-600">{l.lead_status_log[0].note}</span>}
                </td>
                <td className="px-4 py-2.5"><span className="line-clamp-2 min-w-40 text-slate-600">{l.requirement ?? '—'}</span></td>
                <td className="px-4 py-2.5"><BuilderList builders={l.lead_builders} /></td>
                <td className="px-4 py-2.5">{l.project_types.length ? l.project_types.map((t) => PROJECT_TYPE_LABEL[t]).join(', ') : '—'}</td>
                <td className="px-4 py-2.5">{l.categories.length ? l.categories.map((c) => CATEGORY_LABEL[c]).join(', ') : '—'}</td>
                <td className="px-4 py-2.5">{l.completion_types.length ? l.completion_types.map((c) => COMPLETION_LABEL[c]).join(', ') : '—'}</td>
                <td className="px-4 py-2.5">
                  {l.lead_locations.length ? l.lead_locations.map((x) => x.locations?.name).filter(Boolean).join(', ') : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">{formatBudget(l.budget_min_lakhs, l.budget_max_lakhs)}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${QUALITY_TONE[l.quality]}`}>{QUALITY_LABEL[l.quality]}</span>
                </td>
                <td className="px-4 py-2.5">{l.lead_source_links.length ? l.lead_source_links.map((x) => x.lead_sources?.name).filter(Boolean).join(', ') : '—'}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{new Date(l.created_at).toLocaleDateString()}</td>
                {canWrite && (
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button aria-label="Edit lead" onClick={() => setEditing(l)} className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><Pencil className="size-4" /></button>
                      <button
                        aria-label="Delete lead"
                        onClick={() => window.confirm('Delete this lead? The contact and phone numbers are kept.') && del.mutate(l)}
                        className="rounded p-1.5 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && rows.length === 0 && <p className="p-6 text-center text-slate-500">No leads found.</p>}
      </div>

      {rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>Showing {start + 1}–{start + pageRows.length} of {rows.length}</span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              Per page
              <select aria-label="Leads per page" className={`${field} !w-auto`} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)} className="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-transparent"><ChevronLeft className="size-4" /></button>
              <span className="px-1">Page {current} of {pages}</span>
              <button aria-label="Next page" disabled={current >= pages} onClick={() => setPage(current + 1)} className="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-transparent"><ChevronRight className="size-4" /></button>
            </div>
          </div>
        </div>
      )}

      {editing && <LeadForm lead={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
