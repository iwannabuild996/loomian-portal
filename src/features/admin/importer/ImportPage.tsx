import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardCopy, Download, Upload } from 'lucide-react';
import { field } from '../ResourcePage';
import { supabase } from '../../../lib/supabase';
import { formatINR } from '../../../lib/money';
import { applyPlan, type ProjectResult } from './apply';
import { buildPlan, EXAMPLE, llmInstructions, parseJson, planErrors, type Change, type Existing, type Plan } from './plan';

const MONEY = new Set(['price', 'parking_charge', 'floor_hike_per_floor']);

function show(field: string, v: unknown): string {
  if (v == null || v === '') return '—';
  if (MONEY.has(field) && typeof v === 'number') return formatINR(v);
  if (field === 'possession_date') return String(v).slice(0, 7);
  return String(v);
}

const BADGE: Record<string, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-amber-100 text-amber-700',
  unchanged: 'bg-slate-100 text-slate-500',
};

function Changes({ changes }: { changes: Change[] }) {
  return (
    <ul className="space-y-0.5 text-xs text-slate-600">
      {changes.map((c) => (
        <li key={c.field}><span className="font-medium">{c.field}</span>: <span className="text-slate-400 line-through">{show(c.field, c.from)}</span> → {show(c.field, c.to)}</li>
      ))}
    </ul>
  );
}

function download(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [builderId, setBuilderId] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ results: ProjectResult[]; fatal?: string } | null>(null);

  const { data: existing, isLoading, error } = useQuery({
    queryKey: ['import-existing'],
    queryFn: async (): Promise<Existing> => {
      const [builders, locations, configurations, projects, types] = await Promise.all([
        supabase.from('builders').select('id, name'),
        supabase.from('locations').select('id, name'),
        supabase.from('configurations').select('id, name'),
        supabase.from('projects').select('*'),
        supabase.from('unit_types').select('*'),
      ]);
      for (const r of [builders, locations, configurations, projects, types]) if (r.error) throw r.error;
      return {
        builders: builders.data ?? [], locations: locations.data ?? [], configurations: configurations.data ?? [],
        projects: projects.data ?? [], types: types.data ?? [],
      };
    },
  });

  const parsed = useMemo(() => (text.trim() ? parseJson(text) : null), [text]);
  const plan: Plan | null = useMemo(
    () => (parsed && 'value' in parsed && existing ? buildPlan(parsed.value, existing, builderId) : null),
    [parsed, existing, builderId],
  );
  const errors = plan ? planErrors(plan) : [];
  const todo = plan?.projects.filter((p) => p.action !== 'unchanged').length ?? 0;

  const copy = async (label: string, body: string) => {
    await navigator.clipboard.writeText(body);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setOutcome(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const run = async () => {
    if (!plan) return;
    setBusy(true);
    setOutcome(await applyPlan(plan, builderId));
    setBusy(false);
    await qc.invalidateQueries();
  };

  const counts = plan && {
    newProjects: plan.projects.filter((p) => p.action === 'create').length,
    updated: plan.projects.filter((p) => p.action === 'update').length,
    unchanged: plan.projects.filter((p) => p.action === 'unchanged').length,
    newTypes: plan.projects.reduce((n, p) => n + p.types.filter((t) => t.action === 'create').length, 0),
    updatedTypes: plan.projects.reduce((n, p) => n + p.types.filter((t) => t.action === 'update').length, 0),
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Import projects</h1>
        <p className="text-sm text-slate-500">
          Import a builder's projects, or a single project, from JSON into the builder you choose. Projects are matched by name: existing ones are updated (only the fields in the file), new ones are created. Nothing is ever deleted, and you review every change before it is saved.
        </p>
      </div>

      <section className="mb-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-1 font-semibold">1. Get your data into this format</h2>
        <p className="mb-3 text-sm text-slate-600">
          Copy the instructions, paste them into your LLM together with the brochure, price list or sheet, and paste the JSON it returns below.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => copy('llm', llmInstructions(existing?.configurations.map((c) => c.name) ?? [], existing?.locations.map((l) => l.name).sort() ?? []))} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {copied === 'llm' ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} Copy LLM instructions
          </button>
          <button onClick={() => download('projects-example.json', JSON.stringify(EXAMPLE, null, 2))} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300 hover:bg-slate-50">
            <Download className="size-4" /> Example file
          </button>
        </div>
      </section>

      <section className="mb-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <label htmlFor="import-builder" className="mb-1 block font-semibold">2. Choose the builder</label>
        <select id="import-builder" className={`${field} !w-auto min-w-64`} value={builderId} onChange={(e) => { setBuilderId(e.target.value); setOutcome(null); }}>
          <option value="">Select a builder…</option>
          {existing?.builders.slice().sort((a, b) => a.name.localeCompare(b.name)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <p className="mt-1 text-xs text-slate-500">Every project in the file is added to, or updated under, this builder.</p>
      </section>

      <section className="mb-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">3. Paste or upload the JSON</h2>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".json,application/json,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300 hover:bg-slate-50"><Upload className="size-4" /> Upload file</button>
            {text && <button onClick={() => { setText(''); setOutcome(null); }} className="rounded-lg px-3 py-1.5 text-sm hover:bg-slate-100">Clear</button>}
          </div>
        </div>
        <textarea
          aria-label="Import JSON"
          rows={12}
          spellCheck={false}
          className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          placeholder='{ "projects": [ … ] }'
          value={text}
          onChange={(e) => { setText(e.target.value); setOutcome(null); }}
        />
      </section>

      {isLoading && <p className="text-slate-500">Loading current data…</p>}
      {error && <p role="alert" className="mb-3 text-sm text-red-600">Failed to load: {error.message}</p>}
      {parsed && 'error' in parsed && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{parsed.error}</p>}

      {plan && (
        <section className="space-y-4">
          <h2 className="font-semibold">4. Review</h2>

          {errors.length > 0 && (
            <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <div className="mb-1 flex items-center justify-between gap-3">
                <p className="font-medium">{errors.length} problem{errors.length === 1 ? '' : 's'} to fix before importing</p>
                <button onClick={() => copy('errors', `Fix these problems in the JSON and return the corrected JSON only:\n${errors.map((e) => `- ${e}`).join('\n')}`)} className="flex items-center gap-1 text-xs underline">
                  {copied === 'errors' ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />} Copy for your LLM
                </button>
              </div>
              <ul className="list-disc pl-5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}

          {counts && (
            <div className="flex flex-wrap gap-2 text-sm">
              {[
                [`${counts.newProjects} new project${counts.newProjects === 1 ? '' : 's'}`, BADGE.create],
                [`${counts.updated} to update`, BADGE.update],
                [`${counts.unchanged} unchanged`, BADGE.unchanged],
                [`${counts.newTypes} new types`, BADGE.create],
                [`${counts.updatedTypes} types updated`, BADGE.update],
                ...(plan.newLocations.length ? [[`New location${plan.newLocations.length === 1 ? '' : 's'}: ${plan.newLocations.join(', ')}`, BADGE.create]] : []),
              ].map(([label, tone]) => <span key={label} className={`rounded-full px-3 py-1 font-medium ${tone}`}>{label}</span>)}
            </div>
          )}

          <div className="space-y-3">
            {plan.projects.map((p, i) => (
              <div key={i} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[p.action]}`}>{p.action === 'create' ? 'New' : p.action === 'update' ? 'Update' : 'No changes'}</span>
                  <h3 className="font-semibold">{p.name}</h3>
                  <span className="text-sm text-slate-500">{p.locationName}</span>
                </div>
                {p.action === 'update' && p.changes.length > 0 && <div className="mt-2"><Changes changes={p.changes} /></div>}
                {p.action === 'create' && (
                  <p className="mt-1 text-xs text-slate-500">
                    {Object.entries(p.payload).map(([k, v]) => `${k}: ${show(k, v)}`).join(' · ')}
                  </p>
                )}
                {p.warnings.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">{p.warnings.map((w, j) => <li key={j}>{w}</li>)}</ul>}
                {p.types.length > 0 && (
                  <table className="mt-3 w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-1 pr-3">Type</th><th className="py-1 pr-3">Config</th><th className="py-1 pr-3">Details</th><th className="py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {p.types.map((t, j) => (
                        <tr key={j} className="border-t border-slate-100 align-top">
                          <td className="py-1.5 pr-3 font-medium">Type {t.typeName || '?'}</td>
                          <td className="py-1.5 pr-3">{t.configurationName ?? '—'}</td>
                          <td className="py-1.5 pr-3">
                            {t.action === 'create'
                              ? <span className="text-xs text-slate-600">{Object.entries(t.payload).filter(([k]) => k !== 'configuration_id').map(([k, v]) => `${k}: ${show(k, v)}`).join(' · ')}</span>
                              : <Changes changes={t.changes} />}
                          </td>
                          <td className="py-1.5 text-right"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[t.action]}`}>{t.action === 'create' ? 'New' : t.action === 'update' ? 'Update' : 'Same'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/95 px-1 py-3">
            <p className="text-sm text-slate-600">{todo ? `${todo} project${todo === 1 ? '' : 's'} will be saved.` : 'Nothing to import.'}</p>
            <button
              onClick={run}
              disabled={busy || !builderId || errors.length > 0 || todo === 0 || !!outcome}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? 'Importing…' : 'Import'}
            </button>
          </div>
        </section>
      )}

      {outcome && (
        <section className="mt-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-2 font-semibold">Result</h2>
          {outcome.fatal && <p role="alert" className="text-sm text-red-600">{outcome.fatal}</p>}
          <ul className="space-y-1 text-sm">
            {outcome.results.map((r, i) => (
              <li key={i} className={r.ok ? 'text-green-700' : 'text-red-600'}>{r.ok ? '✓' : '✗'} <span className="font-medium">{r.name}</span> — {r.message}</li>
            ))}
          </ul>
          {outcome.results.some((r) => !r.ok) && <p className="mt-2 text-xs text-slate-500">Projects marked ✗ were not fully saved. Fix the cause and import again: already-saved projects will show as unchanged.</p>}
        </section>
      )}
    </div>
  );
}
