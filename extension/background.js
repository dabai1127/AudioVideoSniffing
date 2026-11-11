'use strict';
importScripts('core.js');
const C = globalThis.MediaCore;
const queues = new Map();
const keyFor = id => `tab:${id}`;
function serial(tabId, task) {
  const next = (queues.get(tabId) || Promise.resolve()).catch(() => {}).then(task);
  queues.set(tabId, next);
  next.finally(() => {if (queues.get(tabId) === next) queues.delete(tabId);}).catch(() => {});
  return next;
}
async function read(tabId) { return (await chrome.storage.session.get(keyFor(tabId)))[keyFor(tabId)] || {pageUrl:'',items:[]}; }
async function save(tabId, state) {
  await chrome.storage.session.set({[keyFor(tabId)]:state});
  await Promise.allSettled([chrome.action.setBadgeBackgroundColor({tabId,color:'#B9F86A'}),chrome.action.setBadgeTextColor({tabId,color:'#17221A'}),chrome.action.setBadgeText({tabId,text:state.items.length?String(state.items.length):''})]);
}
async function add(tabId, items, pageUrl = '') {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  return serial(tabId, async () => {
    let state = await read(tabId);
    if (pageUrl && state.pageUrl && state.pageUrl !== pageUrl) {
      // Ignore late events from a document that has already navigated away.
      const current = await chrome.tabs.get(tabId).catch(()=>null);
      if (current?.url !== pageUrl) return;
      state = {pageUrl,items:[]};
    }
    state.pageUrl ||= pageUrl;
    for (const item of items.slice(0,100)) {
      const media=C.classify(item.url,item.mime,state.pageUrl || undefined);
      if(!media || !C.belongsToSong(media.url,state.pageUrl))continue;
      let entry=state.items.find(x=>x.url===media.url);
      if(!entry) {entry={...media,title:'',sources:[],firstSeen:Date.now(),verified:false};state.items.push(entry);}
      if (item.mime || !entry.mime) Object.assign(entry,media);
      if(typeof item.title==='string' && item.title.trim())entry.title=item.title.slice(0,250);
      const source=String(item.source||'网络请求').slice(0,40);
      if(!entry.sources.includes(source))entry.sources.push(source);
      if(item.verified)entry.verified=true;
      if(item.size>0)entry.size=item.size;
      entry.lastSeen=Date.now();
    }
    state.items=state.items.slice(-200);
    await save(tabId,state);
  });
}
chrome.webRequest.onBeforeRequest.addListener(details=>{
  if(details.tabId<0)return;
  if(details.type==='main_frame') {
    void serial(details.tabId,()=>save(details.tabId,{pageUrl:details.url,items:[]})).catch(()=>{});
  }
},{urls:['http://*/*','https://*/*'],types:['main_frame']});
chrome.webRequest.onHeadersReceived.addListener(details=>{
  if(details.tabId<0 || ![200,206].includes(details.statusCode))return;
  const headers=details.responseHeaders||[];
  const mime=headers.find(h=>h.name.toLowerCase()==='content-type')?.value||'';
  if(/^(?:text\/|application\/(?:json|problem\+json))/i.test(mime))return;
  const media=C.classify(details.url,mime);
  if(media)void add(details.tabId,[{...media,source:'网络响应',verified:true,size:C.responseSize(headers)}]).catch(()=>{});
},{urls:['http://*/*','https://*/*']},['responseHeaders']);
chrome.tabs.onUpdated.addListener((tabId,change)=>{
  if(!change.url)return;
  void serial(tabId,async()=>{const state=await read(tabId);if(state.pageUrl!==change.url)await save(tabId,{pageUrl:change.url,items:[]});}).catch(()=>{});
});
chrome.tabs.onRemoved.addListener(tabId=>{void serial(tabId,()=>chrome.storage.session.remove(keyFor(tabId))).catch(()=>{});});
async function handle(message,sender) {
  if(message?.type==='MEDIA_FOUND') {
    if(!sender.tab || !Array.isArray(message.items))throw Error('无效的页面消息');
    // An iframe cannot replace the top-level page URL.
    await add(sender.tab.id,message.items.map(x=>({url:x.url,mime:x.mime,title:x.title,source:x.source})),sender.frameId===0?sender.url:sender.tab.url);
    return {ok:true};
  }
  // UI actions are only accepted from this extension's own pages.
  if(sender.tab || !sender.url?.startsWith(chrome.runtime.getURL('')))throw Error('不允许此消息来源');
  const tabId=message?.tabId;
  if(!Number.isInteger(tabId)||tabId<0)throw Error('没有可操作的标签页');
  if(message.type==='GET_MEDIA') {
    await (queues.get(tabId)||Promise.resolve()).catch(()=>{});
    return {ok:true,...await read(tabId)};
  }
  if(message.type==='CLEAR') {await serial(tabId,async()=>{const s=await read(tabId);await save(tabId,{pageUrl:s.pageUrl,items:[]});});return {ok:true};}
  if(message.type==='RESCAN') {
    try {await chrome.tabs.sendMessage(tabId,{type:'RESCAN'});} catch {
      await chrome.scripting.executeScript({target:{tabId,allFrames:true},files:['core.js','content.js']});
    }
    return {ok:true};
  }
  if(message.type==='DOWNLOAD') {
    const state=await read(tabId);
    const item=state.items.find(x=>x.url===message.url);
    if(!item || !C.httpUrl(item.url))throw Error('该媒体已失效，请重新扫描');
    if(item.kind==='stream')throw Error('检测到分段流；当前版本只保存完整音视频文件');
    const downloadId=await chrome.downloads.download({url:item.url,filename:C.filename(item,message.title),saveAs:true,conflictAction:'uniquify'});
    await chrome.storage.session.set({[`download:${downloadId}`]:{tabId,url:item.url}});
    await serial(tabId,async()=>{const s=await read(tabId);const e=s.items.find(x=>x.url===item.url);if(e)e.download={id:downloadId,state:'in_progress'};await save(tabId,s);});
    return {ok:true,downloadId};
  }
  throw Error('未知操作');
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{handle(message,sender).then(reply,error=>reply({ok:false,error:error.message}));return true;});
chrome.downloads.onChanged.addListener(delta=>{
  if(!delta.state && !delta.error)return;
  void (async()=>{
    const key=`download:${delta.id}`;const info=(await chrome.storage.session.get(key))[key];if(!info)return;
    await serial(info.tabId,async()=>{const s=await read(info.tabId);const item=s.items.find(x=>x.url===info.url);if(item){item.download={id:delta.id,state:delta.state?.current||'interrupted',error:delta.error?.current};await save(info.tabId,s);}});
    if(delta.state?.current==='complete'||delta.state?.current==='interrupted')await chrome.storage.session.remove(key);
  })().catch(()=>{});
});
