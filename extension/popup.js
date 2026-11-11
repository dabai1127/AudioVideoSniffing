'use strict';
const $ = selector => document.querySelector(selector);
let activeTab, items = [], filter = 'all', signature = '', toastTimer;
function toast(message) {$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4200);}
async function request(type,extra={}) {const r=await chrome.runtime.sendMessage({type,tabId:activeTab.id,...extra});if(!r?.ok)throw Error(r?.error||'插件暂未响应');return r;}
function sizeText(bytes) {return bytes ? (bytes/1048576).toFixed(1)+' MB' : '大小待确认';}
function render() {
  $('#count').textContent=items.length;
  const visible=items.filter(x=>filter==='all'||x.kind===filter);
  const fragment=document.createDocumentFragment();
  for(const item of visible) {
    const card=$('#cardTemplate').content.firstElementChild.cloneNode(true);
    card.querySelector('.format').textContent=item.format.toUpperCase();
    card.querySelector('h2').textContent=item.title||activeTab.title||'媒体文件';
    card.querySelector('.meta').textContent=`${item.kind==='video'?'视频':item.kind==='stream'?'分段流':'音频'} · ${sizeText(item.size)}`;
    const verified=card.querySelector('.verified');verified.textContent=item.verified?'● 响应已确认':'○ 发现地址';verified.classList.toggle('yes',item.verified);
    const wave=card.querySelector('.wave');for(let i=0;i<56;i++){const bar=document.createElement('i');bar.style.height=(4+((i*17+i*i*3)%24))+'px';wave.append(bar);}
    card.querySelector('.source').textContent=`${new URL(item.url).hostname} · ${item.sources.join(' / ')}`;
    card.querySelector('code').textContent=item.url;
    card.querySelector('.copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(item.url);toast('已复制实际媒体地址');}catch{toast('复制失败，请展开完整地址后手动复制');}});
    const download=card.querySelector('.download');
    if(item.kind==='stream'){download.disabled=true;download.textContent='分段流 · 仅复制';}
    download.addEventListener('click',async()=>{download.disabled=true;try{await request('DOWNLOAD',{url:item.url,title:activeTab.title});toast('已交给浏览器下载，请选择保存位置');}catch(e){toast(e.message);}finally{download.disabled=false;}});
    if(item.download){const status=card.querySelector('.download-state');status.hidden=false;status.classList.toggle('error',item.download.state==='interrupted');status.textContent=item.download.state==='complete'?'✓ 文件已保存':item.download.state==='interrupted'?`下载中断：${item.download.error||'请在浏览器下载列表重试'}`:'浏览器正在下载…';}
    fragment.append(card);
  }
  $('#list').replaceChildren(fragment);$('#empty').hidden=visible.length>0;
  if(!visible.length&&items.length){$('#empty h2').textContent='这个分类还没有媒体';}else{$('#empty h2').textContent='等待一个声音';}
  const isSuno=Boolean(MediaCore.songId(activeTab.url));
  const hasMp3=items.some(x=>x.format==='mp3'),hasOther=items.some(x=>x.kind==='audio'&&x.format!=='mp3');
  $('#notice').hidden=!(isSuno || items.some(x=>x.kind==='stream'));
  $('#notice').textContent=isSuno ? hasOther&&!hasMp3?'Suno 当前发现的是 M4A 等音频，尚未发现 MP3。请按真实格式保存；需要 MP3 时，可使用项目内的本地转码脚本。':'已启用 Suno 识别：会过滤静音占位文件，并识别 media_urls。播放后可确认实际响应。' : '检测到 HLS / DASH 分段流。此版本展示清单地址，不合并分段、不处理 DRM。';
}
async function refresh(force=false) {if(!activeTab?.id)return;try{const result=await request('GET_MEDIA');const next=JSON.stringify(result.items);if(force||next!==signature){signature=next;items=result.items;render();}}catch(e){toast(e.message);}}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('selected',x===button);x.setAttribute('aria-pressed',String(x===button));});render();}));
$('#scan').addEventListener('click',async()=>{const button=$('#scan');button.disabled=true;try{await request('RESCAN');await refresh(true);toast('已扫描；请在网页播放后确认网络响应');}catch{toast('此页面无法扫描。请刷新普通网页后重试。');}finally{button.disabled=false;}});
$('#clear').addEventListener('click',async()=>{try{await request('CLEAR');await refresh(true);toast('当前标签页记录已清空');}catch(e){toast(e.message);}});
(async()=>{
  try{[activeTab]=await chrome.tabs.query({active:true,currentWindow:true});if(!activeTab?.id)throw Error('没有活动页面');$('#pageTitle').textContent=activeTab.title||activeTab.url||'当前页面';await refresh(true);if(/^https?:/.test(activeTab.url||'')){try{await request('RESCAN');}catch{}}setInterval(()=>refresh(),1100);}
  catch(e){toast(e.message);}
})();
