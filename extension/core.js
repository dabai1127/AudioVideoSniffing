(function (root) {
  'use strict';
  const extensions = new Set(['mp3', 'mp4', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'webm', 'flac', 'm3u8', 'mpd']);
  const mimeFormats = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'video/mp4': 'mp4', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'video/ogg': 'ogg', 'audio/opus': 'opus', 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/flac': 'flac', 'application/vnd.apple.mpegurl': 'm3u8', 'application/x-mpegurl': 'm3u8', 'application/dash+xml': 'mpd', 'm4a-opus': 'm4a' };
  function httpUrl(value, base) {
    if (typeof value !== 'string' || value.length > 16000 || !value.trim()) return null;
    try { const u = new URL(value.trim().replace(/&amp;/g, '&'), base); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null; u.hash = ''; return u.href; } catch { return null; }
  }
  function classify(value, mime = '', base) {
    const url = httpUrl(value, base);
    if (!url) return null;
    const u = new URL(url);
    if (/\/api\/forbidden(?:\/|$)/i.test(u.pathname) || /\/sil-\d+\.mp3$/i.test(u.pathname)) return null;
    const m = String(mime).toLowerCase().split(';')[0].trim();
    const match = u.pathname.match(/\.([a-z0-9]+)$/i);
    const byPath = match && extensions.has(match[1].toLowerCase()) ? match[1].toLowerCase() : '';
    const format = mimeFormats[m] || byPath;
    if (!format) return null;
    return {url, format, mime: m, kind: ['m3u8', 'mpd'].includes(format) ? 'stream' : (m.startsWith('video/') || format === 'mp4' ? 'video' : (format === 'webm' && !m.startsWith('audio/') ? 'video' : 'audio'))};
  }
  function songId(pageUrl) {
    try { const u = new URL(pageUrl); return /(^|\.)suno\.com$/i.test(u.hostname) ? u.pathname.match(/^\/song\/([\da-f-]{36})/i)?.[1] || '' : ''; } catch { return ''; }
  }
  function belongsToSong(url, pageUrl) {
    const id = songId(pageUrl);
    if (!id) return true;
    const ids = String(url).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
    return !ids || ids.some(value => value.toLowerCase() === id.toLowerCase());
  }
  function unescapeText(text) {
    let result = String(text).slice(0, 1500000);
    for (let i = 0; i < 3; i++) result = result.replace(/\\u002[fF]/g, '/').replace(/\\u0026/g, '&').replace(/\\u003[dD]/g, '=').replace(/\\u003[aA]/g, ':').replace(/\\\//g, '/').replace(/\\"/g, '"');
    return result;
  }
  function extract(text, context = {}) {
    const body = unescapeText(text);
    const found = new Map();
    const matches = body.matchAll(/https?:\/\/[^\s"'<>\\`]+/gi);
    for (const match of matches) {
      const media = classify(match[0], '', context.pageUrl);
      if (!media || !belongsToSong(media.url, context.pageUrl)) continue;
      found.set(media.url, {...media, source: context.source || '页面数据', title: context.title || ''});
      if (found.size >= 100) break;
    }
    // Typed media_urls entries can expose extensionless files; never infer MP3 from an audio_url key alone.
    for (const match of body.matchAll(/\{[^{}]{0,1200}"url"\s*:\s*"([^"]+)"[^{}]{0,1200}\}/g)) {
      const mime = match[0].match(/"(?:content_type|mime_type|mimeType)"\s*:\s*"([^"]+)"/)?.[1];
      const media = mime && classify(match[1], mime, context.pageUrl);
      if (media && belongsToSong(media.url, context.pageUrl)) found.set(media.url, {...media, source: context.source || '页面数据', title: context.title || ''});
    }
    return [...found.values()];
  }
  function filename(item, title = '') {
    const base = String(item.title || title || 'media').replace(/\s*(?:by .+ )?\| Suno$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 110) || 'media';
    const safe = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base) ? '_' + base : base;
    return `${safe}.${item.format}`;
  }
  function responseSize(headers = []) {
    const h = Object.fromEntries(headers.map(x => [x.name.toLowerCase(), x.value || '']));
    const total = h['content-range']?.match(/\/(\d+)$/)?.[1];
    const n = Number(total || h['content-length']);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  root.MediaCore = {httpUrl, classify, songId, belongsToSong, extract, unescapeText, filename, responseSize};
})(globalThis);
