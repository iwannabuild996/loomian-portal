import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Pause, Play, type LucideIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { field } from '../admin/ResourcePage';
import {
  CALL_STATUS_LABEL, CALL_TYPE_LABEL, formatDuration, formatSize, formatWhen, RECORDING_BUCKET,
  type CallLog, type CallRecording, type CallType,
} from './types';

const PAGE = 500;

export const TYPE_ICON: Record<CallType, { icon: LucideIcon; tone: string }> = {
  inbound: { icon: PhoneIncoming, tone: 'text-emerald-600' },
  outbound: { icon: PhoneOutgoing, tone: 'text-indigo-600' },
  missed: { icon: PhoneMissed, tone: 'text-red-600' },
};

type Known = { name: string; leadId: string | null };

/** Maps stored E.164 numbers to the contact (and lead) they belong to. */
function useKnownNumbers() {
  return useQuery({
    queryKey: ['call-known-numbers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contact_phones').select('phone_e164, contacts(name, leads(id))');
      if (error) throw error;
      const map = new Map<string, Known>();
      for (const r of (data ?? []) as unknown as { phone_e164: string; contacts: { name: string; leads: { id: string }[] } | null }[]) {
        if (r.contacts) map.set(r.phone_e164, { name: r.contacts.name, leadId: r.contacts.leads?.[0]?.id ?? null });
      }
      return map;
    },
  });
}

function Who({ known, fallback, number }: { known?: Known; fallback?: string | null; number: string | null }) {
  const name = known?.name ?? fallback;
  return (
    <div>
      {name
        ? known?.leadId
          ? <Link to={`/leads/${known.leadId}`} className="font-medium text-indigo-600 hover:underline">{name}</Link>
          : <span className="font-medium">{name}</span>
        : <span className="text-slate-400">Unknown</span>}
      {number && <div className="text-xs text-slate-500">{number}</div>}
    </div>
  );
}

// Tiny silent clip: playing it inside the click keeps the browser's autoplay permission
// alive while the signed URL is fetched, so the real recording can start right after.
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/** One shared audio element, so starting a recording stops whichever one was playing. */
export function usePlayer() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<string, string>());
  const token = useRef(0);
  const [id, setId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRateState] = useState(1);

  useEffect(() => {
    const a = new Audio();
    audio.current = a;
    const on: [string, () => void][] = [
      ['play', () => setPlaying(true)],
      ['pause', () => setPlaying(false)],
      ['ended', () => setPlaying(false)],
      ['timeupdate', () => setTime(a.currentTime)],
      ['loadedmetadata', () => setDuration(Number.isFinite(a.duration) ? a.duration : 0)],
    ];
    on.forEach(([e, f]) => a.addEventListener(e, f));
    return () => {
      on.forEach(([e, f]) => a.removeEventListener(e, f));
      a.pause();
      a.removeAttribute('src');
    };
  }, []);

  const toggle = async (rec: CallRecording) => {
    const a = audio.current;
    if (!a) return;
    if (id === rec.id && !error) {
      if (a.paused) void a.play();
      else a.pause();
      return;
    }
    const mine = ++token.current;
    a.pause();
    a.src = SILENT;
    a.play().catch(() => {});
    setId(rec.id);
    setError(null);
    setLoading(true);
    setTime(0);
    setDuration(0);
    let url = urls.current.get(rec.id);
    if (!url) {
      const { data, error: err } = await supabase.storage.from(RECORDING_BUCKET).createSignedUrl(rec.storage_path, 3600);
      if (mine !== token.current) return;
      if (err || !data) {
        setLoading(false);
        a.pause();
        setError(err?.message ?? 'Could not load recording');
        return;
      }
      url = data.signedUrl;
      urls.current.set(rec.id, url);
    }
    a.src = url;
    // A new src resets the speed to the default, so apply the chosen one again.
    a.defaultPlaybackRate = rate;
    a.playbackRate = rate;
    try {
      await a.play();
    } catch {
      if (mine === token.current) setError('Could not play recording');
    }
    if (mine === token.current) setLoading(false);
  };

  const seek = (t: number) => {
    if (audio.current) audio.current.currentTime = t;
    setTime(t);
  };

  const setRate = (r: number) => {
    setRateState(r);
    if (audio.current) {
      audio.current.defaultPlaybackRate = r;
      audio.current.playbackRate = r;
    }
  };

  return { id, playing, loading, time, duration, error, rate, setRate, toggle, seek, url: (rid: string) => urls.current.get(rid) };
}
type Player = ReturnType<typeof usePlayer>;

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function RecordingPlayer({ rec, player }: { rec: CallRecording; player: Player }) {
  const active = player.id === rec.id;
  const playing = active && player.playing;
  const url = active ? player.url(rec.id) : undefined;
  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => void player.toggle(rec)}
          aria-label={playing ? 'Pause recording' : 'Play recording'}
          className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium hover:bg-slate-200"
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {active && player.loading ? 'Loading…' : playing ? 'Pause' : 'Play'}
        </button>
        {active && !player.error && (
          <>
            <input
              type="range"
              aria-label="Seek"
              className="w-32"
              min={0}
              max={player.duration || 0}
              step={0.1}
              value={Math.min(player.time, player.duration || 0)}
              onChange={(e) => player.seek(Number(e.target.value))}
            />
            <span className="w-20 text-xs tabular-nums text-slate-500">{clock(player.time)} / {clock(player.duration)}</span>
            <select aria-label="Playback speed" value={player.rate} onChange={(e) => player.setRate(Number(e.target.value))} className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs">
              {SPEEDS.map((r) => <option key={r} value={r}>{r}x</option>)}
            </select>
            {url && <a href={url} download aria-label="Download recording" className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><Download className="size-4" /></a>}
          </>
        )}
      </div>
      {active && player.error && <p role="alert" className="mt-1 text-xs text-red-600">{player.error}</p>}
    </div>
  );
}

const th = 'whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';

export function CallsPage() {
  const [tab, setTab] = useState<'logs' | 'recordings'>('logs');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | CallType>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [onlyRec, setOnlyRec] = useState(false);
  const known = useKnownNumbers().data;
  const player = usePlayer();

  const logs = useQuery({
    queryKey: ['call-logs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('call_logs').select('*, recording:call_recordings(*)').order('called_at', { ascending: false }).limit(PAGE);
      if (error) throw error;
      return data as CallLog[];
    },
  });
  const recs = useQuery({
    queryKey: ['call-recordings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('call_recordings').select('*').order('recorded_at', { ascending: false }).limit(PAGE);
      if (error) throw error;
      return data as CallRecording[];
    },
  });

  const digits = search.replace(/\D/g, '');
  const term = search.trim().toLowerCase();
  const inRange = (iso: string) => {
    // Compare in local time so a late-evening call lands on the right day.
    const local = new Date(iso);
    const day = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    return (!from || day >= from) && (!to || day <= to);
  };
  const matches = (e164: string | null, number: string | null, label?: string | null) => {
    if (!term) return true;
    const name = (e164 && known?.get(e164)?.name) || label || '';
    return name.toLowerCase().includes(term) || (!!digits && (e164 ?? number ?? '').replace(/\D/g, '').includes(digits));
  };

  const logRows = useMemo(
    () => (logs.data ?? []).filter((c) => (!type || c.call_type === type) && (!onlyRec || !!c.recording) && inRange(c.called_at) && matches(c.phone_e164, c.phone_number)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs.data, type, onlyRec, from, to, term, known],
  );
  const recRows = useMemo(
    () => (recs.data ?? []).filter((r) => inRange(r.recorded_at) && matches(r.phone_e164, r.phone_number, r.contact_label)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recs.data, from, to, term, known],
  );

  const stats = useMemo(() => {
    const all = logRows;
    return {
      total: all.length,
      missed: all.filter((c) => c.call_type === 'missed').length,
      recorded: all.filter((c) => c.recording).length,
      talk: all.reduce((s, c) => s + c.duration_seconds, 0),
    };
  }, [logRows]);

  const active = tab === 'logs' ? logs : recs;
  const count = tab === 'logs' ? logRows.length : recRows.length;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Calls</h1>
        <p className="text-sm text-slate-500">Call history and recordings synced from the staff phones.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
          {([['logs', 'Call logs'], ['recordings', 'Recordings']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1 font-medium ${tab === k ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
        <input className={`${field} !w-56`} placeholder="Search name or number" value={search} onChange={(e) => setSearch(e.target.value)} />
        {tab === 'logs' && (
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={onlyRec} onChange={(e) => setOnlyRec(e.target.checked)} /> With recording</label>
        )}
        {tab === 'logs' && (
          <select aria-label="Call type" className={`${field} !w-auto`} value={type} onChange={(e) => setType(e.target.value as '' | CallType)}>
            <option value="">All calls</option>
            {(Object.keys(CALL_TYPE_LABEL) as CallType[]).map((t) => <option key={t} value={t}>{CALL_TYPE_LABEL[t]}</option>)}
          </select>
        )}
        <input type="date" aria-label="From date" className={`${field} !w-auto`} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" aria-label="To date" className={`${field} !w-auto`} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {tab === 'logs' && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
          {[['Calls', String(stats.total)], ['Missed', String(stats.missed)], ['Recorded', String(stats.recorded)], ['Talk time', formatDuration(stats.talk)]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-500">{l}</p>
              <p className="text-lg font-semibold">{v}</p>
            </div>
          ))}
        </div>
      )}

      {active.isLoading && <p className="text-slate-500">Loading…</p>}
      {active.error && <p role="alert" className="mb-3 text-sm text-red-600">Failed to load: {active.error.message}</p>}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {tab === 'logs' ? (
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-100"><tr>{['Type', 'Contact', 'When', 'Duration', 'Status', 'Recording'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {logRows.map((c) => {
                const { icon: Icon, tone } = TYPE_ICON[c.call_type];
                return (
                  <tr key={c.id} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="px-4 py-2.5"><span className={`flex items-center gap-2 ${tone}`}><Icon className="size-4" />{CALL_TYPE_LABEL[c.call_type]}</span></td>
                    <td className="px-4 py-2.5"><Who known={c.phone_e164 ? known?.get(c.phone_e164) : undefined} number={c.phone_number} /></td>
                    <td className="whitespace-nowrap px-4 py-2.5">{formatWhen(c.called_at)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{c.duration_seconds ? formatDuration(c.duration_seconds) : '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{CALL_STATUS_LABEL[c.call_status]}</td>
                    <td className="px-4 py-2.5">{c.recording ? <RecordingPlayer rec={c.recording} player={player} /> : <span className="text-slate-400">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-100"><tr>{['Contact', 'Recorded', 'Duration', 'Size', 'Recording'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {recRows.map((r) => (
                <tr key={r.id} className="border-t border-slate-200 align-middle hover:bg-slate-50">
                  <td className="px-4 py-2.5"><Who known={r.phone_e164 ? known?.get(r.phone_e164) : undefined} fallback={r.contact_label} number={r.phone_number} /></td>
                  <td className="whitespace-nowrap px-4 py-2.5">{formatWhen(r.recorded_at)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{formatDuration(r.duration_ms == null ? null : r.duration_ms / 1000)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{formatSize(r.size_bytes)}</td>
                  <td className="px-4 py-2.5"><RecordingPlayer rec={r} player={player} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!active.isLoading && count === 0 && (
          <p className="flex items-center justify-center gap-2 p-6 text-slate-500"><Phone className="size-4" /> {tab === 'logs' ? 'No calls found.' : 'No recordings found.'}</p>
        )}
      </div>
      {(active.data?.length ?? 0) >= PAGE && <p className="mt-2 text-xs text-slate-500">Showing the latest {PAGE}. Use the date filters to narrow down.</p>}
    </div>
  );
}
