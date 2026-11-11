(() => {
  'use strict';
  if (globalThis.__soundtraceContent) return;
  globalThis.__soundtraceContent = true;
  const C = globalThis.MediaCore;
  const sent = new Set();
  let pending = [], flushTimer, scanTimer, lastHref = location.href;
  const context = source => ({pageUrl: location.href, title: document.title, source});
  function add(item) {
    const media = C.classify(item.url, item.mime, location.href);
    if (!media) return;
    if (!C.belongsToSong(media.url, location.href)) return;
    const key = `${media.url}|${item.source}`;
    if (sent.has(key) || sent.size >= 1500) return;
    sent.add(key);
    pending.push({...media, source: item.source, title: item.title || document.title});
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 120);
  }
  function flush() {
    const items = pending.splice(0, 100);
    if (!items.length) return;
    try { chrome.runtime.sendMessage({type: 'MEDIA_FOUND', pageUrl: location.href, items}).catch(() => {}); } catch {}
    if (pending.length) flushTimer = setTimeout(flush, 120);
  }
  function scan(force = false) {
    if (lastHref !== location.href) { sent.clear(); pending = []; lastHref = location.href; }
    if (force) sent.clear();
    document.querySelectorAll('audio,video,source').forEach(el => {
      const mime = el.getAttribute('type') || '';
      for (const url of [el.currentSrc, el.getAttribute('src')]) if (url) add({url, mime, source: '播放器'});
    });
    document.querySelectorAll('meta[property^="og:audio"],meta[property^="og:video"],meta[itemprop="contentUrl"],a[href],link[rel="preload"]').forEach(el => {
      const url = el.getAttribute('content') || el.getAttribute('href');
      if (url) add({url, mime: el.getAttribute('type') || '', source: '页面元数据'});
    });
    document.querySelectorAll('script:not([src])').forEach(el => {
      const text = el.textContent || '';
      if (text.length && text.length <= 1500000 && /audio_url|audioUrl|media_urls|contentUrl|\.(mp3|mp4|m4a|m3u8|mpd)/i.test(text)) C.extract(text, context('页面数据')).forEach(add);
    });
    performance.getEntriesByType('resource').forEach(e => add({url: e.name, source: '资源时序'}));
  }
  function schedule() { clearTimeout(scanTimer); scanTimer = setTimeout(() => scan(), 350); }
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.channel !== 'soundtrace:v1' || !Array.isArray(event.data.items)) return;
    event.data.items.slice(0,100).forEach(x => { if (x && typeof x.url === 'string') add({url:x.url,mime:typeof x.mime === 'string' ? x.mime : '',source:'接口数据'}); });
  });
  try { new PerformanceObserver(list => list.getEntries().forEach(e => add({url:e.name,source:'资源时序'}))).observe({type:'resource',buffered:true}); } catch {}
  new MutationObserver(schedule).observe(document, {subtree:true,childList:true,attributes:true,attributeFilter:['src','href','content']});
  document.addEventListener('loadedmetadata', schedule, true);
  document.addEventListener('play', schedule, true);
  window.addEventListener('popstate', schedule);
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === 'RESCAN') { scan(true); flush(); reply({ok:true}); }
  });
  document.addEventListener('DOMContentLoaded', schedule, {once:true});
  scan();
})();
