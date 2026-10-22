export type Task = {
  id: string;
  lead_id: string | null;
  task_type_id: string;
  due_at: string;
  notes: string | null;
  completed_at: string | null;
  task_types: { name: string } | null;
  leads?: { contacts: { name: string } | null } | null;
};

export const TASK_SELECT = '*, task_types(name)';

/** ISO timestamp -> value for <input type="datetime-local"> in the user's timezone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type DueGroup = 'overdue' | 'today' | 'upcoming';

/** Overdue = due before today (a task due earlier today still counts as today). */
export function dueGroup(iso: string, now = new Date()): DueGroup {
  const due = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (due < startOfToday) return 'overdue';
  return due < startOfTomorrow ? 'today' : 'upcoming';
}

export const formatDue = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
