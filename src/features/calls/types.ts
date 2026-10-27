export type CallType = 'inbound' | 'outbound' | 'missed';
export type CallStatus = 'connected' | 'no_answer' | 'rejected' | 'unknown';

export type CallLog = {
  id: string;
  device_id: string;
  phone_number: string;
  phone_e164: string | null;
  call_type: CallType;
  call_status: CallStatus;
  duration_seconds: number;
  called_at: string;
  recording_id: string | null;
  recording: CallRecording | null;
};

export type CallRecording = {
  id: string;
  device_id: string;
  contact_label: string | null;
  phone_number: string | null;
  phone_e164: string | null;
  recorded_at: string;
  duration_ms: number | null;
  size_bytes: number | null;
  storage_path: string;
};

export const CALL_TYPE_LABEL: Record<CallType, string> = { inbound: 'Incoming', outbound: 'Outgoing', missed: 'Missed' };
export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  connected: 'Connected',
  no_answer: 'No answer',
  rejected: 'Rejected',
  unknown: 'Unknown',
};

export const RECORDING_BUCKET = 'call-recordings';

export function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds == null) return '—';
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m ${sec}s`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function formatSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
