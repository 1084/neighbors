// The review page, served at /review. One file, no build. The admin key is asked for once and kept in
// sessionStorage; every request carries it as a bearer token. Nothing here is public.
export const REVIEW_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Neighbors · review</title>
<style>
body{margin:0;background:#F6F4EE;color:#2B2A28;font:15px/1.45 Inter,system-ui,-apple-system,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 60px}
h1{font-size:22px;margin:0 0 4px}.sub{color:#6B6762;margin:0 0 18px;font-size:13px}
.tabs{display:flex;gap:8px;margin:0 0 14px;flex-wrap:wrap}.tabs button{height:34px;padding:0 14px;border-radius:17px;border:1px solid #E6E1D9;background:#fff;font:inherit;font-size:13px;font-weight:500;cursor:pointer}.tabs button.on{background:#2B2A28;color:#fff;border-color:#2B2A28}
.card{background:#fff;border:1px solid #E6E1D9;border-radius:16px;padding:14px 16px;margin:0 0 10px;display:flex;flex-direction:column;gap:8px}
.row{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.k{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#8A857E}
.tag{font-size:11px;font-weight:600;border-radius:10px;padding:3px 8px;background:#EDE3D2;color:#6B4E2A}.tag.ok{background:#DCE6DF;color:#3F5A4D}.tag.bad{background:#F7E3E0;color:#9A4F49}
.card a{color:#3F5A4D;word-break:break-all}
.acts{display:flex;gap:8px;flex-wrap:wrap}.acts button{height:38px;padding:0 14px;border-radius:12px;border:1px solid #E6E1D9;background:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer}.acts button.ok{background:#6E8F7E;border-color:#6E8F7E;color:#fff}
input,textarea{font:inherit;border:1px solid #E6E1D9;border-radius:10px;padding:8px 10px;background:#F6F4EE;width:100%;box-sizing:border-box}
.empty{color:#8A857E;padding:28px;text-align:center;border:1px dashed #E6E1D9;border-radius:16px}
.gate{display:flex;gap:8px}.gate button{height:40px;padding:0 16px;border-radius:12px;border:0;background:#2B2A28;color:#fff;font:inherit;font-weight:600}
.sig{font-size:12px;color:#6B6762}
</style></head><body><main>
<h1>Neighbors · review</h1><p class="sub">Contributions wait here until a person decides. Approving a source or item lists it on What's new (no names); declining lists it only if you tick "say why publicly".</p>
<div id="gate" class="gate"><input id="key" type="password" placeholder="Admin key" autocomplete="off"><button id="go">Open</button></div>
<div id="app" style="display:none">
<div class="tabs"><button data-s="new" class="on">New</button><button data-s="approved">Approved</button><button data-s="declined">Declined</button><button data-s="done">Done (ideas)</button><button data-s="signals">Confirms &amp; flags</button><button id="export">Export approved</button></div>
<div id="list"></div>
</div>
<script>
const $=s=>document.querySelector(s);let key=sessionStorage.getItem('nk')||'',status='new';
const api=(p,o={})=>fetch(p,{...o,headers:{'content-type':'application/json',authorization:'Bearer '+key,...(o.headers||{})}}).then(async r=>{if(r.status===401){sessionStorage.removeItem('nk');location.reload()}return r.json()});
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const when=iso=>new Date(iso).toLocaleString();
async function load(){const d=await api('/v1/admin/queue?status='+(status==='signals'?'new':status));const el=$('#list');
 if(status==='signals'){el.innerHTML=d.signals.length?d.signals.map(s=>'<div class="card"><div class="row"><b style="word-break:break-all">'+esc(s.item_id)+'</b><span class="sig">'+s.confirms+' confirmed · '+s.flags+' flagged</span></div></div>').join(''):'<div class="empty">No confirms or flags yet.</div>';return}
 const flags=d.queue.filter(c=>c.kind==='flag'),rest=d.queue.filter(c=>c.kind!=='flag');
 el.innerHTML=(d.queue.length?[...flags,...rest].map(card).join(''):'<div class="empty">Nothing here.</div>');
 el.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>decide(b.dataset.id,b.dataset.act,b.closest('.card')));}
function card(c){const who='a neighbor near '+(c.zip3?c.zip3+'xx':'?');
 const body=c.kind==='idea'?'<div>'+esc(c.text)+'</div>':c.kind==='flag'?'<div><span class="k">Item</span><br><code>'+esc(c.item_id)+'</code></div><div><span class="k">Reason</span><br>'+esc(c.text||'—')+'</div>':
 '<div><span class="k">Link</span><br><a href="'+esc(c.link)+'" target="_blank" rel="noopener">'+esc(c.link)+'</a> <span class="tag '+(c.link_ok?'ok':'bad')+'">'+(c.link_ok?'resolved':'did not resolve')+'</span></div><div class="row"><span><span class="k">Covers</span><br>'+esc(c.category||'—')+'</span><span><span class="k">'+(c.kind==='source'?'Publisher':'Title')+'</span><br>'+esc(c.title||'—')+'</span><span><span class="k">ZIP</span><br>'+esc(c.zip||'—')+'</span>'+(c.starts?'<span><span class="k">When</span><br>'+esc(c.starts)+'</span>':'')+'</div>';
 const acts=c.status==='new'?'<div class="acts">'+(c.kind==='idea'?'<button class="ok" data-act="done" data-id="'+c.id+'">Done</button>':c.kind==='flag'?'<button class="ok" data-act="done" data-id="'+c.id+'">Acted on</button>':'<button class="ok" data-act="approved" data-id="'+c.id+'">Approve</button>')+'<button data-act="declined" data-id="'+c.id+'">Decline</button></div><textarea rows="2" class="note" placeholder="Note (shown on What\\'s new for approved items and done ideas; for a decline, only if ticked)"></textarea><label style="font-size:12px"><input type="checkbox" class="pub" style="width:auto"> say why publicly</label>':'<div class="acts"><button data-act="new" data-id="'+c.id+'">Back to new</button></div>'+(c.note?'<div class="sig">Note: '+esc(c.note)+'</div>':'');
 return '<div class="card"><div class="row"><b>'+esc(c.kind)+'</b><span class="sig">'+esc(who)+' · '+when(c.received_at)+'</span></div>'+body+acts+'</div>';}
async function decide(id,st,card){const note=card.querySelector('.note')?.value||'',pub=card.querySelector('.pub')?.checked;await api('/v1/admin/decide',{method:'POST',body:JSON.stringify({id,status:st,note,public:st==='declined'?!!pub:undefined})});load();}
$('#go').onclick=()=>{key=$('#key').value.trim();sessionStorage.setItem('nk',key);start()};
document.querySelectorAll('.tabs [data-s]').forEach(b=>b.onclick=()=>{status=b.dataset.s;document.querySelectorAll('.tabs [data-s]').forEach(x=>x.classList.toggle('on',x===b));load()});
$('#export').onclick=async()=>{const d=await api('/v1/admin/export');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));a.download='contrib-approved.json';a.click()};
function start(){$('#gate').style.display='none';$('#app').style.display='';load()}
if(key)start();
</script></main></body></html>`;
