// Wall Editor V620.01 Application Controller with V2 Sync
(function(){
const {GRID,MIN,YT,esc,httpUrl,normalize,makeCard,applySize,watchWidth,validCols,I18N,t,getLang,randomSize}=WallCore;
const $=id=>document.getElementById(id);
const wall=$('wall'),ta=$('input');

$('menuSlot').outerHTML=WallCore.menuHTML(false);
$('langSlot').outerHTML=WallCore.langSelectHTML();
$('shuffleSlot').outerHTML=WallCore.shuffleBtnHTML();
$('carSlot').outerHTML=WallCore.carouselBtnHTML();
$('filtSlot').outerHTML=WallCore.filterBtnHTML();
$('zoneSlot').outerHTML=WallCore.zoneBtnHTML();
$('fxSlot').outerHTML=WallCore.fxBtnHTML();

// Export buttons on EzBar
$('expSlot').outerHTML=
  '<button id="copyBtn" class="pill exp" title="Copy standalone wall"><span class="mi">📋</span></button>'
 +'<button id="dlBtn" class="pill exp" title="Download standalone wall"><span class="mi">💾</span></button>'
 +'<button id="syncDot" class="pill sync" title="Live sync dot"><span class="mi">●</span></button>'
 +'<button id="revBtn" class="pill rev" title="Co-WiKi Review (🛡)" style="display:none"><span class="mi">🛡</span></button>';

function updateRevBtnVisibility(){
  const rev = $('revBtn');
  if(!rev) return;
  const token = WallCore.ownerToken();
  if(token){
    rev.style.display = 'inline-flex';
    rev.removeAttribute('hidden');
  } else {
    rev.style.display = 'none';
    rev.setAttribute('hidden', '');
  }
}

$('barZone').insertAdjacentHTML('beforeend',WallCore.filterBarHTML());
$('lang').addEventListener('change',e=>setLang(e.target.value));
$('copyBtn').addEventListener('click', () => copyFullHTML());
$('dlBtn').addEventListener('click', () => downloadStandalone());

// Mask email in format: l*******@gmail.com
function maskEmail(email){
  if(!email || typeof email !== 'string' || !email.includes('@')) return '';
  const parts = email.split('@');
  const local = parts[0], domain = parts[1];
  if(!local) return '@' + domain;
  const first = local[0].toLowerCase();
  const starCount = Math.max(local.length - 1, 7);
  return first + '*'.repeat(starCount) + '@' + domain;
}

// Apply I18N and Layout UI immediately
WallCore.applyI18n();
WallCore.updateLayoutUI(0);

function getWallId(){
  try{const q=new URLSearchParams(location.search).get('wall');if(q)return q;}catch(e){}
  const p=location.pathname.replace(/^\/+/, '').split('/')[0];
  if(p && /^W[a-zA-Z0-9_-]+$/i.test(p)) return p;
  return 'main';
}
const WALL_ID=getWallId();
const KEY=`wiki_wall_${WALL_ID}`;
const displayId = (WALL_ID === 'main' ? '886.wiki' : WALL_ID);
$('idDisplay').textContent=displayId;
$('idDisplay2').textContent=displayId;

// Immediate check for ownerEmail in URL query parameter
try{
  const urlOwnerEmail = new URLSearchParams(location.search).get('ownerEmail');
  if (urlOwnerEmail) {
    const ownerEl = $('ownerDisplay');
    if (ownerEl) {
      ownerEl.textContent = 'Owner: ' + maskEmail(urlOwnerEmail);
      ownerEl.title = 'Wall Owner: ' + maskEmail(urlOwnerEmail);
      ownerEl.style.display = 'inline-flex';
    }
  }
}catch(e){}

// Enable server synchronization
WallCore.setWallSync(window.location.origin);
WallCore.setFrameCheck(window.location.origin + '/api/frame-check');

// Check owner key in URL: per Owner Guide s1d, save to browser and remove from address bar immediately
try{
  const sp = new URLSearchParams(location.search);
  const q = sp.get('owner');
  if(q){
    WallCore.setOwnerToken(q.trim());
    sp.delete('owner');
    const newSearch = sp.toString() ? ('?' + sp.toString()) : '';
    window.history.replaceState({}, '', location.pathname + newSearch + location.hash);
  }
}catch(e){}

updateRevBtnVisibility();

// Long-press wall name on EzBar to enter or clear key by hand (per Owner Guide s3b)
let holdTimer = null;
function cancelHold(){ if(holdTimer){ clearTimeout(holdTimer); holdTimer = null; } }
const idEl = $('idDisplay');
if(idEl){
  idEl.style.cursor = 'pointer';
  idEl.title = 'Press and hold to enter or clear Owner key';

  const startHold = () => {
    cancelHold();
    holdTimer = setTimeout(() => {
      cancelHold();
      const current = WallCore.ownerToken();
      const msg = current
        ? 'Owner key is active.\nEnter new Owner key, or leave blank to clear:'
        : 'Enter Owner key for this wall:';
      const input = prompt(msg, current);
      if(input !== null){
        const trimmed = input.trim();
        if(trimmed){
          WallCore.setOwnerToken(trimmed);
          updateRevBtnVisibility();
          toast('✓ Owner key saved');
        } else {
          WallCore.setOwnerToken('');
          updateRevBtnVisibility();
          toast('Owner key cleared');
        }
      }
    }, 1000);
  };

  idEl.addEventListener('pointerdown', startHold);
  idEl.addEventListener('pointerup', cancelHold);
  idEl.addEventListener('pointerleave', cancelHold);
  idEl.addEventListener('pointercancel', cancelHold);
}

let list=[];
let guestCards=new Map();
let toastT;
function toast(m){const el=$('toast');el.textContent=m;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),2800);}
function updateCount(){$('count').textContent=t('count',{n:list.length});}

// Split into blocks for EzSheet
const SEP='━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',ZSEP='==============================',CSEP='##############################';
const isSep=s=>/^[━─—\-]{3,}$/.test(s.trim());
const isZone=s=>/^={3,}$/.test(s.trim());
const isCZone=s=>/^#{1,}$/.test(s.trim());
const ZMARK='\u0000zone',CMARK='\u0000czone';
function tagDepth(s){let d=0,m;const re=/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;while((m=re.exec(s))){d+=m[1]?-1:1;}return d;}
function closed(s){return s.lastIndexOf('<')<=s.lastIndexOf('>')&&tagDepth(s)<=0;}

function splitBlocks(text){
  const out=[];let buf=null,md=null;
  for(const rawLine of text.split(/\r?\n/)){
    const line=rawLine.trim();
    if(md!==null){md+='\n'+rawLine;if(/<\/md>\s*$/i.test(line)){out.push(md.trim());md=null;}continue;}
    if(buf===null&&/^<md>/i.test(line)){
      if(/<\/md>\s*$/i.test(line)&&line.length>4)out.push(line);else md=rawLine;
      continue;
    }
    if(buf!==null){
      if(isSep(line)||isZone(line)||isCZone(line)||(/^https?:\/\/\S+$/i.test(line)&&buf.lastIndexOf('<')<=buf.lastIndexOf('>'))){out.push(buf.trim());buf=null;}
      else{buf+='\n'+rawLine;if(closed(buf)){out.push(buf.trim());buf=null;}continue;}
    }
    if(isZone(line)){out.push(ZMARK);continue;}
    if(isCZone(line)){out.push(CMARK);continue;}
    if(!line||isSep(line))continue;
    if(line.startsWith('<')){
      if(/^<script\b/i.test(line)&&out.length&&out[out.length-1].startsWith('<'))buf=out.pop()+'\n'+rawLine;
      else buf=rawLine;
      if(closed(buf)){out.push(buf.trim());buf=null;}
      continue;
    }
    const found=line.match(/https?:\/\/[^\s"'<>]+/gi);
    if(found)out.push(...found);else out.push(line);
  }
  if(buf!==null)out.push(buf.trim());
  if(md!==null)out.push(md.trim());
  return out;
}

function parseBatch(text){
  text=String(text||'').trim();if(!text)return {items:[],skipped:0};
  const blocks=splitBlocks(text),items=[];let skipped=0;
  let buf=[];
  const flush=zone=>{buf.forEach(o=>{o.zone=zone;items.push(o);});buf=[];};
  blocks.forEach(b=>{
    if(b===CMARK){flush('c');return;}
    if(b===ZMARK){flush('a');return;}
    const it=WallCore.parseOne(b);
    if(it)buf.push(it);else skipped++;
  });
  flush('b');
  return {items,skipped};
}

let zones={a:true,b:true,c:true},zorder=['c','a','b'],cols=0,car=false;
const F={...WallCore.FDEF};

function getCombinedList(){
  const guests = Array.from(guestCards.values());
  return list.concat(guests);
}

function render(){
  const combined = getCombinedList();
  const B=combined.filter(o=>o.zone==='b'||!o.zone),keep=new Set(B.map(o=>o._id));
  [...wall.children].forEach(el=>{if(!keep.has(el.dataset.id))WallCore.dropCard(el);});
  const have=new Map([...wall.children].map(el=>[el.dataset.id,el]));
  B.forEach(o=>{
    let el=have.get(o._id);
    if(!el){el=makeCard(o,!!o.guest);wall.appendChild(el);}
    applySize(el,o);
  });
  updateCount();
  relayout();
}

function relayout(){
  const combined = getCombinedList();
  const v=WallCore.applyView(wall,combined,F);
  const A=zones.a?v.filter(o=>o.zone==='a'):[],
        B=zones.b?v.filter(o=>o.zone==='b'||!o.zone):[],
        C=zones.c?v.filter(o=>o.zone==='c'):[];
  WallCore.zoneCUpdate(C);WallCore.zoneAUpdate(A);
  WallCore.zonePaint(zones,WallCore.zoneCounts(combined));
  wall.hidden=!zones.b;
  if(B.length)WallCore.layoutWall(wall,B,cols,car);else wall.style.height='';
}

window.openPanel=function(i){
  const mf=$('metaFields');mf.hidden=!(Number.isInteger(i)&&list[i]);
  if(Number.isInteger(i)&&list[i]){
    const o=list[i];ta.value=o._raw.trim();ta.dataset.editIndex=i;
    $('mTitle').value=o.title||'';$('mTags').value=(o.tags||[]).join(', ');$('mDur').value=WallCore.fmtDur(o.dur);
  } else {
    const j=a=>a.map(o=>o._raw.trim()).join('\n'+SEP+'\n'),
      C=list.filter(o=>o.zone==='c'),A=list.filter(o=>o.zone==='a'),B=list.filter(o=>o.zone==='b'||!o.zone);
    ta.value=(C.length?j(C)+'\n':'')+CSEP+'\n'+(A.length?j(A)+'\n':'')+ZSEP+'\n'
      +(B.length?j(B)+'\n'+SEP+'\n':'');
    delete ta.dataset.editIndex;
  }
  updateCount();$('panel').classList.remove('hidden');ta.focus();
};
window.closePanel=function(){$('panel').classList.add('hidden');};

window.batchImport=function(){
  const editIdx = ta.dataset.editIndex != null ? Number(ta.dataset.editIndex) : null;
  if(editIdx !== null && list[editIdx]){
    const updated = WallCore.parseOne(ta.value.trim());
    if(!updated){toast('Invalid card content');return;}
    const tVal = $('mTitle').value.trim();
    if(tVal) updated.title = tVal;
    const tagVal = $('mTags').value.trim();
    if(tagVal) updated.tags = tagVal.split(',').map(s=>s.trim()).filter(Boolean);
    const durVal = $('mDur').value.trim();
    if(durVal) updated.dur = WallCore.parseDur(durVal);
    updated.zone = list[editIdx].zone || 'b';
    list[editIdx] = updated;
    delete ta.dataset.editIndex;
    render();
    closePanel();
    syncToServer();
    toast('✓ Card updated');
    return;
  }
  const r=parseBatch(ta.value),{items,skipped}=r;
  if(!items.length){toast('No items found');return;}
  list=items;
  render();
  closePanel();
  syncToServer();
  toast(skipped?`Saved ${items.length} items (${skipped} skipped)`:`✓ Saved ${items.length} items to wall`);
};

window.clearWall=function(){if(!confirm('Clear this wall?'))return;list=[];render();syncToServer();};

async function syncToServer(){
  const payload = {
    title: WALL_ID,
    cols,
    car,
    zones,
    zorder,
    ownerCards: list
  };
  try {
    const headers = { 'Content-Type': 'application/json' };
    const tok = WallCore.ownerToken();
    if (tok) headers['x-wall-owner'] = tok;
    const res = await fetch(`/api/wall/${encodeURIComponent(WALL_ID)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      toast('☁️ Database synced!');
    } else {
      toast('Sync failed: ' + res.statusText);
    }
  } catch(e) {
    toast('Sync error');
  }
}
window.syncToServer=syncToServer;

// Fetch wall from DB on start
async function loadFromServer(){
  try {
    const res = await fetch(`/api/wall/${encodeURIComponent(WALL_ID)}`);
    const ct = res.headers.get('content-type') || '';
    if(res.ok && ct.includes('application/json')) {
      const data = await res.json();
      if(Array.isArray(data.ownerCards) && data.ownerCards.length) {
        list = data.ownerCards.map(normalize).filter(Boolean);
      }
      if(data.cols !== undefined) cols = data.cols;
      if(data.car !== undefined) car = !!data.car;
      if(data.zones) zones = data.zones;
      if(data.zorder) zorder = data.zorder;
      WallCore.updateLayoutUI(cols);
      if(Array.isArray(data.cards)) {
        data.cards.forEach(c => {
          const o = WallCore.parseOne(c.raw);
          if(o) {
            o.guest = true;
            o.ok = !!c.ok;
            o.cid = c.cid;
            o.zone = c.zone || 'b';
            guestCards.set(c.cid, o);
          }
        });
      }
      if(data.userEmail) {
        window.currentWallOwnerEmail = data.userEmail;
        const ownerEl = $('ownerDisplay');
        if(ownerEl) {
          ownerEl.textContent = 'Owner: ' + maskEmail(data.userEmail);
          ownerEl.title = 'Wall Owner: ' + maskEmail(data.userEmail);
          ownerEl.style.display = 'inline-flex';
        }
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'WIKI_WALL_OWNER_EMAIL', userEmail: data.userEmail, wallId: WALL_ID }, '*');
          }
        } catch(err) {}
      }
      render();
    }
  } catch(e) {
    console.error('Failed to load wall from server:', e);
  }
}

// SSE Live connection
function startSSE(){
  const dot = $('syncDot');
  const es = new EventSource(`/api/wall/${encodeURIComponent(WALL_ID)}/stream`);
  es.addEventListener('open', () => {
    dot.classList.add('on');
    dot.classList.remove('off');
    dot.title = 'Live — database synced';
  });
  es.addEventListener('error', () => {
    dot.classList.remove('on');
    dot.classList.add('off');
    dot.title = 'Offline — reconnecting…';
  });
  es.addEventListener('card', (e) => {
    try {
      const card = JSON.parse(e.data);
      const o = WallCore.parseOne(card.raw);
      if(o) {
        o.guest = true;
        o.ok = !!card.ok;
        o.cid = card.cid;
        o.zone = card.zone || 'b';
        guestCards.set(card.cid, o);
        render();
        toast('New Co-WiKi card received: ' + card.cid);
      }
    } catch(err){}
  });
  es.addEventListener('drop', (e) => {
    try {
      const d = JSON.parse(e.data);
      if(guestCards.has(d.cid)) {
        guestCards.delete(d.cid);
        render();
      }
    } catch(err){}
  });
  es.addEventListener('promote', (e) => {
    try {
      const d = JSON.parse(e.data);
      const o = guestCards.get(d.cid);
      if(o) {
        o.ok = true;
        WallCore.markApproved(o);
        render();
        toast('Card approved: ' + d.cid);
      }
    } catch(err){}
  });
}

// Review button
$('revBtn').addEventListener('click', () => {
  WallCore.reviewOpen(WALL_ID, (cid) => {
    guestCards.delete(cid);
    render();
  }, (cid) => {
    const o = guestCards.get(cid);
    if(o) o.ok = true;
    render();
  });
});

// Card actions delegation (insert, delete, edit, toggle embed, copy link, guest del, fold)
document.addEventListener('click', (e) => {
  // Fold button
  const fold = e.target.closest('.fold-btn');
  if(fold) {
    const el = fold.closest('.item');
    if(el) {
      const open = el.classList.toggle('unfolded');
      fold.textContent = open ? t('foldLess') : t('foldMore');
      relayout();
    }
    return;
  }

  // Delete card
  const delBtn = e.target.closest('[data-act="del"]');
  if(delBtn) {
    const el = delBtn.closest('.item');
    if(!el) return;
    const cid = String(el.dataset.id).replace(/^[ac]-/, '');
    const idx = list.findIndex(x => x._id === cid);
    if(idx >= 0) {
      list.splice(idx, 1);
      render();
      syncToServer();
      toast('Card removed');
    }
    return;
  }

  // Edit card
  const editBtn = e.target.closest('[data-act="edit"]');
  if(editBtn) {
    const el = editBtn.closest('.item');
    if(!el) return;
    const cid = String(el.dataset.id).replace(/^[ac]-/, '');
    const idx = list.findIndex(x => x._id === cid);
    if(idx >= 0) {
      openPanel(idx);
    }
    return;
  }

  // Toggle embed / tombstone
  const embBtn = e.target.closest('[data-act="emb"]');
  if(embBtn) {
    const el = embBtn.closest('.item');
    if(!el) return;
    const cid = String(el.dataset.id).replace(/^[ac]-/, '');
    const item = list.find(x => x._id === cid);
    if(item && item.type === 'web') {
      item.emb = item.emb === 'no' ? 'yes' : 'no';
      render();
      syncToServer();
    }
    return;
  }

  // Copy card link
  const lnkBtn = e.target.closest('[data-act="link"]');
  if(lnkBtn) {
    const el = lnkBtn.closest('.item');
    if(!el) return;
    const ref = el.dataset.id;
    const url = new URL(location.href);
    url.hash = '#' + ref;
    navigator.clipboard.writeText(url.href).then(() => toast('Link copied')).catch(() => {});
    return;
  }

  // Guest delete own visitor card
  const gdelBtn = e.target.closest('[data-act="gdel"]');
  if(gdelBtn) {
    const el = gdelBtn.closest('.item');
    if(!el) return;
    const cid = String(el.dataset.id).replace(/^[ac]-/, '');
    fetch(`/api/wall/${encodeURIComponent(WALL_ID)}/cards/${encodeURIComponent(cid)}`, {
      method: 'DELETE',
      headers: { 'x-wall-me': WallCore.wallMe() }
    }).then(r => {
      if(r.ok) {
        guestCards.delete(cid);
        render();
        toast('Visitor card removed');
      }
    });
    return;
  }

  // Insert card before
  const b = e.target.closest('[data-act="ins"]');
  if(!b) return;
  const el = b.closest('.item');
  if(!el) return;
  const cid = String(el.dataset.id).replace(/^[ac]-/, '');
  const combined = getCombinedList();
  const anchorItem = combined.find(x => x._id === cid);
  if(!anchorItem) return;

  e.preventDefault();
  WallCore.insertDialog(true, (o) => {
    const zone = anchorItem.zone || 'b';
    const anchor = anchorItem.cid || anchorItem.ref || 'Z-' + WallCore.rawHash(anchorItem._raw);
    return fetch(`/api/wall/${encodeURIComponent(WALL_ID)}/cards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wall-me': WallCore.wallMe(),
        'x-wall-owner': WallCore.ownerToken()
      },
      body: JSON.stringify({ raw: o._raw, anchor, zone })
    }).then(r => {
      if(r.ok) {
        toast('✓ Card posted!');
        return true;
      }
      return 'insBusy';
    }).catch(() => 'insDown');
  });
});

// Zones and Filter bindings
WallCore.bindZones(zones, () => {
  relayout();
  syncToServer();
});
WallCore.bindFilter(wall, F, () => relayout());

// Panel Tabs (EzSheet / Images & 3D)
$('tabSheet').addEventListener('click', () => {
  $('tabSheet').setAttribute('aria-selected', 'true');
  $('tabPics').setAttribute('aria-selected', 'false');
  $('paneSheet').hidden = false;
  $('panePics').hidden = true;
});
$('tabPics').addEventListener('click', () => {
  $('tabSheet').setAttribute('aria-selected', 'false');
  $('tabPics').setAttribute('aria-selected', 'true');
  $('paneSheet').hidden = true;
  $('panePics').hidden = false;
});

// File Upload (.json, .html, .txt)
$('fileUpload').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  try {
    const text = await file.text();
    if(file.name.endsWith('.json')) {
      try {
        const json = JSON.parse(text);
        const rawItems = Array.isArray(json.list) ? json.list : Array.isArray(json) ? json : [];
        if(rawItems.length) {
          list = rawItems.map(normalize).filter(Boolean);
          if(json.cols !== undefined) cols = json.cols;
          if(json.car !== undefined) car = !!json.car;
          if(json.zones) zones = json.zones;
          if(json.zorder) zorder = json.zorder;
          render();
          closePanel();
          syncToServer();
          toast('✓ Loaded ' + list.length + ' cards from ' + file.name);
          return;
        }
      } catch(err){}
    } else if(file.name.endsWith('.html') || file.name.endsWith('.htm')) {
      const match = text.match(/<script id="wall-data"[^>]*>([\s\S]*?)<\/script>/i);
      if(match) {
        try {
          const json = JSON.parse(match[1]);
          if(Array.isArray(json.list)) {
            list = json.list.map(normalize).filter(Boolean);
            if(json.cols !== undefined) cols = json.cols;
            if(json.car !== undefined) car = !!json.car;
            if(json.zones) zones = json.zones;
            if(json.zorder) zorder = json.zorder;
            render();
            closePanel();
            syncToServer();
            toast('✓ Loaded ' + list.length + ' cards from HTML');
            return;
          }
        } catch(err){}
      }
    }
    ta.value = text;
    updateCount();
    toast('Loaded text from ' + file.name);
  } catch(err) {
    toast('Failed to read file');
  } finally {
    e.target.value = '';
  }
});

// Pictures & 3D Tab Handling
const pendingPics = [];
function renderPicsList(){
  const container = $('pics');
  container.innerHTML = '';
  pendingPics.forEach((p, idx) => {
    const div = document.createElement('div');
    div.className = 'pic';
    let previewHTML = '';
    if(p.is3d) {
      previewHTML = `<div class="m3d"><b>3D</b><span>${esc(p.ext.toUpperCase())}</span><i>${esc(p.name)}</i></div>`;
    } else {
      previewHTML = `<img src="${esc(p.url)}" alt="${esc(p.name)}">`;
    }
    div.innerHTML = previewHTML + `
      <div class="row">
        <select data-idx="${idx}">
          <option value="b" ${p.zone === 'b' ? 'selected' : ''}>Content</option>
          <option value="a" ${p.zone === 'a' ? 'selected' : ''}>Topic</option>
          <option value="c" ${p.zone === 'c' ? 'selected' : ''}>InfoMercial</option>
        </select>
        <button type="button" data-del="${idx}">✕</button>
      </div>`;
    div.querySelector('select').addEventListener('change', (ev) => {
      p.zone = ev.target.value;
    });
    div.querySelector('button').addEventListener('click', () => {
      pendingPics.splice(idx, 1);
      renderPicsList();
    });
    container.appendChild(div);
  });
}

function handlePicFiles(files){
  const defaultZone = $('picZone') ? $('picZone').value : 'b';
  for(const f of files){
    const ext = f.name.split('.').pop().toLowerCase();
    const is3d = ['glb', 'gltf', 'stl', 'obj'].includes(ext);
    if(is3d) {
      const url = URL.createObjectURL(f);
      pendingPics.push({ name: f.name, ext, is3d: true, url, zone: defaultZone });
      renderPicsList();
    } else if(f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        pendingPics.push({ name: f.name, ext, is3d: false, url: e.target.result, zone: defaultZone });
        renderPicsList();
      };
      reader.readAsDataURL(f);
    }
  }
}

const dropEl = $('drop');
if(dropEl){
  dropEl.addEventListener('click', () => $('picFile').click());
  dropEl.addEventListener('dragover', (e) => { e.preventDefault(); dropEl.classList.add('over'); });
  dropEl.addEventListener('dragleave', () => dropEl.classList.remove('over'));
  dropEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dropEl.classList.remove('over');
    if(e.dataTransfer && e.dataTransfer.files) handlePicFiles(e.dataTransfer.files);
  });
}
$('picFile').addEventListener('change', (e) => {
  if(e.target.files) handlePicFiles(e.target.files);
  e.target.value = '';
});

// Add pictures as cards
$('btnPicAdd').addEventListener('click', () => {
  if(!pendingPics.length) { toast('No images to add'); return; }
  pendingPics.forEach(p => {
    const raw = p.is3d
      ? `<model data-name="${p.name}" data-ext="${p.ext}">${p.url}</model>`
      : p.url;
    const card = WallCore.parseOne(raw);
    if(card) {
      card.zone = p.zone || 'b';
      card.pic = true;
      list.push(card);
    }
  });
  const count = pendingPics.length;
  pendingPics.length = 0;
  renderPicsList();
  render();
  closePanel();
  syncToServer();
  toast(`✓ Added ${count} card(s)`);
});

// Use pictures as sprites
$('btnSprites').addEventListener('click', () => {
  const imgPics = pendingPics.filter(p => !p.is3d);
  if(!imgPics.length) { toast('No image files available for sprites'); return; }
  window.WALL_SPRITES = imgPics.map(p => p.url);
  WallCore.fxSetFly(true);
  toast(`✓ Applied ${window.WALL_SPRITES.length} custom sprite(s)`);
});

// Reset sprites to default bees
$('btnSpriteReset').addEventListener('click', () => {
  window.WALL_SPRITES = [];
  toast('Reset to default bees');
});

// Zone Order Drag & Swap
const zdrag = $('zdrag');
if(zdrag){
  zdrag.querySelectorAll('.zchip[draggable="true"]').forEach(chip => {
    chip.addEventListener('click', () => {
      // Toggle C and A order
      if(zorder[0] === 'c') zorder = ['a', 'c', 'b'];
      else zorder = ['c', 'a', 'b'];
      WallCore.applyZoneOrder(zorder);
      // Reorder chip DOM nodes
      const chips = Array.from(zdrag.children);
      const cChip = chips.find(c => c.dataset.z === 'c');
      const aChip = chips.find(c => c.dataset.z === 'a');
      const bChip = chips.find(c => c.dataset.z === 'b');
      zdrag.innerHTML = '';
      if(zorder[0] === 'c') {
        zdrag.appendChild(cChip); zdrag.appendChild(aChip); zdrag.appendChild(bChip);
      } else {
        zdrag.appendChild(aChip); zdrag.appendChild(cChip); zdrag.appendChild(bChip);
      }
      relayout();
      syncToServer();
      toast(`Zone order: ${zorder.map(z=>z.toUpperCase()).join(' · ')}`);
    });
  });
}

// Textarea custom scrollbar (taBar & taThumb)
const taThumb = $('taThumb'), taBar = $('taBar');
if(taThumb && taBar){
  function syncTaThumb(){
    const maxScroll = ta.scrollHeight - ta.clientHeight;
    if(maxScroll <= 0){ taBar.hidden = true; return; }
    taBar.hidden = false;
    const ratio = ta.scrollTop / maxScroll;
    const trackH = taBar.clientHeight - taThumb.clientHeight;
    taThumb.style.top = (ratio * trackH) + 'px';
  }
  ta.addEventListener('scroll', syncTaThumb);
  let draggingThumb = false, startY = 0, startScroll = 0;
  taThumb.addEventListener('pointerdown', (e) => {
    draggingThumb = true;
    startY = e.clientY;
    startScroll = ta.scrollTop;
    taBar.classList.add('drag');
    e.target.setPointerCapture(e.pointerId);
  });
  taThumb.addEventListener('pointermove', (e) => {
    if(!draggingThumb) return;
    const dy = e.clientY - startY;
    const trackH = taBar.clientHeight - taThumb.clientHeight;
    const maxScroll = ta.scrollHeight - ta.clientHeight;
    if(trackH > 0) ta.scrollTop = startScroll + (dy / trackH) * maxScroll;
  });
  const stopThumb = (e) => {
    if(!draggingThumb) return;
    draggingThumb = false;
    taBar.classList.remove('drag');
  };
  taThumb.addEventListener('pointerup', stopThumb);
  taThumb.addEventListener('pointercancel', stopThumb);
}

// Layout menu
WallCore.bindMenu(n => {
  if(n === 'reset') {
    list.forEach(o => { delete o.free; delete o.px; delete o.py; });
    WallCore.updateLayoutUI(cols);
    render();
  } else if(n > 0) {
    cols = n;
    WallCore.updateLayoutUI(cols);
    render();
  } else {
    cols = 0;
    list = list.map(randomSize);
    WallCore.updateLayoutUI(cols);
    render();
  }
  syncToServer();
});

// Carousel
$('carBtn').addEventListener('click', () => {
  car = !car;
  WallCore.setCarousel(wall, car);
  relayout();
  syncToServer();
});

// Shuffle
$('shuffleBtn').addEventListener('click', () => {
  list = WallCore.shuffled(list);
  render();
  syncToServer();
});

// Downloads
window.downloadJSON=function(){
  const blob = new Blob([JSON.stringify({ id: WALL_ID, count: list.length, cols, car, zones, zorder, list }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${WALL_ID}-wall.json`; a.click();
};

function exportItem(o){const r={_raw:o._raw,type:o.type,w:o.w,h:o.h};if(o.mh)r.mh=o.mh;if(o.manual)r.manual=true;if(o.zone==='a'||o.zone==='c')r.zone=o.zone;if(o.free){r.free=true;r.px=o.px;r.py=o.py;}if(o.span){r.span=o.span;r.rh=o.rh;}if(o.emb)r.emb=o.emb;if(o.blk)r.blk=true;if(o.pic)r.pic=true;['at','pub','title','tags','dur'].forEach(k=>{if(o[k]!==undefined)r[k]=o[k];});if(o.type==='youtube'){r.id=o.id;r.url=o.url;}else if(o.type==='model'){r.mdl=o.mdl;}else if(o.type==='html'){r.html=o.html;}else if(o.type==='md'){}else{r.url=o.url;}return r;}

async function buildStandalone(){
  const css=document.getElementById('wall-css')?document.getElementById('wall-css').textContent:'';
  let core='';
  try {
    const res = await fetch('/wall-core.js');
    if (res.ok) core = await res.text();
  } catch(e){}
  if(!core && document.getElementById('wall-core')) core = document.getElementById('wall-core').textContent;
  const fOpen=false;
  const data=JSON.stringify({id:WALL_ID,count:list.length,cols,car,zones,zorder,lang:WallCore.getLang(),
    fx:WallCore.fxState(),
    filter:list.length>WallCore.FILTER_MIN,
    list:list.map(exportItem)})
    .replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return '<!DOCTYPE html>\n<html lang="'+WallCore.getLang()+'"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>'+esc(WALL_ID)+'</title>'
    +'<style>'+css+'</style></head><body class="ro"><div id="wall" class="masonry"></div>'
    +'<script id="wall-data" type="application/json">'+data+'<\/script>'
    +'<script>window.WALL_SPRITES='+JSON.stringify(WallCore.validSprites(window.WALL_SPRITES)||[]).replace(/</g,'\\u003c')+';<\/script>'
    +'<script>'+core+'<\/script><script>WallCore.bootReadonly();<\/script></body></html>';
}

async function copyFullHTML(){
  if(!list.length){toast(t('emptyWall'));return;}
  const html=await buildStandalone();
  try{await navigator.clipboard.writeText(html);toast(t('copied',{n:list.length}));return;}catch(e){}
  WallCore.saveFile(html,'text/html',WALL_ID+'-wall.html');
}
window.copyFullHTML=copyFullHTML;

async function downloadStandalone(){
  if(!list.length){toast(t('emptyWall'));return;}
  const html=await buildStandalone();
  WallCore.saveFile(html,'text/html',WALL_ID+'-wall.html');
}
window.downloadStandalone=downloadStandalone;

function setLang(l){
  WallCore.setLangCode(l);
  WallCore.applyI18n();
}

// ==========================================
// 🌍 Earth Icon Creator / OTP & Wall Generator
// ==========================================
window.handleEarthGlobeClick = function(){
  const modal = $('authModal');
  if(!modal) return;
  
  let user = null;
  try {
    const raw = localStorage.getItem('wiki_user');
    if (raw) user = JSON.parse(raw);
  } catch(e){}

  const stepEmail = $('authStepEmail');
  const stepOtp = $('authStepOtp');
  const stepLoggedIn = $('authStepLoggedIn');

  if(user && user.email) {
    if(stepEmail) stepEmail.hidden = true;
    if(stepOtp) stepOtp.hidden = true;
    if(stepLoggedIn) stepLoggedIn.hidden = false;
    const emailDisp = $('loggedInUserEmail');
    if(emailDisp) {
      emailDisp.textContent = maskEmail(user.email);
      emailDisp.title = user.email;
    }
  } else {
    if(stepEmail) stepEmail.hidden = false;
    if(stepOtp) stepOtp.hidden = true;
    if(stepLoggedIn) stepLoggedIn.hidden = true;
    const inp = $('authEmailInput');
    if(inp) setTimeout(() => inp.focus(), 100);
  }

  modal.classList.remove('hidden');
};

window.closeAuthModal = function(){
  const modal = $('authModal');
  if(modal) modal.classList.add('hidden');
};

window.backToEmailStep = function(){
  const stepEmail = $('authStepEmail');
  const stepOtp = $('authStepOtp');
  if(stepEmail) stepEmail.hidden = false;
  if(stepOtp) stepOtp.hidden = true;
};

window.handleSendOtp = async function(){
  const inp = $('authEmailInput');
  const btn = $('sendOtpBtn');
  if(!inp || !btn) return;
  const email = inp.value.trim();
  if(!email || !email.includes('@')){
    toast('Please enter a valid email address');
    inp.focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Sending OTP...';
  try {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if(res.ok && data.success){
      $('authEmailDisplay').textContent = email;
      $('authStepEmail').hidden = true;
      $('authStepOtp').hidden = false;
      const otpInp = $('authOtpInput');
      if(otpInp){
        otpInp.value = '';
        setTimeout(() => otpInp.focus(), 100);
      }
      toast('✓ 4-digit code sent to ' + email);
    } else {
      toast(data.error || 'Failed to send OTP code');
    }
  } catch(e) {
    toast('Network error sending OTP');
  } finally {
    btn.disabled = false;
    btn.textContent = '📧 Send 4-Digit Verification Code';
  }
};

window.handleVerifyOtp = async function(){
  const email = ($('authEmailInput').value || '').trim();
  const otpInp = $('authOtpInput');
  const btn = $('verifyOtpBtn');
  if(!otpInp || !btn) return;
  const otp = otpInp.value.trim();

  if(!/^\d{4}$/.test(otp)){
    toast('Please enter the 4-digit code');
    otpInp.focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Verifying...';
  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp })
    });
    const data = await res.json();
    if(res.ok && data.success){
      const userData = { email: data.email, token: data.token };
      localStorage.setItem('wiki_user', JSON.stringify(userData));
      const emailEl = $('loggedInUserEmail');
      if (emailEl) {
        emailEl.textContent = maskEmail(data.email);
        emailEl.title = data.email;
      }
      $('authStepOtp').hidden = true;
      $('authStepLoggedIn').hidden = false;
      toast('✓ Verified as ' + data.email);

      // Notify React parent window if embedded
      try {
        window.parent.postMessage({ type: 'WIKI_AUTH_SUCCESS', user: userData }, '*');
      } catch(e){}
    } else {
      toast(data.error || 'Invalid verification code');
    }
  } catch(e) {
    toast('Network error verifying OTP');
  } finally {
    btn.disabled = false;
    btn.textContent = '✓ Verify & Log In';
  }
};

window.handleGenerateWall = async function(){
  let user = null;
  try {
    const raw = localStorage.getItem('wiki_user');
    if(raw) user = JSON.parse(raw);
  } catch(e){}

  if(!user || !user.email){
    toast('Please verify email first');
    handleEarthGlobeClick();
    return;
  }

  const titleInp = $('newWallTitle');
  const title = titleInp ? titleInp.value.trim() : '';
  const btn = $('generateBtn');
  if(btn){
    btn.disabled = true;
    btn.textContent = '⏳ Creating Wall in MySQL DB...';
  }

  try {
    const res = await fetch('/api/walls/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, title })
    });
    const data = await res.json();
    if(res.ok && data.success && data.wall){
      const w = data.wall;
      localStorage.setItem('wall_owner', w.ownerKey);
      toast('🎉 Wall Generated: /' + w.id + ' (Saved to MySQL DB)');
      
      // Notify React app
      try {
        window.parent.postMessage({ type: 'WIKI_WALL_GENERATED', wall: w }, '*');
      } catch(e){}

      setTimeout(() => {
        window.location.href = '/wall-editor.html?wall=' + encodeURIComponent(w.id) + '&owner=' + encodeURIComponent(w.ownerKey);
      }, 700);
    } else {
      toast(data.error || 'Failed to generate wall');
      if(btn){
        btn.disabled = false;
        btn.textContent = '🚀 Generate New Wall (domain/W...)';
      }
    }
  } catch(e) {
    toast('Network error creating wall');
    if(btn){
      btn.disabled = false;
      btn.textContent = '🚀 Generate New Wall (domain/W...)';
    }
  }
};

window.handleSignOut = function(){
  localStorage.removeItem('wiki_user');
  $('authStepLoggedIn').hidden = true;
  $('authStepEmail').hidden = false;
  toast('Signed out');
  try {
    window.parent.postMessage({ type: 'WIKI_SIGNOUT' }, '*');
  } catch(e){}
};

// Auto submit OTP on 4th digit entry
document.addEventListener('DOMContentLoaded', () => {
  const otpInp = $('authOtpInput');
  if(otpInp){
    otpInp.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
      e.target.value = val;
      if(val.length === 4){
        handleVerifyOtp();
      }
    });
  }
});

// Init
(async function init(){
  WallCore.applyI18n();
  WallCore.updateLayoutUI(cols);
  WallCore.setCarousel(wall, car);
  WallCore.zoneAInit($('barZone'));
  WallCore.zoneCInit($('zoneA'));
  WallCore.fxInit(wall);
  WallCore.verBadge();
  await loadFromServer();
  WallCore.applyI18n();
  WallCore.updateLayoutUI(cols);
  startSSE();
  watchWidth(wall, relayout);
})();
})();
