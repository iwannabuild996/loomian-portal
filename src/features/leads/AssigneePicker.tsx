import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { field } from '../admin/ResourcePage';
import { assigneeName, useAssignees } from './useAssignees';

/** Multi-select dropdown of the people a lead can be assigned to. Controlled: value is a list of profile ids. */
export function AssigneePicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const assignees = useAssignees();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const names = assignees.filter((a) => value.includes(a.id)).map(assigneeName);
  const summary = names.length === 0 ? 'Unassigned' : compact && names.length > 1 ? `${names[0]} +${names.length - 1}` : names.join(', ');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Assigned to"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`${field} flex items-center justify-between gap-2 text-left ${compact ? '!w-auto min-w-36 !py-1' : '!w-auto min-w-48'}`}
      >
        <span className={`truncate ${names.length ? '' : 'text-slate-500'}`}>{summary}</span>
        <ChevronDown className="size-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 max-h-60 min-w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {assignees.map((a) => (
            <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
              <input
                type="checkbox"
                checked={value.includes(a.id)}
                onChange={(e) => onChange(e.target.checked ? [...value, a.id] : value.filter((id) => id !== a.id))}
              />
              {assigneeName(a)} <span className="text-xs text-slate-500">({a.role})</span>
            </label>
          ))}
          {assignees.length === 0 && <p className="px-2 py-1.5 text-sm text-slate-500">No one to assign.</p>}
        </div>
      )}
    </div>
  );
}
