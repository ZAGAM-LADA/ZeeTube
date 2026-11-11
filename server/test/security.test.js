import test from 'node:test';
import assert from 'node:assert/strict';
import { hostMatchesAllowlist, isPrivateIP, safeDisplayName, validateMediaUrl } from '../src/security.js';

test('blocks common private and reserved IPv4 ranges', () => {
  for (const ip of ['127.0.0.1', '10.2.3.4', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.3.2', '100.64.0.2', '224.0.0.1', '203.0.113.1']) {
    assert.equal(isPrivateIP(ip), true, `${ip} should be blocked`);
  }
});

test('allows ordinary public IPv4 and rejects private or documentation IPv6 ranges', () => {
  assert.equal(isPrivateIP('1.1.1.1'), false);
  assert.equal(isPrivateIP('8.8.8.8'), false);
  assert.equal(isPrivateIP('::1'), true);
  assert.equal(isPrivateIP('fd00::1'), true);
  assert.equal(isPrivateIP('fe80::1'), true);
  assert.equal(isPrivateIP('2001:db8::1'), true);
});

test('supports exact-host allowlists and explicit wildcard subdomains', () => {
  assert.equal(hostMatchesAllowlist('cdn.example.com', ['cdn.example.com']), true);
  assert.equal(hostMatchesAllowlist('other.example.com', ['cdn.example.com']), false);
  assert.equal(hostMatchesAllowlist('video.example.com', ['*.example.com']), true);
  assert.equal(hostMatchesAllowlist('example.com', ['*.example.com']), false);
});

test('validates protocols, credentials, local destinations, and exact host authorization', async () => {
  const originalHosts = process.env.MEDIA_ALLOWED_HOSTS;
  const originalHttp = process.env.MEDIA_ALLOW_HTTP;
  process.env.MEDIA_ALLOWED_HOSTS = 'media.example.com';
  process.env.MEDIA_ALLOW_HTTP = 'false';
  try {
    await assert.rejects(validateMediaUrl('javascript:alert(1)', { resolveDns: false }), /HTTP and HTTPS/);
    await assert.rejects(validateMediaUrl('https://user:pass@media.example.com/a.mp4', { resolveDns: false }), /credentials/);
    await assert.rejects(validateMediaUrl('http://media.example.com/a.mp4', { resolveDns: false }), /HTTP URLs are disabled/);
    await assert.rejects(validateMediaUrl('https://127.0.0.1/a.mp4', { resolveDns: false }), /not enabled|Private or reserved/);
    await assert.rejects(validateMediaUrl('https://localhost/a.mp4', { resolveDns: false }), /Localhost/);
    await assert.rejects(validateMediaUrl('https://other.example.com/a.mp4', { resolveDns: false }), /not enabled/);
    const accepted = await validateMediaUrl('https://media.example.com/path/movie.mp4#fragment', { resolveDns: false });
    assert.equal(accepted.hostname, 'media.example.com');
    assert.equal(accepted.hash, '');
  } finally {
    if (originalHosts === undefined) delete process.env.MEDIA_ALLOWED_HOSTS; else process.env.MEDIA_ALLOWED_HOSTS = originalHosts;
    if (originalHttp === undefined) delete process.env.MEDIA_ALLOW_HTTP; else process.env.MEDIA_ALLOW_HTTP = originalHttp;
  }
});

test('cleans file names for safe display and downloads', () => {
  assert.equal(safeDisplayName('../some\\bad:name.mp4'), '--some-bad-name.mp4');
  assert.equal(safeDisplayName('', 'safe-fallback'), 'safe-fallback');
});
