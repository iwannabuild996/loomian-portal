import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { field, friendlyError } from '../admin/ResourcePage';
import { toLocalInput } from '../tasks/types';
import type { StatusLogEntry } from './types';

/** Edits the note and date/time of a status change; the status itself stays as recorded. */
export function StatusLogForm({ entry, onClose }: { entry: StatusLogEntry; onClose: () => void }) {
  const qc = useQueryClient();
  const [when, setWhen] = useState(toLocalInput(entry.changed_at));
  const [note, setNote] = useState(entry.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('lead_status_log')
        .update({ note: note.trim() || null, changed_at: new Date(when).toISOString() })
        .eq('id', entry.id)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Not permitted, or the entry no longer exists.');
    },
    onSuccess: () => {
      qc.invalidateQueries();
      onClose();
    },
    onError: (e) => setError(friendlyError(e)),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!when || Number.isNaN(new Date(when).getTime())) return setError('Choose a date and time');
    setError(null);
    save.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit status change</h2>
          <button type="button" aria-label="Close" onClick={onClose}><X className="size-5" /></button>
        </div>
        <p className="text-sm text-slate-600">
          {entry.from_status ? <>{entry.from_status} → <b>{entry.to_status}</b></> : <b>{entry.to_status}</b>}
        </p>
        <div>
          <label htmlFor="log-when" className="mb-1 block text-sm font-medium">Date & time <span className="text-red-600">*</span></label>
          <input id="log-when" type="datetime-local" className={field} value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <div>
          <label htmlFor="log-note" className="mb-1 block text-sm font-medium">Notes</label>
          <textarea id="log-note" rows={3} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
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
