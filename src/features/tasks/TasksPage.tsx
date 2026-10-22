import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { field, friendlyError } from '../admin/ResourcePage';
import { useOptions } from '../admin/useOptions';
import { TaskForm } from './TaskForm';
import { dueGroup, formatDue, TASK_SELECT, type DueGroup, type Task } from './types';
import { useTaskActions } from './useTaskActions';

const GROUPS: { key: DueGroup; label: string; tone: string }[] = [
  { key: 'overdue', label: 'Overdue', tone: 'text-red-700' },
  { key: 'today', label: 'Today', tone: 'text-amber-700' },
  { key: 'upcoming', label: 'Upcoming', tone: 'text-slate-700' },
];

export function TasksPage() {
  const { role } = useAuth();
  const canWrite = role === 'admin' || role === 'editor';
  const types = useOptions('task_types', 'name', 'sort_order');
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [typeId, setTypeId] = useState('');
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const { toggle, remove } = useTaskActions();

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['tasks', tab],
    queryFn: async () => {
      let q = supabase.from('lead_tasks').select(`${TASK_SELECT}, leads(contacts(name))`);
      q = tab === 'pending' ? q.is('completed_at', null).order('due_at') : q.not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(200);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Task[];
    },
  });

  const rows = data.filter((t) => !typeId || t.task_type_id === typeId);

  const row = (t: Task) => (
    <tr key={t.id} className="border-t border-slate-200 align-top hover:bg-slate-50">
      {canWrite && (
        <td className="w-10 px-4 py-2.5">
          <input
            type="checkbox"
            aria-label={t.completed_at ? 'Reopen task' : 'Mark task done'}
            checked={!!t.completed_at}
            disabled={toggle.isPending}
            onChange={() => toggle.mutate(t)}
          />
        </td>
      )}
      <td className="whitespace-nowrap px-4 py-2.5">{formatDue(t.due_at)}</td>
      <td className="px-4 py-2.5 font-medium">{t.task_types?.name}</td>
      <td className="px-4 py-2.5">
        {t.lead_id
          ? <Link to={`/leads/${t.lead_id}`} className="text-indigo-600 hover:underline">{t.leads?.contacts?.name ?? 'Lead'}</Link>
          : <span className="text-slate-400">—</span>}
      </td>
      <td className="whitespace-pre-wrap px-4 py-2.5 text-slate-600">{t.notes || '—'}</td>
      {canWrite && (
        <td className="px-4 py-2.5">
          <div className="flex justify-end gap-1">
            <button aria-label="Edit task" onClick={() => setEditing(t)} className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><Pencil className="size-4" /></button>
            <button
              aria-label="Delete task"
              onClick={() => window.confirm('Delete this task?') && remove.mutate(t)}
              className="rounded p-1.5 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );

  const head = (
    <thead className="bg-slate-100">
      <tr>
        {canWrite && <th className="w-10 px-4 py-2.5" />}
        {['Due', 'Task', 'Lead', 'Notes'].map((h) => (
          <th key={h} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
        ))}
        {canWrite && <th className="w-24 px-4 py-2.5" />}
      </tr>
    </thead>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="text-sm text-slate-500">Site visits, calls and other to-dos. A task can be linked to a lead or stand on its own.</p>
        </div>
        {canWrite && (
          <button onClick={() => setEditing('new')} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus className="size-4" /> Add task
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
          {(['pending', 'done'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 font-medium capitalize ${tab === t ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <select aria-label="Task type" className={`${field} !w-auto`} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">All task types</option>
          {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {error && <p role="alert" className="mb-3 text-sm text-red-600">Failed to load: {error.message}</p>}
      {(toggle.error || remove.error) && <p role="alert" className="mb-3 text-sm text-red-600">{friendlyError(toggle.error ?? remove.error)}</p>}

      {tab === 'pending' ? (
        <div className="space-y-6">
          {GROUPS.map((g) => {
            const items = rows.filter((t) => dueGroup(t.due_at) === g.key);
            if (!items.length) return null;
            return (
              <section key={g.key}>
                <h2 className={`mb-2 text-sm font-semibold ${g.tone}`}>{g.label} ({items.length})</h2>
                <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                  <table className="w-full border-collapse text-sm">{head}<tbody>{items.map(row)}</tbody></table>
                </div>
              </section>
            );
          })}
          {!isLoading && rows.length === 0 && <p className="rounded-xl bg-white p-6 text-center text-slate-500 shadow-sm ring-1 ring-slate-200">No pending tasks.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full border-collapse text-sm">{head}<tbody>{rows.map(row)}</tbody></table>
          {!isLoading && rows.length === 0 && <p className="p-6 text-center text-slate-500">No completed tasks.</p>}
        </div>
      )}

      {editing && <TaskForm task={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
