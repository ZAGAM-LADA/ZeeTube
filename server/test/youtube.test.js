import test from 'node:test';
import assert from 'node:assert/strict';
import { getYouTubeStatus, getTrendingVideos, searchYouTubeVideos, getYouTubeVideo } from '../src/youtube-service.js';

const originalKey = process.env.YOUTUBE_API_KEY;

test('YouTube discovery reports an unconfigured server without exposing a key', () => {
  process.env.YOUTUBE_API_KEY = '';
  const status = getYouTubeStatus();
  assert.equal(status.enabled, false);
  assert.equal(status.regionCode, 'PK');
  assert.equal('key' in status, false);
});

test('trending endpoint service explains missing API configuration', async () => {
  process.env.YOUTUBE_API_KEY = '';
  await assert.rejects(getTrendingVideos('all'), { code: 'YOUTUBE_NOT_CONFIGURED', status: 503 });
});

test('YouTube search rejects too-short queries before making a network request', async () => {
  process.env.YOUTUBE_API_KEY = '';
  await assert.rejects(searchYouTubeVideos('a'), { status: 400 });
});

test('YouTube video lookup validates IDs before making a network request', async () => {
  process.env.YOUTUBE_API_KEY = '';
  await assert.rejects(getYouTubeVideo('not-a-video-id'), { status: 400 });
});

test.after(() => {
  if (originalKey === undefined) delete process.env.YOUTUBE_API_KEY;
  else process.env.YOUTUBE_API_KEY = originalKey;
});

test('search requests strict-safe, embeddable Pakistan results and enriches video cards', async (t) => {
  process.env.YOUTUBE_API_KEY = 'test-server-only-key';
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requested.push(url);
    if (url.pathname.endsWith('/search')) {
      return new Response(JSON.stringify({
        nextPageToken: 'next_page_token',
        items: [{ id: { videoId: 'abcdefghijk' }, snippet: { title: 'JavaScript basics', channelTitle: 'Example channel' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      items: [{ id: 'abcdefghijk', snippet: { title: 'JavaScript basics', channelTitle: 'Example channel', thumbnails: { high: { url: 'https://i.ytimg.com/example.jpg' } } }, contentDetails: { duration: 'PT2M5S' }, statistics: { viewCount: '1200' }, status: { embeddable: true } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const result = await searchYouTubeVideos(`zeetube-unit-${Date.now()}`);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, 'abcdefghijk');
  assert.equal(result.items[0].durationSeconds, 125);
  assert.equal(result.items[0].viewCount, 1200);
  assert.equal(result.nextPageToken, 'next_page_token');
  assert.equal(requested.length, 2);
  assert.equal(requested[0].searchParams.get('regionCode'), 'PK');
  assert.equal(requested[0].searchParams.get('safeSearch'), 'strict');
  assert.equal(requested[0].searchParams.get('videoEmbeddable'), 'true');
  assert.equal(requested[0].searchParams.has('key'), true);
  assert.equal(requested[0].searchParams.get('key'), 'test-server-only-key');
});
