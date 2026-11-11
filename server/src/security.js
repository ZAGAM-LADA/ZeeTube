import dns from 'node:dns/promises';
import net from 'node:net';

export function isPrivateIPv4(address) {
  if (net.isIP(address) !== 4) return false;
  const octets = address.split('.').map(Number);
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0);
}

export function isPrivateIP(address) {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version !== 6) return true;
  const ip = address.toLowerCase().split('%')[0];
  if (ip === '::' || ip === '::1') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) return true;
  if (ip.startsWith('ff') || ip.startsWith('2001:db8:') || ip.startsWith('2001:0:')) return true;
  if (ip.startsWith('::ffff:')) {
    const tail = ip.slice(7);
    if (net.isIP(tail) === 4) return isPrivateIPv4(tail);
    const hex = tail.split(':');
    if (hex.length === 2) {
      const n1 = parseInt(hex[0], 16); const n2 = parseInt(hex[1], 16);
      if (Number.isFinite(n1) && Number.isFinite(n2)) return isPrivateIPv4(`${n1 >> 8}.${n1 & 255}.${n2 >> 8}.${n2 & 255}`);
    }
  }
  return false;
}

export function hostMatchesAllowlist(hostname, entries = []) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return entries.map((entry) => entry.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean).some((entry) => {
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(2);
      return host !== suffix && host.endsWith(`.${suffix}`);
    }
    return host === entry;
  });
}

export function configuredAllowedHosts() {
  return (process.env.MEDIA_ALLOWED_HOSTS || '').split(',').map((x) => x.trim()).filter(Boolean);
}

export async function validateMediaUrl(input, { resolveDns = true } = {}) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Enter a valid, complete media URL.'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS media URLs are supported.');
  if (url.protocol === 'http:' && process.env.MEDIA_ALLOW_HTTP !== 'true') throw new Error('HTTP URLs are disabled. Use HTTPS or set MEDIA_ALLOW_HTTP=true for a trusted local environment.');
  if (url.username || url.password) throw new Error('URLs containing embedded credentials are not allowed.');
  if (!url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) throw new Error('Localhost URLs are blocked.');
  const allowlist = configuredAllowedHosts();
  if (!hostMatchesAllowlist(url.hostname, allowlist)) throw new Error(`This host is not enabled. Add ${url.hostname} to MEDIA_ALLOWED_HOSTS only if you own it or are authorized to download from it.`);
  if (net.isIP(url.hostname) && isPrivateIP(url.hostname)) throw new Error('Private or reserved IP addresses are blocked.');
  if (resolveDns && !net.isIP(url.hostname)) {
    let records;
    try { records = await dns.lookup(url.hostname, { all: true, verbatim: true }); }
    catch { throw new Error('The media host could not be resolved. Check the URL and host configuration.'); }
    if (!records.length || records.some((record) => isPrivateIP(record.address))) throw new Error('The media host resolves to a private or reserved network address and was blocked.');
  }
  url.hash = '';
  return url;
}

export function safeDisplayName(value, fallback = 'media-file') {
  const name = String(value || fallback).normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\.\./g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
  return name || fallback;
}
