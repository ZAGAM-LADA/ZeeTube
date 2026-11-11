const API_ROOT = 'https://www.googleapis.com/youtube/v3';
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

export const YOUTUBE_CATEGORIES = [
  { id: 'all', name: 'For you' },
  { id: '10', name: 'Music' },
  { id: '20', name: 'Gaming' },
  { id: '17', name: 'Sports' },
  { id: '28', name: 'Technology' },
  { id: '27', name: 'Education' },
  { id: '24', name: 'Entertainment' },
  { id: '1', name: 'Film & animation' },
];

export function getYouTubeStatus() {
  return {
    enabled: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
    regionCode: (process.env.YOUTUBE_REGION || 'PK').toUpperCase(),
    provider: 'YouTube Data API v3',
    player: 'YouTube IFrame Player',
  };
}

function durationToSeconds(value = '') {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return null;
  return (Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0);
}

function normalizeVideo(item) {
  const snippet = item.snippet || {};
  const thumbnails = snippet.thumbnails || {};
  const thumbnail = thumbnails.maxres?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || '';
  return {
    id: item.id?.videoId || item.id,
    title: snippet.title || 'Untitled video',
    description: snippet.description || '',
    channelTitle: snippet.channelTitle || 'YouTube creator',
    channelId: snippet.channelId || '',
    publishedAt: snippet.publishedAt || null,
    thumbnail,
    durationSeconds: durationToSeconds(item.contentDetails?.duration),
    viewCount: Number(item.statistics?.viewCount || 0),
    likeCount: Number(item.statistics?.likeCount || 0),
    embeddable: item.status?.embeddable !== false,
    source: 'youtube',
  };
}

async function youtubeRequest(resource, params) {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) {
    const error = new Error('YouTube discovery is not configured yet. Add YOUTUBE_API_KEY to the server environment.');
    error.status = 503;
    error.code = 'YOUTUBE_NOT_CONFIGURED';
    throw error;
  }
  const url = new URL(`${API_ROOT}/${resource}`);
  for (const [name, value] of Object.entries({ ...params, key })) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
  }
  const cacheKey = url.toString();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiReason = payload.error?.errors?.[0]?.reason || '';
    let message = payload.error?.message || `YouTube API request failed (${response.status}).`;
    if (apiReason === 'quotaExceeded' || apiReason === 'dailyLimitExceeded') message = 'The YouTube API quota for this Google project has been used. Try again after the quota resets.';
    if (apiReason === 'keyInvalid' || apiReason === 'forbidden') message = 'The YouTube API key is invalid or the YouTube Data API v3 is not enabled for its Google Cloud project.';
    const error = new Error(message);
    error.status = response.status === 403 ? 503 : 502;
    error.code = apiReason || 'YOUTUBE_API_ERROR';
    throw error;
  }
  if (cache.size > 100) {
    const now = Date.now();
    for (const [entryKey, entry] of cache) if (entry.expiresAt <= now) cache.delete(entryKey);
    if (cache.size > 100) cache.clear();
  }
  cache.set(cacheKey, { data: payload, expiresAt: Date.now() + CACHE_TTL_MS });
  return payload;
}

export async function getTrendingVideos(categoryId = '') {
  const validCategory = YOUTUBE_CATEGORIES.some((item) => item.id === String(categoryId)) ? String(categoryId) : '';
  const data = await youtubeRequest('videos', {
    part: 'snippet,contentDetails,statistics,status',
    chart: 'mostPopular',
    regionCode: (process.env.YOUTUBE_REGION || 'PK').toUpperCase(),
    maxResults: 24,
    videoCategoryId: validCategory && validCategory !== 'all' ? validCategory : undefined,
  });
  return (data.items || []).map(normalizeVideo).filter((video) => video.id && video.embeddable);
}

export async function searchYouTubeVideos(query, pageToken = '') {
  const term = String(query || '').trim().slice(0, 100);
  if (term.length < 2) {
    const error = new Error('Enter at least two characters to search YouTube.');
    error.status = 400;
    throw error;
  }
  const data = await youtubeRequest('search', {
    part: 'snippet',
    type: 'video',
    q: term,
    maxResults: 24,
    regionCode: (process.env.YOUTUBE_REGION || 'PK').toUpperCase(),
    relevanceLanguage: 'en',
    safeSearch: 'strict',
    videoEmbeddable: 'true',
    pageToken: /^[\w-]{1,100}$/.test(pageToken) ? pageToken : undefined,
  });
  const ids = (data.items || []).map((item) => item.id?.videoId).filter(Boolean);
  if (!ids.length) return { items: [], nextPageToken: data.nextPageToken || null };
  const details = await youtubeRequest('videos', {
    part: 'snippet,contentDetails,statistics,status',
    id: ids.join(','),
    maxResults: 24,
  });
  const detailMap = new Map((details.items || []).map((item) => [item.id, item]));
  const items = ids.map((id) => detailMap.get(id) || (data.items || []).find((item) => item.id.videoId === id))
    .filter(Boolean).map(normalizeVideo).filter((video) => video.id && video.embeddable);
  return { items, nextPageToken: data.nextPageToken || null };
}

export async function getYouTubeVideo(videoId) {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(String(videoId || ''))) {
    const error = new Error('That YouTube video ID is not valid.');
    error.status = 400;
    throw error;
  }
  const data = await youtubeRequest('videos', {
    part: 'snippet,contentDetails,statistics,status',
    id: videoId,
    maxResults: 1,
  });
  const item = (data.items || [])[0];
  if (!item) {
    const error = new Error('This YouTube video is unavailable or cannot be embedded.');
    error.status = 404;
    throw error;
  }
  const video = normalizeVideo(item);
  if (!video.embeddable) {
    const error = new Error('The creator has disabled embedding for this video. Open it on YouTube instead.');
    error.status = 403;
    throw error;
  }
  return video;
}
