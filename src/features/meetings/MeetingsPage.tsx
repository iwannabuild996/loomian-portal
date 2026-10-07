import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { friendlyError } from '../admin/ResourcePage';
import { dueGroup, formatDue } from '../tasks/types';
import { MeetingForm } from './MeetingForm';
import { MEETING_SELECT, MEETING_STATUS_LABEL, meetingWith, type Meeting, type MeetingStatus } from './types';

const STATUS_TONE: Record<MeetingStatus, string> = {
  scheduled: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-200 text-slate-600',
};

export function MeetingsPage() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const canWrite = role === 'admin' || role === 'editor';
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [editing, setEditing] = useState<Meeting | 'new' | null>(null);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['meetings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('meetings').select(MEETING_SELECT).order('scheduled_at');
      if (error) throw error;
      return data as unknown as Meeting[];
    },
  });

  const remove = useMutation({
    mutationFn: async (m: Meeting) => {
      const { data, error } = await supabase.from('meetings').delete().eq('id', m.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Not permitted, or the meeting no longer exists.');
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  // Upcoming = still scheduled and not before today; everything else is history (newest first).
  const isUpcoming = (m: Meeting) => m.status === 'scheduled' && dueGroup(m.scheduled_at) !== 'overdue';
  const rows = tab === 'upcoming' ? data.filter(isUpcoming) : data.filter((m) => !isUpcoming(m)).reverse();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Meetings</h1>
          <p className="text-sm text-slate-500">Meetings with leads, or with anyone else by name and phone — no lead needed.</p>
        </div>
        {canWrite && (
          <button onClick={() => setEditing('new')} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus className="size-4" /> Add meeting
          </button>
        )}
      </div>

      <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-sm w-fit">
        {(['upcoming', 'past'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 font-medium capitalize ${tab === t ? 'bg-white shadow-sm' : 'text-slate-500'}`}>
            {t}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {error && <p role="alert" className="mb-3 text-sm text-red-600">Failed to load: {error.message}</p>}
      {remove.error && <p role="alert" className="mb-3 text-sm text-red-600">{friendlyError(remove.error)}</p>}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-100">
            <tr>
              {['When', 'With', 'Phone', 'Purpose', 'Location', 'Status', 'Notes'].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
              ))}
              {canWrite && <th className="w-24 px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const who = meetingWith(m);
              return (
                <tr key={m.id} className="border-t border-slate-200 align-top hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2.5">{formatDue(m.scheduled_at)}</td>
                  <td className="px-4 py-2.5 font-medium">
                    {m.lead_id ? <Link to={`/leads/${m.lead_id}`} className="text-indigo-600 hover:underline">{who.name}</Link> : who.name}
                    {!m.lead_id && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">Custom</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">{who.phone ?? '—'}</td>
                  <td className="px-4 py-2.5">{m.title || '—'}</td>
                  <td className="px-4 py-2.5">{m.location || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[m.status]}`}>{MEETING_STATUS_LABEL[m.status]}</span>
                  </td>
                  <td className="whitespace-pre-wrap px-4 py-2.5 text-slate-600">{m.notes || '—'}</td>
                  {canWrite && (
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button aria-label="Edit meeting" onClick={() => setEditing(m)} className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><Pencil className="size-4" /></button>
                        <button
                          aria-label="Delete meeting"
                          onClick={() => window.confirm('Delete this meeting?') && remove.mutate(m)}
                          className="rounded p-1.5 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!isLoading && rows.length === 0 && <p className="p-6 text-center text-slate-500">No {tab} meetings.</p>}
      </div>

      {editing && <MeetingForm meeting={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
