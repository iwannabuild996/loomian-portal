import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

type Entry = {
  id: number; table_name: string; row_id: string; action: string;
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
  changed_by: string | null; changed_at: string;
};

const SKIP = new Set(['updated_at', 'created_at', 'id']);

function summarize(e: Entry): string {
  const data = e.new_data ?? e.old_data ?? {};
  if (e.action === 'UPDATE' && e.old_data && e.new_data) {
    const diffs = Object.keys(e.new_data)
      .filter((k) => !SKIP.has(k) && JSON.stringify(e.old_data![k]) !== JSON.stringify(e.new_data![k]))
      .map((k) => `${k}: ${JSON.stringify(e.old_data![k])} → ${JSON.stringify(e.new_data![k])}`);
    return diffs.join(', ') || '(no visible change)';
  }
  const label = data.name ?? data.type_name;
  return label ? String(label) : e.row_id;
}

const badge: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};

export function AuditPage() {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'audit_log'],
    queryFn: async () => {
      const [log, users] = await Promise.all([
        supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(200),
        supabase.from('profiles').select('id, email'),
      ]);
      if (log.error) throw log.error;
      const emails = new Map((users.data ?? []).map((u) => [u.id as string, u.email as string | null]));
      return (log.data as Entry[]).map((e) => ({ ...e, who: (e.changed_by && emails.get(e.changed_by)) || '—' }));
    },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="mb-6 text-sm text-slate-500">The latest 200 changes to builders, locations, configurations, projects and types.</p>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {error && <p role="alert" className="text-sm text-red-600">Failed to load: {error.message}</p>}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-100">
            <tr>
              {['When', 'Who', 'Action', 'Table', 'Details'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id} className="border-t border-slate-200 align-top">
                <td className="whitespace-nowrap px-4 py-2.5">{new Date(e.changed_at).toLocaleString()}</td>
                <td className="px-4 py-2.5">{e.who}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge[e.action] ?? ''}`}>{e.action}</span>
                </td>
                <td className="px-4 py-2.5">{e.table_name}</td>
                <td className="px-4 py-2.5 text-slate-600">{summarize(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && data.length === 0 && <p className="p-6 text-center text-slate-500">No changes recorded yet.</p>}
      </div>
    </div>
  );
}
