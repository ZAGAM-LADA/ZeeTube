import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { store } from './store.js';
import { configuredAllowedHosts, safeDisplayName } from './security.js';
import { getYouTubeStatus, YOUTUBE_CATEGORIES, getTrendingVideos, searchYouTubeVideos, getYouTubeVideo } from './youtube-service.js';
import {
  inspectRemoteMedia, createDownload, cancelDownload, retryDownload,
  uploadToLibrary, createConversion, cancelConversion, getHealth,
  deleteManagedFile, MAX_UPLOAD_BYTES, SUPPORTED_EXTENSIONS
} from './media-service.js';

const app = express();
const PORT = Math.max(1, Number(process.env.PORT || 5050));
const HOST = process.env.HOST || '127.0.0.1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client-dist');

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
const allowedOrigins = new Set((process.env.CORS_ORIGIN || `http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:${PORT},http://localhost:${PORT}`).split(',').map((x) => x.trim()).filter(Boolean));
const isAllowedOrigin = (origin) => !origin || allowedOrigins.has(origin) || (
  process.env.CODESPACES === 'true' && origin.startsWith('https://') && origin.endsWith('.app.github.dev')
);
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: 'Cross-origin requests are not allowed by this local single-user build.' });
  next();
});
app.use(cors({ origin: (origin, callback) => callback(null, isAllowedOrigin(origin)), credentials: false }));
app.use(express.json({ limit: '2mb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests. Please try again shortly.' } }));

const upload = multer({
  dest: path.join(store.dataDir, 'uploads'),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) return callback(new Error('Unsupported file extension. Use common audio/video formats such as MP4, WebM, MP3, M4A, WAV, or MOV.'));
    callback(null, true);
  }
});

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const errorMessage = (message, status = 400) => Object.assign(new Error(message), { status });

function publicMedia(item) {
  if (!item) return null;
  const { filePath, ...rest } = item;
  return { ...rest, streamUrl: `/api/media/${item.id}/stream`, downloadUrl: `/api/media/${item.id}/download` };
}
function publicDownload(item) {
  if (!item) return null;
  const { filePath, cancelRequested, ...rest } = item;
  return { ...rest, ...(item.status === 'completed' && item.mediaId ? { downloadUrl: `/api/media/${item.mediaId}/download`, streamUrl: `/api/media/${item.mediaId}/stream` } : {}) };
}
function publicConversion(item) {
  if (!item) return null;
  const { inputPath, outputPath, cancelRequested, ...rest } = item;
  return { ...rest, ...(item.status === 'completed' && item.mediaId ? { downloadUrl: `/api/media/${item.mediaId}/download` } : {}) };
}
function safeMediaPath(item) {
  if (!item?.filePath) return null;
  const resolved = path.resolve(item.filePath);
  const roots = ['uploads', 'downloads', 'converted'].map((dir) => `${path.resolve(store.dataDir, dir)}${path.sep}`);
  return roots.some((root) => resolved.startsWith(root)) ? resolved : null;
}
function mimeFallback(item) {
  return item.mimeType || (item.type === 'audio' ? 'audio/mpeg' : 'video/mp4');
}

app.get('/api/health', asyncRoute(async (_req, res) => res.json(await getHealth())));

app.get('/api/sources', (_req, res) => {
  res.json({
    sources: [
      { id: 'local-files', name: 'Local media files', kind: 'upload', enabled: true, details: 'Import media you own or are authorized to use. Files are stored in this app’s managed local storage.' },
      { id: 'direct-media', name: 'Direct media-file URLs', kind: 'url', enabled: configuredAllowedHosts().length > 0, hosts: configuredAllowedHosts(), details: 'Only direct audio/video file URLs from hosts you explicitly allow in MEDIA_ALLOWED_HOSTS. Web pages and streaming manifests are not accepted.' },
      { id: 'official-api', name: 'YouTube discovery', kind: 'api', enabled: getYouTubeStatus().enabled, details: 'Search public videos and discover regional trends through the official YouTube Data API. Playback uses the official embedded player; video downloads are not offered.' }
    ]
  });
});

app.get('/api/catalog/config', (_req, res) => res.json({ ...getYouTubeStatus(), categories: YOUTUBE_CATEGORIES }));
app.get('/api/catalog/trending', asyncRoute(async (req, res) => {
  const categoryId = String(req.query.categoryId || 'all').slice(0, 12);
  if (!getYouTubeStatus().enabled) return res.json({ configured: false, items: [], regionCode: getYouTubeStatus().regionCode, message: 'Add YOUTUBE_API_KEY to the server environment to enable live YouTube discovery.' });
  const items = await getTrendingVideos(categoryId);
  res.setHeader('Cache-Control', 'public, max-age=180');
  res.json({ configured: true, items, regionCode: getYouTubeStatus().regionCode, categories: YOUTUBE_CATEGORIES });
}));
app.get('/api/catalog/search', asyncRoute(async (req, res) => {
  const query = String(req.query.q || '').trim();
  const result = await searchYouTubeVideos(query, String(req.query.pageToken || ''));
  res.setHeader('Cache-Control', 'private, max-age=180');
  res.json({ configured: true, ...result, regionCode: getYouTubeStatus().regionCode });
}));
app.get('/api/catalog/videos/:id', asyncRoute(async (req, res) => {
  const video = await getYouTubeVideo(req.params.id);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ video });
}));

app.get('/api/search', asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 140);
  const type = ['video', 'audio'].includes(req.query.type) ? req.query.type : null;
  let items = await store.list('media');
  if (q) items = items.filter((m) => `${m.title || ''} ${m.sourceHost || ''} ${m.fileName || ''}`.toLowerCase().includes(q));
  if (type) items = items.filter((m) => m.type === type);
  res.json({ items: items.slice(0, 100).map(publicMedia), total: items.length, scope: 'library', message: 'This endpoint searches only your personal ZeeTube library.' });
}));

app.post('/api/media/inspect', asyncRoute(async (req, res) => {
  const parsed = z.object({ url: z.string().url().max(2048) }).safeParse(req.body);
  if (!parsed.success) throw errorMessage('Provide a valid media URL.');
  res.json({ media: await inspectRemoteMedia(parsed.data.url) });
}));

app.post('/api/downloads', asyncRoute(async (req, res) => {
  const parsed = z.object({ url: z.string().url().max(2048), title: z.string().max(140).optional(), extension: z.string().max(10).optional() }).safeParse(req.body);
  if (!parsed.success) throw errorMessage('A valid media URL is required.');
  const job = await createDownload(parsed.data);
  res.status(202).json({ download: publicDownload(job), message: 'Download job queued.' });
}));

app.get('/api/downloads', asyncRoute(async (_req, res) => {
  const jobs = await store.list('downloads');
  res.json({ downloads: jobs.map(publicDownload) });
}));
app.get('/api/downloads/:id', asyncRoute(async (req, res) => {
  const job = await store.get('downloads', req.params.id);
  if (!job) throw errorMessage('Download not found.', 404);
  res.json({ download: publicDownload(job) });
}));
app.post('/api/downloads/:id/cancel', asyncRoute(async (req, res) => {
  const job = await cancelDownload(req.params.id);
  if (!job) throw errorMessage('Download not found.', 404);
  res.json({ download: publicDownload(job) });
}));
app.post('/api/downloads/:id/retry', asyncRoute(async (req, res) => {
  const job = await retryDownload(req.params.id);
  if (!job) throw errorMessage('Download not found.', 404);
  res.status(202).json({ download: publicDownload(job), message: 'A new download attempt was queued.' });
}));
app.delete('/api/downloads/:id', asyncRoute(async (req, res) => {
  const job = await store.get('downloads', req.params.id);
  if (!job) throw errorMessage('Download not found.', 404);
  if (['queued', 'downloading'].includes(job.status)) throw errorMessage('Cancel an active download before deleting its record.', 409);
  if (job.mediaId) {
    const media = await store.get('media', job.mediaId);
    if (media) {
      const filePath = safeMediaPath(media);
      if (filePath) await deleteManagedFile(filePath);
      await store.remove('media', media.id);
      for (const playlist of await store.list('playlists')) {
        if ((playlist.mediaIds || []).includes(media.id)) await store.update('playlists', playlist.id, { mediaIds: playlist.mediaIds.filter((id) => id !== media.id) });
      }
      for (const entry of await store.list('history')) if (entry.mediaId === media.id) await store.remove('history', entry.id);
    }
  }
  await store.remove('downloads', job.id);
  res.json({ ok: true, deletedId: job.id });
}));

app.get('/api/library', asyncRoute(async (req, res) => {
  const type = ['video', 'audio'].includes(req.query.type) ? req.query.type : null;
  const favorite = req.query.favorite === 'true';
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 140);
  const sort = String(req.query.sort || 'newest');
  let items = await store.list('media');
  if (type) items = items.filter((m) => m.type === type);
  if (favorite) items = items.filter((m) => Boolean(m.favorite));
  if (q) items = items.filter((m) => `${m.title || ''} ${m.fileName || ''}`.toLowerCase().includes(q));
  if (sort === 'title') items.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  if (sort === 'size') items.sort((a, b) => Number(b.bytes || 0) - Number(a.bytes || 0));
  if (sort === 'oldest') items.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  res.json({ items: items.map(publicMedia), total: items.length });
}));

app.post('/api/library/upload', upload.single('media'), asyncRoute(async (req, res) => {
  if (!req.file) throw errorMessage('Choose a media file to upload.');
  const item = await uploadToLibrary(req.file);
  res.status(201).json({ media: publicMedia(item), message: 'Media added to your library.' });
}));
app.patch('/api/library/:id', asyncRoute(async (req, res) => {
  const parsed = z.object({ favorite: z.boolean().optional(), title: z.string().min(1).max(140).optional() }).safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data || {}).length === 0) throw errorMessage('Provide a valid title or favorite value.');
  const patch = { ...parsed.data };
  if (patch.title) patch.title = safeDisplayName(patch.title);
  const item = await store.update('media', req.params.id, patch);
  if (!item) throw errorMessage('Media item not found.', 404);
  res.json({ media: publicMedia(item) });
}));
app.delete('/api/library/:id', asyncRoute(async (req, res) => {
  const item = await store.get('media', req.params.id);
  if (!item) throw errorMessage('Media item not found.', 404);
  const filePath = safeMediaPath(item);
  if (filePath) await deleteManagedFile(filePath);
  await store.remove('media', item.id);
  for (const playlist of await store.list('playlists')) {
    if ((playlist.mediaIds || []).includes(item.id)) await store.update('playlists', playlist.id, { mediaIds: playlist.mediaIds.filter((id) => id !== item.id) });
  }
  for (const job of await store.list('downloads')) if (job.mediaId === item.id) await store.remove('downloads', job.id);
  for (const entry of await store.list('history')) if (entry.mediaId === item.id) await store.remove('history', entry.id);
  res.json({ ok: true, deletedId: item.id });
}));

async function serveMedia(req, res, asDownload) {
  const item = await store.get('media', req.params.id);
  if (!item) throw errorMessage('Media item not found.', 404);
  const filePath = safeMediaPath(item);
  if (!filePath || !fs.existsSync(filePath)) throw errorMessage('The file is missing from storage. Remove this entry or re-import the media.', 404);
  const stat = await fsp.stat(filePath);
  const filename = safeDisplayName(item.fileName || `${item.title}.${item.type === 'audio' ? 'mp3' : 'mp4'}`);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', mimeFallback(item));
  if (asDownload) {
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', String(stat.size));
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => { if (!res.headersSent) res.status(404); res.destroy(); });
    stream.pipe(res);
    return;
  }
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) { res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end(); return; }
    const suffixLength = !match[1] && match[2] ? Number(match[2]) : null;
    const start = suffixLength !== null ? Math.max(0, stat.size - suffixLength) : (match[1] ? Number(match[1]) : 0);
    const end = suffixLength !== null ? stat.size - 1 : (match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1);
    if (start > end || start >= stat.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) { res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end(); return; }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', String(end - start + 1));
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', () => { if (!res.headersSent) res.status(404); res.destroy(); });
    stream.pipe(res);
  } else {
    res.setHeader('Content-Length', String(stat.size));
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => { if (!res.headersSent) res.status(404); res.destroy(); });
    stream.pipe(res);
  }
}
app.get('/api/media/:id/stream', asyncRoute(async (req, res) => serveMedia(req, res, false)));
app.get('/api/media/:id/download', asyncRoute(async (req, res) => serveMedia(req, res, true)));

app.get('/api/convert', asyncRoute(async (_req, res) => res.json({ conversions: (await store.list('conversions')).map(publicConversion) })));
app.post('/api/convert', upload.single('media'), asyncRoute(async (req, res) => {
  if (!req.file) throw errorMessage('Choose a media file first.');
  const format = String(req.body.format || 'mp3').toLowerCase();
  const bitrate = String(req.body.bitrate || '192k');
  const job = await createConversion(req.file, { format, bitrate });
  res.status(202).json({ conversion: publicConversion(job), message: 'Audio extraction job queued.' });
}));
app.get('/api/convert/:id', asyncRoute(async (req, res) => {
  const job = await store.get('conversions', req.params.id);
  if (!job) throw errorMessage('Conversion job not found.', 404);
  res.json({ conversion: publicConversion(job) });
}));
app.post('/api/convert/:id/cancel', asyncRoute(async (req, res) => {
  const job = await cancelConversion(req.params.id);
  if (!job) throw errorMessage('Conversion job not found.', 404);
  res.json({ conversion: publicConversion(job) });
}));

app.get('/api/playlists', asyncRoute(async (_req, res) => {
  const playlists = await store.list('playlists');
  const media = await store.list('media');
  res.json({ playlists: playlists.map((pl) => ({ ...pl, items: (pl.mediaIds || []).map((id) => media.find((m) => m.id === id)).filter(Boolean).map(publicMedia) })) });
}));
app.post('/api/playlists', asyncRoute(async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(80), description: z.string().max(300).optional() }).safeParse(req.body);
  if (!parsed.success) throw errorMessage('Playlist title is required (maximum 80 characters).');
  const playlist = await store.insert('playlists', { id: randomUUID(), title: safeDisplayName(parsed.data.title, 'New playlist'), description: parsed.data.description || '', mediaIds: [] });
  res.status(201).json({ playlist: { ...playlist, items: [] } });
}));
app.patch('/api/playlists/:id', asyncRoute(async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(80).optional(), description: z.string().max(300).optional() }).safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) throw errorMessage('Provide a valid playlist title or description.');
  if (parsed.data.title) parsed.data.title = safeDisplayName(parsed.data.title);
  const playlist = await store.update('playlists', req.params.id, parsed.data);
  if (!playlist) throw errorMessage('Playlist not found.', 404);
  res.json({ playlist });
}));
app.post('/api/playlists/:id/items', asyncRoute(async (req, res) => {
  const parsed = z.object({ mediaId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) throw errorMessage('Media ID is required.');
  const playlist = await store.get('playlists', req.params.id);
  if (!playlist) throw errorMessage('Playlist not found.', 404);
  if (!await store.get('media', parsed.data.mediaId)) throw errorMessage('Media item not found.', 404);
  const ids = playlist.mediaIds || [];
  if (!ids.includes(parsed.data.mediaId)) await store.update('playlists', playlist.id, { mediaIds: [...ids, parsed.data.mediaId] });
  res.json({ ok: true });
}));
app.delete('/api/playlists/:id/items/:mediaId', asyncRoute(async (req, res) => {
  const playlist = await store.get('playlists', req.params.id);
  if (!playlist) throw errorMessage('Playlist not found.', 404);
  await store.update('playlists', playlist.id, { mediaIds: (playlist.mediaIds || []).filter((id) => id !== req.params.mediaId) });
  res.json({ ok: true });
}));
app.delete('/api/playlists/:id', asyncRoute(async (req, res) => {
  const removed = await store.remove('playlists', req.params.id);
  if (!removed) throw errorMessage('Playlist not found.', 404);
  res.json({ ok: true });
}));

app.get('/api/history', asyncRoute(async (_req, res) => res.json({ history: await store.list('history') })));
app.post('/api/history', asyncRoute(async (req, res) => {
  const parsed = z.object({ mediaId: z.string().min(1), positionSeconds: z.number().min(0).max(60 * 60 * 24).optional(), durationSeconds: z.number().min(0).max(60 * 60 * 24).optional() }).safeParse(req.body);
  if (!parsed.success) throw errorMessage('A media ID and valid playback position are required.');
  const media = await store.get('media', parsed.data.mediaId);
  if (!media) throw errorMessage('Media item not found.', 404);
  const existing = (await store.list('history')).find((h) => h.mediaId === media.id);
  const entry = existing
    ? await store.update('history', existing.id, { title: media.title, positionSeconds: parsed.data.positionSeconds || 0, durationSeconds: parsed.data.durationSeconds || media.duration || null, watchedAt: new Date().toISOString() })
    : await store.insert('history', { id: randomUUID(), mediaId: media.id, title: media.title, positionSeconds: parsed.data.positionSeconds || 0, durationSeconds: parsed.data.durationSeconds || media.duration || null, watchedAt: new Date().toISOString() });
  res.json({ history: entry });
}));
app.delete('/api/history', asyncRoute(async (_req, res) => {
  for (const item of await store.list('history')) await store.remove('history', item.id);
  res.json({ ok: true });
}));

app.get('/api/settings', asyncRoute(async (_req, res) => res.json({ settings: await store.getSettings() })));
app.patch('/api/settings', asyncRoute(async (req, res) => {
  const parsed = z.object({
    theme: z.enum(['dark', 'light']).optional(),
    defaultFormat: z.enum(['mp4', 'webm', 'mp3', 'm4a', 'wav']).optional(),
    defaultQuality: z.enum(['source', '1080p', '720p', '480p', '360p']).optional(),
    concurrency: z.number().int().min(1).max(4).optional()
  }).safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data || {}).length) throw errorMessage('No valid settings were provided.');
  res.json({ settings: await store.updateSettings(parsed.data) });
}));

if (process.env.NODE_ENV === 'production' && fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const code = err.code === 'LIMIT_FILE_SIZE' ? 413 : Number(err.status) || 400;
  const message = err.code === 'LIMIT_FILE_SIZE'
    ? `File exceeds the configured ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB upload limit.`
    : (err.message || 'Unexpected server error.');
  if (process.env.NODE_ENV !== 'test') console.error(`[API] ${code}: ${message}`);
  res.status(code).json({ error: message });
});

await store.init();
const server = app.listen(PORT, HOST, () => {
  console.log(`ZeeTube API: http://${HOST}:${PORT}`);
  console.log(`Storage driver: ${store.driver}`);
  if (!configuredAllowedHosts().length) console.log('Remote downloads disabled until MEDIA_ALLOWED_HOSTS is configured. Local uploads and library features remain available.');
});

const shutdown = async () => {
  server.close(async () => { await store.close().catch(() => {}); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
