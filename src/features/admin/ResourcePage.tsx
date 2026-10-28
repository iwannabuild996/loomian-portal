import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatINR, parsePriceRange } from '../../lib/money';
import { ASSET_BUCKET, removeAssets, safeFileName } from '../../lib/storage';
import { FileField } from './FileField';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type FieldContext = {
  values: Record<string, string>;
  setValues: (patch: Record<string, string>) => void;
};

export type Field = {
  name: string;
  label: string;
  /** 'custom' renders `render` and is not saved itself; it edits other fields through setValues. */
  kind: 'text' | 'textarea' | 'number' | 'money' | 'month' | 'select' | 'custom' | 'file';
  /** file fields: the column holds the storage path; folder groups uploads in the bucket */
  accept?: string;
  folder?: string;
  maxMB?: number;
  /** file fields: offer a crop dialog for images */
  crop?: boolean;
  render?: (ctx: FieldContext) => ReactNode;
  required?: boolean;
  integer?: boolean;
  defaultValue?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  disabled?: (row: Row | null) => boolean;
};

/** A dropdown above the table that keeps only rows whose `get` value equals the chosen option. */
export type Filter = { label: string; allLabel: string; options: { value: string; label: string }[]; get: (row: Row) => string | null | undefined };

export type Column = { header: string; cell: (row: Row) => ReactNode };

type Props = {
  title: string;
  singular: string;
  description?: string;
  table: string;
  select?: string;
  order?: string;
  sort?: (a: Row, b: Row) => number;
  columns: Column[];
  fields: Field[];
  filters?: Filter[];
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  deleteWarning?: string;
  /** Storage paths owned by a row through other tables (e.g. child files); read before the row is deleted. */
  collectAssets?: (row: Row) => Promise<string[]>;
  /** Rows can be dragged into order; the table needs an integer `sort_order` column, which the form then leaves out. */
  reorderable?: boolean;
};

export const field =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100 disabled:text-slate-500';

export function friendlyError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err?.code === '23503') return 'This record is in use by other records. Remove or reassign them first.';
  if (err?.code === '23514') return 'A value is outside the allowed range (check latitude/longitude and counts).';
  if (err?.code === '23505') return 'A record with the same unique value already exists.';
  return err?.message ?? 'Something went wrong';
}

export function toInput(f: Field, value: unknown): string {
  if (value == null) return '';
  if (f.kind === 'money' && typeof value === 'number') {
    const short = formatINR(value);
    return parsePriceRange(short)?.min === value ? short : String(value);
  }
  // month fields hold a date (first of the month); the <input type="month"> wants YYYY-MM
  if (f.kind === 'month') return String(value).slice(0, 7);
  return String(value);
}

export function fromInput(f: Field, raw: string): { value: unknown } | { error: string } {
  const text = raw.trim();
  if (!text) return f.required ? { error: `${f.label} is required` } : { value: null };
  if (f.kind === 'number') {
    const n = Number(text);
    if (!Number.isFinite(n) || (f.integer && !Number.isInteger(n))) {
      return { error: `${f.label} must be ${f.integer ? 'a whole number' : 'a number'}` };
    }
    return { value: n };
  }
  if (f.kind === 'money') {
    const r = parsePriceRange(text);
    if (!r || r.min !== r.max) return { error: `${f.label}: enter one amount like 71 L, 1.06 Cr or 7100000` };
    return { value: r.min };
  }
  if (f.kind === 'month') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) return { error: `${f.label} must be a month and year` };
    return { value: `${text}-01` };
  }
  return { value: text };
}

export function FormModal({ title, table, fields, row, onClose, nextOrder, fixed }: { title: string; table: string; fields: Field[]; row: Row | null; onClose: () => void; nextOrder?: number; fixed?: Row }) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, row ? toInput(f, row[f.name]) : f.defaultValue ?? ''])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, File | null>>({});

  const save = useMutation({
    mutationFn: async ({ payload, files }: { payload: Row; files: Record<string, File | null> }) => {
      const uploaded: string[] = [];
      try {
        for (const [name, file] of Object.entries(files)) {
          if (!file) {
            payload[name] = null;
            continue;
          }
          const folder = fields.find((f) => f.name === name)?.folder ?? name;
          const path = `${folder}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
          const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, file, { contentType: file.type });
          if (error) throw error;
          uploaded.push(path);
          payload[name] = path;
        }
        if (row) {
          const { data, error } = await supabase.from(table).update(payload).eq('id', row.id).select('id');
          if (error) throw error;
          if (!data?.length) throw new Error('Not permitted, or the record no longer exists.');
        } else {
          const { error } = await supabase.from(table).insert(payload);
          if (error) throw error;
        }
      } catch (e) {
        await removeAssets(uploaded);
        throw e;
      }
      // Saved: the files that were replaced or removed are no longer referenced.
      await removeAssets(Object.keys(files).map((name) => row?.[name]));
    },
    onSuccess: () => {
      qc.invalidateQueries();
      onClose();
    },
    onError: (e) => setError(friendlyError(e)),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const payload: Row = { ...(row ? {} : fixed) };
    for (const f of fields) {
      if (f.kind === 'custom' || f.kind === 'file' || f.disabled?.(row)) continue;
      const r = fromInput(f, values[f.name]);
      if ('error' in r) return setError(r.error);
      payload[f.name] = r.value;
    }
    // Reorderable tables: a new row goes to the end of the list.
    if (!row && nextOrder != null) payload.sort_order = nextOrder;
    setError(null);
    save.mutate({ payload, files: pending });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={onSubmit} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose}><X className="size-5" /></button>
        </div>
        {fields.map((f) => {
          if (f.kind === 'file') {
            return (
              <div key={f.name}>
                <span className="mb-1 block text-sm font-medium">{f.label}</span>
                <FileField
                  accept={f.accept}
                  maxMB={f.maxMB}
                  crop={f.crop}
                  currentPath={row?.[f.name] ?? null}
                  pending={pending[f.name]}
                  onChange={(file) =>
                    setPending((p) => {
                      const next = { ...p };
                      if (file === undefined) delete next[f.name];
                      else next[f.name] = file;
                      return next;
                    })
                  }
                />
                {f.hint && <p className="mt-1 text-xs text-slate-500">{f.hint}</p>}
              </div>
            );
          }
          if (f.kind === 'custom') {
            return (
              <div key={f.name}>
                <span className="mb-1 block text-sm font-medium">{f.label}</span>
                {f.render?.({ values, setValues: (patch) => setValues((v) => ({ ...v, ...patch })) })}
                {f.hint && <p className="mt-1 text-xs text-slate-500">{f.hint}</p>}
              </div>
            );
          }
          const common = {
            id: f.name,
            className: field,
            value: values[f.name],
            disabled: f.disabled?.(row),
            onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f.name]: e.target.value })),
          };
          return (
            <div key={f.name}>
              <label htmlFor={f.name} className="mb-1 block text-sm font-medium">
                {f.label}{f.required && <span className="text-red-600"> *</span>}
              </label>
              {f.kind === 'textarea' ? (
                <textarea rows={3} {...common} />
              ) : f.kind === 'select' ? (
                <select {...common}>
                  <option value="">{f.required ? 'Select…' : 'None'}</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.kind === 'month' ? (
                <input type="month" {...common} />
              ) : f.kind === 'number' ? (
                <input type="number" step={f.integer ? 1 : 'any'} {...common} />
              ) : (
                <input type="text" {...common} />
              )}
              {f.hint && <p className="mt-1 text-xs text-slate-500">{f.hint}</p>}
            </div>
          );
        })}
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

export function ResourcePage({
  title, singular, description, table, select = '*', order, sort, columns, fields, filters = [],
  canCreate = true, canEdit = true, canDelete = true, deleteWarning, collectAssets, reorderable = false,
}: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const queryKey = ['admin', table, select];

  const { data = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase.from(table).select(select);
      if (order) q = q.order(order);
      if (reorderable) q = q.order('name');
      const { data, error } = await q;
      if (error) throw error;
      const rows = data as unknown as Row[];
      return sort ? [...rows].sort(sort) : rows;
    },
  });

  const del = useMutation({
    mutationFn: async (row: Row) => {
      const extra = collectAssets ? await collectAssets(row) : [];
      const { data, error } = await supabase.from(table).delete().eq('id', row.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Not permitted, or the record no longer exists.');
      await removeAssets([...fields.filter((f) => f.kind === 'file').map((f) => row[f.name]), ...extra]);
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  const reorder = useMutation({
    mutationFn: async (rows: Row[]) => {
      // Only rows whose position changed are written.
      const changed = rows.map((r, i) => ({ id: r.id, sort_order: i + 1, old: r.sort_order })).filter((r) => r.sort_order !== r.old);
      const results = await Promise.all(changed.map((r) => supabase.from(table).update({ sort_order: r.sort_order }).eq('id', r.id).select('id')));
      const failed = results.find((r) => r.error || !r.data?.length);
      if (failed) throw failed.error ?? new Error('Not permitted, or the record no longer exists.');
    },
    onSettled: () => qc.invalidateQueries(),
  });

  const onDrop = (targetId: string) => {
    const from = data.findIndex((r) => r.id === dragId);
    const to = data.findIndex((r) => r.id === targetId);
    setDragId(null);
    setOverId(null);
    if (from < 0 || to < 0 || from === to) return;
    const rows = [...data];
    rows.splice(to, 0, rows.splice(from, 1)[0]);
    qc.setQueryData(queryKey, rows.map((r, i) => ({ ...r, sort_order: i + 1 })));
    reorder.mutate(rows);
  };

  const rows = data.filter((r) => filters.every((f) => !chosen[f.label] || f.get(r) === chosen[f.label]));
  const dnd = reorderable && canEdit && rows.length === data.length;

  const onDelete = (row: Row) => {
    const extra = deleteWarning ? `\n\n${deleteWarning}` : '';
    if (window.confirm(`Delete this ${singular}?${extra}`)) del.mutate(row);
  };

  const hasActions = canEdit || canDelete;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
        {canCreate && (
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="size-4" /> Add {singular}
          </button>
        )}
      </div>

      {filters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {filters.map((f) => (
            <select key={f.label} aria-label={f.label} className={`${field} !w-auto`} value={chosen[f.label] ?? ''} onChange={(e) => setChosen((c) => ({ ...c, [f.label]: e.target.value }))}>
              <option value="">{f.allLabel}</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
          {Object.values(chosen).some(Boolean) && (
            <>
              <button onClick={() => setChosen({})} className="rounded-lg px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50">Clear filters</button>
              <span className="text-sm text-slate-500">{rows.length} of {data.length}</span>
            </>
          )}
        </div>
      )}

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {error && <p role="alert" className="mb-3 text-sm text-red-600">Failed to load: {error.message}</p>}
      {del.error && <p role="alert" className="mb-3 text-sm text-red-600">Delete failed: {friendlyError(del.error)}</p>}
      {reorder.error && <p role="alert" className="mb-3 text-sm text-red-600">Reordering failed: {friendlyError(reorder.error)}</p>}
      {dnd && data.length > 1 && <p className="mb-2 text-xs text-slate-500">Drag the handle to change the order.</p>}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-100">
            <tr>
              {dnd && <th className="w-8 px-2 py-2.5" />}
              {columns.map((c) => (
                <th key={c.header} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{c.header}</th>
              ))}
              {hasActions && <th className="w-24 px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t border-slate-200 hover:bg-slate-50 ${dragId === row.id ? 'opacity-40' : ''} ${dragId && overId === row.id && dragId !== row.id ? 'border-t-2 border-t-indigo-500' : ''}`}
                draggable={dnd}
                onDragStart={dnd ? (e) => { setDragId(row.id); e.dataTransfer.effectAllowed = 'move'; } : undefined}
                onDragOver={dnd ? (e) => { if (dragId) { e.preventDefault(); setOverId(row.id); } } : undefined}
                onDrop={dnd ? (e) => { e.preventDefault(); onDrop(row.id); } : undefined}
                onDragEnd={dnd ? () => { setDragId(null); setOverId(null); } : undefined}
              >
                {dnd && (
                  <td className="w-8 cursor-grab px-2 py-2.5 text-slate-400 active:cursor-grabbing" title="Drag to reorder">
                    <GripVertical className="size-4" />
                  </td>
                )}
                {columns.map((c) => <td key={c.header} className="px-4 py-2.5 align-middle">{c.cell(row)}</td>)}
                {hasActions && (
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <button aria-label={`Edit ${singular}`} onClick={() => setEditing(row)} className="rounded p-1.5 text-slate-500 hover:bg-slate-200">
                          <Pencil className="size-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button aria-label={`Delete ${singular}`} onClick={() => onDelete(row)} className="rounded p-1.5 text-red-600 hover:bg-red-50">
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && rows.length === 0 && <p className="p-6 text-center text-slate-500">{data.length === 0 ? `No ${title.toLowerCase()} yet.` : `No ${title.toLowerCase()} match the filters.`}</p>}
      </div>

      {editing && (
        <FormModal
          title={editing === 'new' ? `Add ${singular}` : `Edit ${singular}`}
          table={table}
          fields={fields}
          row={editing === 'new' ? null : editing}
          nextOrder={reorderable ? Math.max(0, ...data.map((r) => r.sort_order ?? 0)) + 1 : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
