import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BuilderList } from './BuilderList';
import { ArrowLeft, Mail, MessageCircle, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { field, friendlyError } from '../admin/ResourcePage';
import { useOptions } from '../admin/useOptions';
import { TaskForm } from '../tasks/TaskForm';
import { dueGroup, formatDue, TASK_SELECT, type Task } from '../tasks/types';
import { useTaskActions } from '../tasks/useTaskActions';
import { LeadForm } from './LeadForm';
import { CATEGORY_LABEL, formatBudget, PROJECT_TYPE_LABEL, QUALITY_LABEL, type Lead, type StatusLogEntry } from './types';
import { QUALITY_TONE } from './LeadsPage';

const SELECT =
  '*, contacts(name, email, contact_phones(id, country_code, number, has_whatsapp)), lead_source_links(lead_source_id, lead_sources(name)), lead_statuses(name), lead_builders(builder_id, is_enquired, builders(name)), lead_locations(location_id, locations(name))';

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm">{children || '—'}</dd>
    </div>
  );
}

export function LeadDetailPage() {
  const { id } = useParams();
  const { role } = useAuth();
  const canWrite = role === 'admin' || role === 'editor';
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();

  const { data: lead, isLoading, error } = useQuery({
    queryKey: ['leads', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select(SELECT).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as unknown as Lead | null;
    },
  });

  // Other enquiries from the same contact.
  const { data: others = [] } = useQuery({
    queryKey: ['leads', id, 'others', lead?.contact_id],
    enabled: !!lead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, created_at, quality, project_types, enquiry')
        .eq('contact_id', lead!.contact_id)
        .neq('id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Pick<Lead, 'id' | 'created_at' | 'quality' | 'project_types' | 'enquiry'>[];
    },
  });

  const [taskForm, setTaskForm] = useState<Task | 'new' | null>(null);
  const { toggle, remove } = useTaskActions();
  // Pending tasks first (soonest due), then completed ones.
  const { data: tasks = [] } = useQuery({
    queryKey: ['leads', id, 'tasks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('lead_tasks').select(TASK_SELECT).eq('lead_id', id!).order('due_at');
      if (error) throw error;
      const rows = data as unknown as Task[];
      return [...rows.filter((t) => !t.completed_at), ...rows.filter((t) => t.completed_at)];
    },
  });

  const statuses = useOptions('lead_statuses', 'name', 'sort_order');
  const [newStatus, setNewStatus] = useState('');
  const [note, setNote] = useState('');

  const { data: log = [] } = useQuery({
    queryKey: ['leads', id, 'status-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_status_log')
        .select('id, from_status, to_status, note, changed_at, profiles(full_name, email)')
        .eq('lead_id', id!)
        .order('changed_at', { ascending: true });
      if (error) throw error;
      return data as unknown as StatusLogEntry[];
    },
  });

  const changeStatus = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('change_lead_status', { p_lead_id: id, p_status_id: newStatus, p_note: note });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewStatus('');
      setNote('');
      qc.invalidateQueries();
    },
  });

  if (isLoading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p role="alert" className="text-sm text-red-600">Failed to load: {error.message}</p>;

  const back = (
    <Link to="/leads" className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
      <ArrowLeft className="size-4" /> All leads
    </Link>
  );
  if (!lead) return <div className="mx-auto max-w-4xl">{back}<p className="text-slate-500">Lead not found.</p></div>;

  const locations = lead.lead_locations.map((x) => x.locations?.name).filter(Boolean).join(', ');

  return (
    <div className="mx-auto max-w-4xl">
      {back}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{lead.contacts?.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${QUALITY_TONE[lead.quality]}`}>{QUALITY_LABEL[lead.quality]}</span>
            Added {new Date(lead.created_at).toLocaleDateString()}
          </p>
        </div>
        {canWrite && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Pencil className="size-4" /> Edit lead
          </button>
        )}
      </div>

      <div className="space-y-6">
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 font-semibold">Status</h2>
          <p className="mb-3 text-sm">
            Current: <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{lead.lead_statuses?.name}</span>
          </p>
          {canWrite && (
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="New status" className={`${field} !w-auto`} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                <option value="">Change status to…</option>
                {statuses.filter((s) => s.value !== lead.status_id).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <input aria-label="Note" placeholder="Note (optional)" className={`${field} min-w-48 flex-1`} value={note} onChange={(e) => setNote(e.target.value)} />
              <button
                disabled={!newStatus || changeStatus.isPending}
                onClick={() => changeStatus.mutate()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {changeStatus.isPending ? 'Updating…' : 'Update'}
              </button>
            </div>
          )}
          {changeStatus.error && <p role="alert" className="mt-2 text-sm text-red-600">{friendlyError(changeStatus.error)}</p>}
          <div className="mt-4 overflow-x-auto rounded-lg ring-1 ring-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-100">
                <tr>
                  {['Date', 'Status', 'Notes', 'Changed by'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.id} className="border-t border-slate-200 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{new Date(e.changed_at).toLocaleString()}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {e.from_status ? <>{e.from_status} → <b>{e.to_status}</b></> : <b>{e.to_status}</b>}
                    </td>
                    <td className="whitespace-pre-wrap px-3 py-2 text-slate-600">{e.note || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{e.profiles?.full_name || e.profiles?.email || '—'}</td>
                  </tr>
                ))}
                {log.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">No status changes yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Tasks</h2>
            {canWrite && (
              <button onClick={() => setTaskForm('new')} className="flex items-center gap-1 text-sm text-indigo-600 hover:underline">
                <Plus className="size-4" /> Add task
              </button>
            )}
          </div>
          {(toggle.error || remove.error) && <p role="alert" className="mb-2 text-sm text-red-600">{friendlyError(toggle.error ?? remove.error)}</p>}
          <ul className="divide-y divide-slate-200 text-sm">
            {tasks.map((t) => {
              const overdue = !t.completed_at && dueGroup(t.due_at) === 'overdue';
              return (
                <li key={t.id} className="flex items-start gap-3 py-2">
                  {canWrite && (
                    <input
                      type="checkbox"
                      className="mt-1"
                      aria-label={t.completed_at ? 'Reopen task' : 'Mark task done'}
                      checked={!!t.completed_at}
                      disabled={toggle.isPending}
                      onChange={() => toggle.mutate(t)}
                    />
                  )}
                  <div className={`flex-1 ${t.completed_at ? 'text-slate-400 line-through' : ''}`}>
                    <p className="font-medium">{t.task_types?.name}</p>
                    {t.notes && <p className="whitespace-pre-wrap">{t.notes}</p>}
                  </div>
                  <span className={`whitespace-nowrap text-xs ${overdue ? 'font-semibold text-red-700' : 'text-slate-500'}`}>
                    {overdue && 'Overdue · '}{formatDue(t.due_at)}
                  </span>
                  {canWrite && (
                    <div className="flex gap-1">
                      <button aria-label="Edit task" onClick={() => setTaskForm(t)} className="rounded p-1 text-slate-500 hover:bg-slate-200"><Pencil className="size-4" /></button>
                      <button
                        aria-label="Delete task"
                        onClick={() => window.confirm('Delete this task?') && remove.mutate(t)}
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
            {tasks.length === 0 && <li className="py-3 text-slate-500">No tasks yet.</li>}
          </ul>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 font-semibold">Contact</h2>
          <ul className="space-y-2 text-sm">
            {lead.contacts?.contact_phones.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3">
                <a href={`tel:${p.country_code}${p.number}`} className="flex items-center gap-1 hover:underline">
                  <Phone className="size-4 text-slate-500" /> {p.country_code} {p.number}
                </a>
                {p.has_whatsapp && (
                  <a
                    href={`https://wa.me/${p.country_code.slice(1)}${p.number}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-green-700 hover:underline"
                  >
                    <MessageCircle className="size-4" /> WhatsApp
                  </a>
                )}
              </li>
            ))}
            {lead.contacts?.email && (
              <li>
                <a href={`mailto:${lead.contacts.email}`} className="flex items-center gap-1 hover:underline">
                  <Mail className="size-4 text-slate-500" /> {lead.contacts.email}
                </a>
              </li>
            )}
          </ul>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 font-semibold">Enquiry</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Item label="Lead source">{lead.lead_source_links.map((x) => x.lead_sources?.name).filter(Boolean).join(', ')}</Item>
            <Item label="Project type">{lead.project_types.map((t) => PROJECT_TYPE_LABEL[t]).join(', ')}</Item>
            <Item label="Category">{lead.categories.map((c) => CATEGORY_LABEL[c]).join(', ')}</Item>
            <Item label="Budget">{formatBudget(lead.budget_min_lakhs, lead.budget_max_lakhs) === '—' ? null : formatBudget(lead.budget_min_lakhs, lead.budget_max_lakhs)}</Item>
            <Item label="Allocated Builders">{lead.lead_builders.length ? <BuilderList builders={lead.lead_builders} /> : null}</Item>
            <Item label="Preferred locations">{locations}</Item>
            <div className="sm:col-span-2"><Item label="Enquiry">{lead.enquiry}</Item></div>
            <div className="sm:col-span-2"><Item label="Requirement">{lead.requirement}</Item></div>
            <div className="sm:col-span-2"><Item label="Remarks">{lead.remarks}</Item></div>
          </dl>
        </section>

        {others.length > 0 && (
          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Other enquiries from this contact</h2>
            <ul className="divide-y divide-slate-200 text-sm">
              {others.map((o) => (
                <li key={o.id}>
                  <Link to={`/leads/${o.id}`} className="flex flex-wrap items-center gap-3 py-2 hover:bg-slate-50">
                    <span className="text-slate-500">{new Date(o.created_at).toLocaleDateString()}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${QUALITY_TONE[o.quality]}`}>{QUALITY_LABEL[o.quality]}</span>
                    <span className="line-clamp-1 flex-1 text-slate-600">{o.enquiry ?? '—'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {editing && <LeadForm lead={lead} onClose={() => setEditing(false)} />}
      {taskForm && <TaskForm leadId={lead.id} task={taskForm === 'new' ? null : taskForm} onClose={() => setTaskForm(null)} />}
    </div>
  );
}
