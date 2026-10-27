import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { removeAssets } from '../../lib/storage';
import { PROPERTY_TYPE_LABEL, type PropertyType } from '../../lib/propertyType';
import { field, friendlyError, fromInput, toInput, type Field, type Row } from './ResourcePage';
import { useOptions } from './useOptions';

type Edits = Record<string, Record<string, string>>;
type Draft = { id: string; project_id: string };

const STATUS_OPTIONS = [
  { value: 'ready_to_move', label: 'Ready to move' },
  { value: 'off_plan', label: 'Off-plan' },
];

/** Editable cell: text-like inputs and selects, styled as a spreadsheet cell. */
function Cell({ col, fld, original, edited, onEdit }: {
  col: string;
  fld: Field;
  original: string;
  edited: string | undefined;
  onEdit: (value: string) => void;
}) {
  const value = edited ?? original;
  const cls = `block w-full min-w-24 border-0 px-2 py-1.5 text-sm outline-none focus:bg-indigo-50 focus:ring-2 focus:ring-inset focus:ring-indigo-500 ${edited !== undefined ? 'bg-amber-50' : 'bg-transparent'}`;
  if (fld.kind === 'select') {
    return (
      <select data-col={col} aria-label={fld.label} className={cls} value={value} onChange={(e) => onEdit(e.target.value)}>
        <option value="">{fld.required ? 'Select…' : '—'}</option>
        {fld.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input
      data-col={col}
      aria-label={fld.label}
      type="text"
      inputMode={fld.kind === 'number' ? 'decimal' : undefined}
      placeholder={fld.kind === 'month' ? 'YYYY-MM' : undefined}
      className={cls}
      value={value}
      onChange={(e) => onEdit(e.target.value)}
    />
  );
}

/** Arrow up/down and Enter move between cells of the same column, like a spreadsheet. */
function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
  const t = e.target as HTMLInputElement;
  const col = t.dataset?.col;
  if (!col || t.tagName !== 'INPUT') return;
  const dir = e.key === 'ArrowDown' || e.key === 'Enter' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
  if (!dir) return;
  const cells = [...e.currentTarget.querySelectorAll<HTMLInputElement>(`input[data-col="${col}"]`)];
  const next = cells[cells.indexOf(t) + dir];
  if (next) {
    e.preventDefault();
    next.focus();
    next.select();
  }
}

const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-r border-slate-300 bg-slate-100 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';
const td = 'border-b border-r border-slate-200 p-0';

export function InventorySheetPage() {
  const qc = useQueryClient();
  const builders = useOptions('builders', 'name');
  const locations = useOptions('locations', 'name');
  const configurations = useOptions('configurations', 'name', 'sort_order');
  const [builderId, setBuilderId] = useState('');
  const [tab, setTab] = useState<'types' | 'projects'>('types');
  const [edits, setEdits] = useState<Edits>({});
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!builderId && builders.length) setBuilderId(builders[0].value);
  }, [builders, builderId]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['inventory-sheet', builderId],
    enabled: !!builderId,
    queryFn: async () => {
      const projects = await supabase.from('projects').select('*').eq('builder_id', builderId).order('name');
      if (projects.error) throw projects.error;
      const ids = (projects.data ?? []).map((p) => p.id);
      const types = ids.length
        ? await supabase.from('unit_types').select('*, configurations(sort_order)').in('project_id', ids)
        : { data: [], error: null };
      if (types.error) throw types.error;
      return { projects: (projects.data ?? []) as Row[], types: (types.data ?? []) as Row[] };
    },
  });
  const projects = data?.projects ?? [];

  const nameField: Field = { name: 'name', label: 'Project', kind: 'text', required: true };
  const projectFields: Field[] = [
    { name: 'status', label: 'Status', kind: 'select', required: true, options: STATUS_OPTIONS },
    { name: 'property_type', label: 'Kind', kind: 'select', required: true, options: (Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[]).map((value) => ({ value, label: PROPERTY_TYPE_LABEL[value] })) },
    { name: 'location_id', label: 'Location', kind: 'select', required: true, options: locations },
    { name: 'possession_date', label: 'Possession', kind: 'month' },
    { name: 'total_floor_count', label: 'Floors', kind: 'number', integer: true },
    { name: 'total_units', label: 'Units', kind: 'number', integer: true },
    { name: 'parking_charge', label: 'Parking', kind: 'money' },
    { name: 'registration_pct', label: 'Reg %', kind: 'number' },
    { name: 'floor_hike_per_floor', label: 'Floor hike', kind: 'number', integer: true },
    { name: 'usp', label: 'USP', kind: 'text' },
  ];
  const typeFields: Field[] = [
    { name: 'type_name', label: 'Type', kind: 'text', required: true },
    { name: 'configuration_id', label: 'Config', kind: 'select', required: true, options: configurations },
    { name: 'sqft', label: 'Sqft', kind: 'number', integer: true },
    { name: 'available_count', label: 'Available', kind: 'number', integer: true, required: true, defaultValue: '0' },
    { name: 'price', label: 'Price', kind: 'money' },
    { name: 'sqft_rate', label: 'Sqft rate', kind: 'number', integer: true },
  ];

  const grouped = useMemo(() => {
    const byProject = new Map<string, Row[]>();
    for (const t of data?.types ?? []) byProject.set(t.project_id, [...(byProject.get(t.project_id) ?? []), t]);
    for (const list of byProject.values()) {
      list.sort((a, b) => (a.configurations?.sort_order ?? 0) - (b.configurations?.sort_order ?? 0) || a.type_name.localeCompare(b.type_name));
    }
    return byProject;
  }, [data]);

  const dirtyCount = Object.keys(edits).length + drafts.filter((d) => !edits[d.id]).length;

  useEffect(() => {
    if (!dirtyCount) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);

  const setCell = (id: string, fld: Field, original: string, value: string) => {
    setNotice(null);
    setEdits((all) => {
      const row = { ...(all[id] ?? {}) };
      if (value === original && !drafts.some((d) => d.id === id)) delete row[fld.name];
      else row[fld.name] = value;
      const next = { ...all };
      if (Object.keys(row).length) next[id] = row;
      else delete next[id];
      return next;
    });
  };

  const changeBuilder = (id: string) => {
    if (dirtyCount && !window.confirm('Discard your unsaved changes?')) return;
    setEdits({});
    setDrafts([]);
    setErrors([]);
    setNotice(null);
    setBuilderId(id);
  };

  const dropEdits = (id: string) =>
    setEdits((all) => Object.fromEntries(Object.entries(all).filter(([key]) => key !== id)));

  const addDraft = (projectId: string) => {
    const id = `new-${crypto.randomUUID()}`;
    setDrafts((d) => [...d, { id, project_id: projectId }]);
    setEdits((all) => ({ ...all, [id]: { available_count: '0' } }));
  };
  const removeDraft = (id: string) => {
    setDrafts((d) => d.filter((x) => x.id !== id));
    dropEdits(id);
  };

  const deleteType = async (t: Row) => {
    if (!window.confirm(`Delete Type ${t.type_name}?`)) return;
    const { data: gone, error: err } = await supabase.from('unit_types').delete().eq('id', t.id).select('id');
    if (err || !gone?.length) return setErrors([err ? friendlyError(err) : 'Not permitted, or the type no longer exists.']);
    await removeAssets([t.layout_path]);
    dropEdits(t.id);
    qc.invalidateQueries();
  };

  const save = async () => {
    const problems: string[] = [];
    type Op = { id: string; label: string; run: () => PromiseLike<{ error: unknown }> };
    const ops: Op[] = [];

    const payloadFor = (fields: Field[], values: Record<string, string>, all: boolean, label: string) => {
      const payload: Row = {};
      for (const fld of fields) {
        if (!all && !(fld.name in values)) continue;
        const r = fromInput(fld, values[fld.name] ?? fld.defaultValue ?? '');
        if ('error' in r) problems.push(`${label}: ${r.error}`);
        else payload[fld.name] = r.value;
      }
      return payload;
    };

    for (const p of projects) {
      const v = edits[p.id];
      if (!v) continue;
      const payload = payloadFor([nameField, ...projectFields], v, false, p.name);
      ops.push({ id: p.id, label: p.name, run: () => supabase.from('projects').update(payload).eq('id', p.id) });
    }
    for (const t of data?.types ?? []) {
      const v = edits[t.id];
      if (!v) continue;
      const label = `${projects.find((p) => p.id === t.project_id)?.name ?? ''} · Type ${t.type_name}`;
      const payload = payloadFor(typeFields, v, false, label);
      ops.push({ id: t.id, label, run: () => supabase.from('unit_types').update(payload).eq('id', t.id) });
    }
    for (const d of drafts) {
      const label = `${projects.find((p) => p.id === d.project_id)?.name ?? ''} · new type`;
      const payload = { ...payloadFor(typeFields, edits[d.id] ?? {}, true, label), project_id: d.project_id };
      ops.push({ id: d.id, label, run: () => supabase.from('unit_types').insert(payload) });
    }

    if (problems.length) return setErrors(problems);
    setSaving(true);
    setErrors([]);
    const results = await Promise.all(ops.map(async (op) => ({ op, res: await op.run() })));
    setSaving(false);

    const failed = results.filter((r) => r.res.error);
    const okIds = new Set(results.filter((r) => !r.res.error).map((r) => r.op.id));
    setEdits((all) => Object.fromEntries(Object.entries(all).filter(([id]) => !okIds.has(id))));
    setDrafts((d) => d.filter((x) => !okIds.has(x.id)));
    setErrors(failed.map((r) => `${r.op.label}: ${friendlyError(r.res.error)}`));
    if (okIds.size) setNotice(`Saved ${okIds.size} row${okIds.size === 1 ? '' : 's'}.`);
    await qc.invalidateQueries();
  };

  const discard = () => {
    if (!window.confirm('Discard all unsaved changes?')) return;
    setEdits({});
    setDrafts([]);
    setErrors([]);
  };

  const orig = (fld: Field, row: Row) => toInput(fld, row[fld.name]);

  return (
    <div className="mx-auto max-w-[110rem]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Inventory sheet</h1>
          <p className="text-sm text-slate-500">
            Edit every project and type of a builder in one place. Changed cells turn yellow; nothing is saved until you press Save. Layouts, files and the map pin are still edited on each project.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && <button onClick={discard} disabled={saving} className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100">Discard</button>}
          <button
            onClick={save}
            disabled={!dirtyCount || saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : dirtyCount ? `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}` : 'Saved'}
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select aria-label="Builder" className={`${field} !w-auto`} value={builderId} onChange={(e) => changeBuilder(e.target.value)}>
          {builders.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
          {([['types', 'Types'], ['projects', 'Projects']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1 font-medium ${tab === k ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
        <span className="text-xs text-slate-500">Arrow keys and Enter move between rows.</span>
      </div>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {error && <p role="alert" className="mb-3 text-sm text-red-600">Failed to load: {error.message}</p>}
      {notice && <p role="status" className="mb-3 text-sm text-green-700">{notice}</p>}
      {errors.length > 0 && (
        <ul role="alert" className="mb-3 list-disc rounded-lg bg-red-50 py-2 pl-8 pr-3 text-sm text-red-700">
          {errors.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      )}

      <div onKeyDown={onGridKey} className="max-h-[calc(100vh-17rem)] overflow-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-300">
        {tab === 'types' ? (
          <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {typeFields.map((c) => <th key={c.name} className={th}>{c.label}</th>)}
                <th className={`${th} w-10`} />
              </tr>
            </thead>
            {projects.map((p) => {
              const list = grouped.get(p.id) ?? [];
              const mine = drafts.filter((d) => d.project_id === p.id);
              return (
                <tbody key={p.id}>
                  <tr>
                    <td colSpan={typeFields.length + 1} className="border-b border-slate-300 bg-slate-100 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <Link to={`/projects/${p.id}`} className="font-semibold text-indigo-700 hover:underline">{p.name}</Link>
                        <button onClick={() => addDraft(p.id)} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100">
                          <Plus className="size-3.5" /> Add type
                        </button>
                      </div>
                    </td>
                  </tr>
                  {list.map((t) => (
                    <tr key={t.id}>
                      {typeFields.map((c) => (
                        <td key={c.name} className={td}>
                          <Cell col={c.name} fld={c} original={orig(c, t)} edited={edits[t.id]?.[c.name]} onEdit={(v) => setCell(t.id, c, orig(c, t), v)} />
                        </td>
                      ))}
                      <td className={td}>
                        <button aria-label={`Delete Type ${t.type_name}`} onClick={() => deleteType(t)} className="p-1.5 text-red-600 hover:bg-red-50"><Trash2 className="size-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {mine.map((d) => (
                    <tr key={d.id}>
                      {typeFields.map((c) => (
                        <td key={c.name} className={td}>
                          <Cell col={c.name} fld={c} original="" edited={edits[d.id]?.[c.name] ?? ''} onEdit={(v) => setCell(d.id, c, '', v)} />
                        </td>
                      ))}
                      <td className={td}>
                        <button aria-label="Remove new row" onClick={() => removeDraft(d.id)} className="p-1.5 text-slate-500 hover:bg-slate-100"><X className="size-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {list.length === 0 && mine.length === 0 && (
                    <tr><td colSpan={typeFields.length + 1} className="border-b border-slate-200 px-2 py-2 text-slate-400">No types yet.</td></tr>
                  )}
                </tbody>
              );
            })}
          </table>
        ) : (
          <table className="w-full min-w-[72rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>{[nameField, ...projectFields].map((c) => <th key={c.name} className={th}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  {[nameField, ...projectFields].map((c) => (
                    <td key={c.name} className={td}>
                      <Cell col={c.name} fld={c} original={orig(c, p)} edited={edits[p.id]?.[c.name]} onEdit={(v) => setCell(p.id, c, orig(c, p), v)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && projects.length === 0 && <p className="p-6 text-center text-slate-500">This builder has no projects yet.</p>}
      </div>
    </div>
  );
}
