import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { field, friendlyError } from '../admin/ResourcePage';
import { useOptions } from '../admin/useOptions';
import { toLocalInput, type Task } from './types';

/** Adds a task to `leadId`, or edits `task`. */
export function TaskForm({ leadId, task, onClose }: { leadId: string; task: Task | null; onClose: () => void }) {
  const qc = useQueryClient();
  const types = useOptions('task_types', 'name', 'sort_order');
  const [typeId, setTypeId] = useState(task?.task_type_id ?? '');
  const [dueAt, setDueAt] = useState(task ? toLocalInput(task.due_at) : '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { task_type_id: typeId, due_at: new Date(dueAt).toISOString(), notes: notes.trim() || null };
      if (task) {
        const { data, error } = await supabase.from('lead_tasks').update(payload).eq('id', task.id).select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('Not permitted, or the task no longer exists.');
      } else {
        const { error } = await supabase.from('lead_tasks').insert({ ...payload, lead_id: leadId });
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
    if (!typeId) return setError('Choose a task type');
    if (!dueAt || Number.isNaN(new Date(dueAt).getTime())) return setError('Choose a due date and time');
    setError(null);
    save.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{task ? 'Edit task' : 'Add task'}</h2>
          <button type="button" aria-label="Close" onClick={onClose}><X className="size-5" /></button>
        </div>
        <div>
          <label htmlFor="task-type" className="mb-1 block text-sm font-medium">Task <span className="text-red-600">*</span></label>
          <select id="task-type" className={field} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Select…</option>
            {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="task-due" className="mb-1 block text-sm font-medium">Due <span className="text-red-600">*</span></label>
          <input id="task-due" type="datetime-local" className={field} value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
        <div>
          <label htmlFor="task-notes" className="mb-1 block text-sm font-medium">Notes</label>
          <textarea id="task-notes" rows={3} className={field} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
