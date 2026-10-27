import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { RecordingPlayer, usePlayer } from './CallsPage';
import { formatDuration, formatSize, formatWhen, type CallRecording } from './types';

/** Call recordings for any of a lead's phone numbers. Only admins and editors can read them. */
export function LeadCallRecordings({ phones }: { phones: string[] }) {
  const player = usePlayer();
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['lead-call-recordings', phones],
    enabled: phones.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_recordings')
        .select('*')
        .in('phone_e164', phones)
        .order('recorded_at', { ascending: false });
      if (error) throw error;
      return data as CallRecording[];
    },
  });

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-3 font-semibold">Call recordings</h2>
      {error && <p role="alert" className="text-sm text-red-600">Failed to load: {error.message}</p>}
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {!isLoading && !error && data.length === 0 && <p className="text-sm text-slate-500">No call recordings for this lead.</p>}
      {data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {['Number', 'Recorded', 'Duration', 'Size', 'Recording'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-t border-slate-200 align-middle">
                  <td className="whitespace-nowrap px-3 py-2">{r.phone_number ?? r.phone_e164}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatWhen(r.recorded_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatDuration(r.duration_ms == null ? null : r.duration_ms / 1000)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatSize(r.size_bytes)}</td>
                  <td className="px-3 py-2"><RecordingPlayer rec={r} player={player} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
