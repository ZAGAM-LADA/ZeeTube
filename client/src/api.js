export async function api(path, options = {}) {
  const config = { ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) } };
  if (options.body && !(options.body instanceof FormData) && typeof options.body !== 'string') config.body = JSON.stringify(options.body);
  let response;
  try { response = await fetch(`/api${path}`, config); }
  catch { throw new Error('Could not connect to ZeeTube. Make sure the backend server is running.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(Number(bytes)) || Number(bytes) < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB']; let value = Number(bytes); let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(i ? 1 : 0)} ${units[i]}`;
}
export function formatDuration(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  const h = Math.floor(n / 3600); const m = Math.floor((n % 3600) / 60); const s = n % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export function timeAgo(date) {
  if (!date) return 'Just now';
  const delta = Math.max(0, Date.now() - new Date(date).getTime());
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'Just now'; if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
