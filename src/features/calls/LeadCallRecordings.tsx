import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { RecordingPlayer, TYPE_ICON, usePlayer } from './CallsPage';
import { CALL_STATUS_LABEL, CALL_TYPE_LABEL, formatDuration, formatWhen, type CallLog } from './types';

/** The lead's call logs (matched by phone number) with each call's linked recording. Admins and editors only. */
export function LeadCallRecordings({ phones }: { phones: string[] }) {
  const player = usePlayer();
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['lead-call-logs', phones],
    enabled: phones.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_logs')
        .select('*, recording:call_recordings(*)')
        .in('phone_e164', phones)
        .order('called_at', { ascending: false });
      if (error) throw error;
      return data as CallLog[];
    },
  });

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-3 font-semibold">Calls & recordings</h2>
      {error && <p role="alert" className="text-sm text-red-600">Failed to load: {error.message}</p>}
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {!isLoading && !error && data.length === 0 && <p className="text-sm text-slate-500">No calls for this lead.</p>}
      {data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {['Type', 'Number', 'When', 'Duration', 'Status', 'Recording'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((c) => {
                const { icon: Icon, tone } = TYPE_ICON[c.call_type];
                return (
                  <tr key={c.id} className="border-t border-slate-200 align-middle">
                    <td className="px-3 py-2"><span className={`flex items-center gap-2 ${tone}`}><Icon className="size-4" />{CALL_TYPE_LABEL[c.call_type]}</span></td>
                    <td className="whitespace-nowrap px-3 py-2">{c.phone_number}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatWhen(c.called_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{c.duration_seconds ? formatDuration(c.duration_seconds) : '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{CALL_STATUS_LABEL[c.call_status]}</td>
                    <td className="px-3 py-2">{c.recording ? <RecordingPlayer rec={c.recording} player={player} /> : <span className="text-slate-400">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
