(() => {
  'use strict';
  if (window.__soundtraceHook) return;
  Object.defineProperty(window, '__soundtraceHook', {value:true});
  const LIMIT = 1048576;
  function emit(items) { if (items.length) window.postMessage({channel:'soundtrace:v1',items:items.slice(0,100)}, '*'); }
  function scanText(text) {
    if (typeof text !== 'string' || text.length > LIMIT) return;
    for (let i=0;i<3;i++) text=text.replace(/\\u002[fF]/g,'/').replace(/\\u0026/g,'&').replace(/\\\//g,'/').replace(/\\"/g,'"');
    const items=[];
    for (const m of text.matchAll(/https?:\/\/[^\s"'<>\\`]+/gi)) {
      if (/\.(mp3|mp4|m4a|aac|wav|ogg|opus|webm|flac|m3u8|mpd)(?:[?#]|$)/i.test(m[0])) items.push({url:m[0]});
      if(items.length>=100) break;
    }
    for (const m of text.matchAll(/\{[^{}]{0,1200}"url"\s*:\s*"([^"]+)"[^{}]{0,1200}\}/g)) {
      const mime=m[0].match(/"(?:content_type|mime_type|mimeType)"\s*:\s*"([^"]+)"/)?.[1];
      if (mime && /^(?:audio\/|video\/|m4a-opus$)/i.test(mime)) items.push({url:m[1],mime});
    }
    emit(items);
  }
  async function inspect(response) {
    const mime=response.headers.get('content-type')||'';
    if (/^(audio|video)\//i.test(mime)) emit([{url:response.url,mime}]);
    if (!/json/i.test(mime) || Number(response.headers.get('content-length'))>LIMIT) return;
    const clone=response.clone();
    const reader=clone.body?.getReader();
    if (!reader) return;
    const chunks=[]; let size=0;
    try {
      while(true) { const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT){void reader.cancel().catch(()=>{});return;}chunks.push(value); }
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      scanText(new TextDecoder().decode(bytes));
    } catch {}
  }
  const nativeFetch=window.fetch;
  window.fetch=function(...args) { const promise=Reflect.apply(nativeFetch,this,args);promise.then(r=>{void inspect(r).catch(()=>{});},()=>{});return promise; };
  const nativeOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(...args) {
    this.addEventListener('load',()=>{
      try { if(this.responseType==='json')scanText(JSON.stringify(this.response));else if((!this.responseType||this.responseType==='text')&&/json/i.test(this.getResponseHeader('content-type')||''))scanText(this.responseText); }catch{}
    },{once:true});
    return Reflect.apply(nativeOpen,this,args);
  };
})();
