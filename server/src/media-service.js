import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { store } from './store.js';
import { validateMediaUrl, safeDisplayName } from './security.js';

const execFileAsync = promisify(execFile);
const downloadControllers = new Map();
const conversionProcesses = new Map();
const conversionQueue = [];
let conversionRunning = false;

const dataDir = () => store.dataDir;
const folder = (name) => path.join(dataDir(), name);
function positiveLimit(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}
const MAX_DOWNLOAD_BYTES = positiveLimit(process.env.MAX_DOWNLOAD_MB || 2048, 2048) * 1024 * 1024;
const MAX_UPLOAD_BYTES = positiveLimit(process.env.MAX_UPLOAD_MB || 1024, 1024) * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.m4v', '.avi', '.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.opus']);

function bytesLabel(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes; let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function mimeToExt(mime, urlExt) {
  const allowed = new Set(['.mp4', '.webm', '.mov', '.mkv', '.m4v', '.avi', '.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.opus']);
  const normalized = (mime || '').split(';')[0].trim().toLowerCase();
  const map = {
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/x-matroska': '.mkv',
    'video/x-msvideo': '.avi', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a',
    'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg', 'audio/flac': '.flac',
    'audio/aac': '.aac', 'audio/opus': '.opus'
  };
  return map[normalized] || (allowed.has(urlExt) ? urlExt : null);
}

function classifyMime(mime, ext) {
  const value = (mime || '').split(';')[0].trim().toLowerCase();
  if (value.startsWith('video/')) return 'video';
  if (value.startsWith('audio/')) return 'audio';
  if (value === 'application/octet-stream' || !value) {
    return ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.opus'].includes(ext) ? 'audio' : 'video';
  }
  return null;
}

async function requestFollowing(rawUrl, method, signal, extraHeaders = {}) {
  let current = rawUrl;
  for (let count = 0; count <= 5; count++) {
    const safeUrl = await validateMediaUrl(current);
    const response = await fetch(safeUrl, {
      method,
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': 'ZAG-Video-Hub/1.0', ...(method === 'GET' ? { 'Accept': 'video/*,audio/*,application/octet-stream;q=0.8,*/*;q=0.1' } : {}), ...extraHeaders }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      try { await response.body?.cancel(); } catch {}
      if (!location) throw new Error('The source returned a redirect without a destination.');
      if (count === 5) throw new Error('The source redirected too many times.');
      current = new URL(location, safeUrl).toString();
      continue;
    }
    return { response, finalUrl: safeUrl };
  }
  throw new Error('Could not reach the media source safely.');
}

export async function inspectRemoteMedia(rawUrl) {
  const safe = await validateMediaUrl(rawUrl);
  let response;
  let finalUrl = safe;
  try {
    ({ response, finalUrl } = await requestFollowing(safe.toString(), 'HEAD'));
    if (response.status === 405 || response.status === 501) {
      try { await response.body?.cancel(); } catch {}
      ({ response, finalUrl } = await requestFollowing(safe.toString(), 'GET', undefined, { Range: 'bytes=0-0' }));
    }
    if (!response.ok) throw new Error(`The source returned HTTP ${response.status}.`);
    const mime = response.headers.get('content-type') || '';
    const extFromUrl = path.extname(new URL(finalUrl).pathname).toLowerCase();
    const ext = mimeToExt(mime, extFromUrl);
    const type = classifyMime(mime, ext || extFromUrl);
    if (!ext || !type || !SUPPORTED_EXTENSIONS.has(ext)) throw new Error('This URL does not look like a supported direct audio/video file. Streaming pages and unsupported formats are not accepted.');
    const contentRange = response.headers.get('content-range') || '';
    const rangeTotal = /\/(\d+)$/.exec(contentRange);
    const headerSize = Number(response.headers.get('content-length'));
    const size = (rangeTotal ? Number(rangeTotal[1]) : null) || (Number.isFinite(headerSize) && headerSize > 0 ? headerSize : null);
    if (size && size > MAX_DOWNLOAD_BYTES) throw new Error(`This file exceeds the configured ${bytesLabel(MAX_DOWNLOAD_BYTES)} download limit.`);
    return {
      url: safe.toString(), title: safeDisplayName(path.basename(new URL(finalUrl).pathname, ext) || 'Remote media'),
      type, mimeType: mime || (type === 'video' ? 'video/mp4' : 'audio/mpeg'), extension: ext,
      size, sizeLabel: bytesLabel(size), sourceHost: new URL(finalUrl).hostname,
      formats: [{ extension: ext.slice(1).toUpperCase(), label: `${ext.slice(1).toUpperCase()} · source quality`, resolution: 'Original' }],
      note: 'Direct media file detected. Resolution choices depend on the source URL; this app will not invent alternate qualities.'
    };
  } finally {
    try { await response?.body?.cancel(); } catch {}
  }
}

export async function createDownload({ url, title, extension }) {
  const inspected = await inspectRemoteMedia(url);
  const item = await store.insert('downloads', {
    id: randomUUID(), title: safeDisplayName(title || inspected.title, 'Remote media'), url: inspected.url,
    sourceHost: inspected.sourceHost, status: 'queued', progress: 0, bytesReceived: 0,
    totalBytes: inspected.size, sizeLabel: inspected.sizeLabel, mimeType: inspected.mimeType,
    mediaType: inspected.type, extension: inspected.extension, selectedExtension: extension || inspected.extension,
    speedBytesPerSecond: 0, etaSeconds: null, error: null, mediaId: null,
    startedAt: null, completedAt: null, cancelRequested: false
  });
  void runDownload(item.id).catch((error) => console.error('[download]', error.message));
  return item;
}

async function runDownload(id) {
  const initial = await store.get('downloads', id);
  if (!initial || initial.status !== 'queued') return;
  const activeLimit = Math.max(1, Number(process.env.MAX_ACTIVE_DOWNLOADS || 2));
  if (downloadControllers.size >= activeLimit) {
    setTimeout(() => void runDownload(id), 1200);
    return;
  }
  const controller = new AbortController();
  downloadControllers.set(id, controller);
  let outputPath = null;
  const started = Date.now();
  try {
    await store.update('downloads', id, { status: 'downloading', startedAt: new Date().toISOString(), error: null });
    const { response, finalUrl } = await requestFollowing(initial.url, 'GET', controller.signal);
    if (!response.ok || !response.body) { try { await response.body?.cancel(); } catch {} throw new Error(`Download failed with HTTP ${response.status}.`); }
    const mime = response.headers.get('content-type') || initial.mimeType || '';
    const urlExt = path.extname(new URL(finalUrl).pathname).toLowerCase();
    const ext = mimeToExt(mime, urlExt) || initial.extension;
    if (!SUPPORTED_EXTENSIONS.has(ext) || !classifyMime(mime, ext)) throw new Error('The response was not a supported media file.');
    const rawLength = Number(response.headers.get('content-length'));
    const total = (Number.isFinite(rawLength) && rawLength > 0 ? rawLength : null) || initial.totalBytes || null;
    if (total && total > MAX_DOWNLOAD_BYTES) throw new Error(`This file exceeds the configured ${bytesLabel(MAX_DOWNLOAD_BYTES)} limit.`);
    const base = safeDisplayName(initial.title, 'media-file').replace(/\.[^.]+$/, '').slice(0, 80);
    const filename = `${base}-${id.slice(0, 8)}${ext}`;
    outputPath = path.join(folder('downloads'), filename);
    await fsMkdir(folder('downloads'));
    let received = 0; let lastUpdate = 0; let lastBytes = 0; let lastAt = Date.now(); let latestSpeed = 0;
    const meter = new Transform({ transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_DOWNLOAD_BYTES) return callback(new Error(`Download exceeded the configured ${bytesLabel(MAX_DOWNLOAD_BYTES)} limit.`));
      const now = Date.now();
      if (now - lastUpdate > 600) {
        latestSpeed = (received - lastBytes) / Math.max((now - lastAt) / 1000, 0.001);
        lastBytes = received; lastAt = now; lastUpdate = now;
        const progress = total ? Math.min(99, Math.floor(received / total * 100)) : 0;
        void store.update('downloads', id, { bytesReceived: received, totalBytes: total, progress, speedBytesPerSecond: Math.round(latestSpeed), etaSeconds: latestSpeed > 0 && total ? Math.max(0, Math.round((total - received) / latestSpeed)) : null });
      }
      callback(null, chunk);
    }});
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(outputPath, { flags: 'wx' }), { signal: controller.signal });
    const stat = await fs.stat(outputPath);
    if (!stat.size) throw new Error('The source returned an empty file.');
    const media = await store.insert('media', {
      id: randomUUID(), title: initial.title, type: initial.mediaType, mimeType: mime || initial.mimeType,
      fileName: filename, filePath: outputPath, bytes: stat.size, sizeLabel: bytesLabel(stat.size),
      sourceUrl: initial.url, sourceHost: initial.sourceHost, duration: null, favorite: false,
      origin: 'download', createdAt: new Date().toISOString()
    });
    await store.update('downloads', id, {
      status: 'completed', progress: 100, bytesReceived: stat.size, totalBytes: stat.size,
      sizeLabel: bytesLabel(stat.size), speedBytesPerSecond: Math.round(stat.size / Math.max((Date.now() - started) / 1000, 0.001)),
      etaSeconds: 0, mediaId: media.id, fileName: filename, filePath: outputPath, mimeType: mime || initial.mimeType,
      completedAt: new Date().toISOString(), error: null
    });
  } catch (err) {
    if (outputPath) await fsp.rm(outputPath, { force: true }).catch(() => {});
    const latest = await store.get('downloads', id).catch(() => null);
    const cancelled = controller.signal.aborted || latest?.cancelRequested;
    await store.update('downloads', id, { status: cancelled ? 'cancelled' : 'failed', progress: 0, error: cancelled ? null : safeDisplayName(err.message, 'Download failed'), filePath: null, speedBytesPerSecond: 0, etaSeconds: null }).catch(() => {});
  } finally {
    downloadControllers.delete(id);
  }
}

async function fsMkdir(folderPath) { await fsp.mkdir(folderPath, { recursive: true }); }

export async function cancelDownload(id) {
  const item = await store.get('downloads', id);
  if (!item) return null;
  if (['completed', 'failed', 'cancelled'].includes(item.status)) return item;
  await store.update('downloads', id, { cancelRequested: true });
  const controller = downloadControllers.get(id);
  if (controller) controller.abort();
  else await store.update('downloads', id, { status: 'cancelled' });
  return store.get('downloads', id);
}

export async function retryDownload(id) {
  const old = await store.get('downloads', id);
  if (!old) return null;
  return createDownload({ url: old.url, title: old.title, extension: old.extension });
}

export async function uploadToLibrary(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    await fsp.rm(file.path, { force: true }).catch(() => {});
    throw new Error(`Unsupported file extension: ${ext || 'unknown'}.`);
  }
  let probe = null;
  try {
    probe = await runFfprobe(file.path);
    const streams = probe.streams || [];
    const hasVideo = streams.some((stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
    const hasAudio = streams.some((stream) => stream.codec_type === 'audio');
    if (!hasVideo && !hasAudio) throw new Error('The uploaded file does not contain a supported audio or video stream.');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      await fsp.rm(file.path, { force: true }).catch(() => {});
      throw new Error(err.message?.includes('does not contain') ? err.message : 'The uploaded file could not be verified as playable media. Check that it is not corrupt.');
    }
  }
  const safeName = safeDisplayName(path.basename(file.originalname, ext), 'Uploaded media');
  const finalName = `${safeName.replace(/\.[^.]+$/, '')}-${randomUUID().slice(0, 8)}${ext}`;
  const finalPath = path.join(folder('uploads'), finalName);
  await fsp.rename(file.path, finalPath);
  const stat = await fsp.stat(finalPath);
  const audioExtensions = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.opus']);
  const hasVideo = (probe?.streams || []).some((stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  const hasAudio = (probe?.streams || []).some((stream) => stream.codec_type === 'audio');
  const audio = probe ? (!hasVideo && hasAudio) : audioExtensions.has(ext);
  const mimeByExtension = {
    '.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.mkv':'video/x-matroska','.m4v':'video/x-m4v','.avi':'video/x-msvideo',
    '.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav','.ogg':'audio/ogg','.flac':'audio/flac','.aac':'audio/aac','.opus':'audio/opus'
  };
  return store.insert('media', {
    id: randomUUID(), title: safeName, type: audio ? 'audio' : 'video', mimeType: mimeByExtension[ext] || file.mimetype || (audio ? 'audio/mpeg' : 'video/mp4'),
    fileName: finalName, filePath: finalPath, bytes: stat.size, sizeLabel: bytesLabel(stat.size),
    sourceUrl: null, sourceHost: null, duration: Number(probe?.format?.duration) || null, favorite: false, origin: 'upload', createdAt: new Date().toISOString()
  });
}

function runFfprobe(inputPath) {
  return execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,format_name:stream=codec_type,codec_name,disposition', '-of', 'json', inputPath], { timeout: 20000, maxBuffer: 1024 * 1024 })
    .then(({ stdout }) => JSON.parse(stdout));
}

export async function createConversion(file, { format = 'mp3', bitrate = '192k' } = {}) {
  if (!file) throw new Error('Choose a media file first.');
  const ext = path.extname(file.originalname).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    await fsp.rm(file.path, { force: true }).catch(() => {});
    throw new Error('Choose a supported audio or video file.');
  }
  const outputFormat = String(format).toLowerCase();
  if (!['mp3', 'm4a', 'wav'].includes(outputFormat)) {
    await fsp.rm(file.path, { force: true }).catch(() => {});
    throw new Error('Output format must be MP3, M4A, or WAV.');
  }
  const validBitrates = new Set(['96k', '128k', '192k', '256k', '320k']);
  if (!validBitrates.has(bitrate)) bitrate = '192k';
  const job = await store.insert('conversions', {
    id: randomUUID(), title: safeDisplayName(path.basename(file.originalname, ext), 'Audio conversion'),
    inputPath: file.path, inputName: safeDisplayName(file.originalname), inputSize: file.size,
    outputFormat, bitrate, status: 'queued', progress: 0, error: null, mediaId: null,
    startedAt: null, completedAt: null, cancelRequested: false
  });
  conversionQueue.push(job.id);
  void processConversionQueue();
  return job;
}

async function processConversionQueue() {
  if (conversionRunning) return;
  conversionRunning = true;
  try {
    while (conversionQueue.length) {
      const id = conversionQueue.shift();
      try { await runConversion(id); } catch (error) { console.error('[conversion queue]', error.message); }
    }
  } finally {
    conversionRunning = false;
    if (conversionQueue.length) void processConversionQueue();
  }
}

async function runConversion(id) {
  const job = await store.get('conversions', id);
  if (!job || job.status !== 'queued') return;
  let outputPath = null;
  try {
    await store.update('conversions', id, { status: 'processing', startedAt: new Date().toISOString() });
    const probe = await runFfprobe(job.inputPath);
    const audioStream = (probe.streams || []).some((stream) => stream.codec_type === 'audio');
    if (!audioStream) throw new Error('This file does not contain an audio stream to extract.');
    const duration = Number(probe.format?.duration) || 0;
    const outputName = `${safeDisplayName(job.title, 'audio').slice(0, 80)}-${id.slice(0, 8)}.${job.outputFormat}`;
    outputPath = path.join(folder('converted'), outputName);
    await fsMkdir(folder('converted'));
    const args = ['-y', '-i', job.inputPath, '-map', '0:a:0', '-vn'];
    if (job.outputFormat === 'mp3') args.push('-c:a', 'libmp3lame', '-b:a', job.bitrate);
    else if (job.outputFormat === 'm4a') args.push('-c:a', 'aac', '-b:a', job.bitrate, '-movflags', '+faststart');
    else args.push('-c:a', 'pcm_s16le');
    args.push('-progress', 'pipe:1', '-nostats', outputPath);
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    conversionProcesses.set(id, child);
    let stderr = ''; let stdoutBuffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const parts = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = parts.pop() || '';
      for (const line of parts) {
        if (line.startsWith('out_time_ms=') && duration > 0) {
          const us = Number(line.split('=')[1]);
          const progress = Number.isFinite(us) ? Math.min(99, Math.floor(us / (duration * 1_000_000) * 100)) : 0;
          void store.update('conversions', id, { progress });
        }
        if (line === 'progress=end') void store.update('conversions', id, { progress: 99 });
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-5000); });
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    conversionProcesses.delete(id);
    const latest = await store.get('conversions', id);
    if (latest?.cancelRequested) throw Object.assign(new Error('Conversion cancelled.'), { cancelled: true });
    if (exitCode !== 0) throw new Error(stderr.trim().split('\n').slice(-3).join(' ').slice(-600) || 'FFmpeg could not convert this file. Check that FFmpeg is installed and the file is valid.');
    const stat = await fsp.stat(outputPath);
    if (!stat.size) throw new Error('FFmpeg created an empty output file.');
    const mime = job.outputFormat === 'mp3' ? 'audio/mpeg' : job.outputFormat === 'm4a' ? 'audio/mp4' : 'audio/wav';
    const media = await store.insert('media', {
      id: randomUUID(), title: job.title, type: 'audio', mimeType: mime,
      fileName: outputName, filePath: outputPath, bytes: stat.size, sizeLabel: bytesLabel(stat.size),
      sourceUrl: null, sourceHost: null, duration: duration || null, favorite: false,
      origin: 'conversion', createdAt: new Date().toISOString()
    });
    await store.update('conversions', id, { status: 'completed', progress: 100, mediaId: media.id, outputPath, outputName, outputSize: stat.size, completedAt: new Date().toISOString(), error: null });
  } catch (err) {
    const child = conversionProcesses.get(id);
    if (child) { try { child.kill('SIGTERM'); } catch {} }
    conversionProcesses.delete(id);
    if (outputPath) await fsp.rm(outputPath, { force: true }).catch(() => {});
    const latest = await store.get('conversions', id).catch(() => null);
    const cancelled = err.cancelled || latest?.cancelRequested;
    await store.update('conversions', id, { status: cancelled ? 'cancelled' : 'failed', progress: 0, error: cancelled ? null : safeDisplayName(err.message, 'Conversion failed') }).catch(() => {});
  } finally {
    await fsp.rm(job.inputPath, { force: true }).catch(() => {});
  }
}

export async function cancelConversion(id) {
  const job = await store.get('conversions', id);
  if (!job) return null;
  if (['completed', 'failed', 'cancelled'].includes(job.status)) return job;
  await store.update('conversions', id, { cancelRequested: true });
  const child = conversionProcesses.get(id);
  if (child) { try { child.kill('SIGTERM'); } catch {} }
  else {
    const queueIndex = conversionQueue.indexOf(id);
    if (queueIndex >= 0) conversionQueue.splice(queueIndex, 1);
    await fsp.rm(job.inputPath, { force: true }).catch(() => {});
    await store.update('conversions', id, { status: 'cancelled' });
  }
  return store.get('conversions', id);
}

export async function getHealth() {
  let ffmpeg = false;
  try { await execFileAsync('ffmpeg', ['-version'], { timeout: 3000 }); ffmpeg = true; } catch {}
  let ffprobe = false;
  try { await execFileAsync('ffprobe', ['-version'], { timeout: 3000 }); ffprobe = true; } catch {}
  const hosts = (process.env.MEDIA_ALLOWED_HOSTS || '').split(',').map((x) => x.trim()).filter(Boolean);
  return { ok: true, storageDriver: store.driver, ffmpeg, ffprobe, allowedHosts: hosts, downloadsEnabled: hosts.length > 0, maxDownloadBytes: MAX_DOWNLOAD_BYTES, maxUploadBytes: MAX_UPLOAD_BYTES, localSingleUser: true };
}

export async function deleteManagedFile(filePath) {
  if (!filePath) return false;
  const resolved = path.resolve(filePath);
  const roots = ['uploads', 'downloads', 'converted'].map((dir) => `${path.resolve(folder(dir))}${path.sep}`);
  if (!roots.some((root) => resolved.startsWith(root))) throw new Error('Refusing to remove a file outside managed storage.');
  await fsp.rm(resolved, { force: true });
  return true;
}

export { bytesLabel, MAX_DOWNLOAD_BYTES, MAX_UPLOAD_BYTES, SUPPORTED_EXTENSIONS };
