// WallCore V620.01
(function(){
const VERSION='V620.01';
const MODEL_W=380,MODEL_H=285;   /* 3D 卡的預設尺寸（4:3） */
function verBadge(){if(document.getElementById('verBadge'))return;const d=document.createElement('div');d.id='verBadge';d.className='ver-badge';d.textContent=VERSION;document.body.appendChild(d);}
const STD_W=340,STD_H=220,HTML_W=520,HTML_H=720,GRID=20,MIN=120,MAX=4000,DAY=86400000;
const YT=/(?:youtube\.com\/(?:embed\/|watch\?v=|shorts\/|live\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const ESC={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>ESC[c]);}
function httpUrl(s){try{const u=new URL(String(s));return (u.protocol==='http:'||u.protocol==='https:')?u.href:'';}catch(e){return '';}}
function size(v,d){v=Math.round(Number(v));return Number.isFinite(v)&&v>=MIN&&v<=MAX?v:d;}
function uid(){return Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);}
/* 一般 Spotify 網址自動轉成嵌入網址 */
/* 嵌入碼常省略協定（src="//player.bilibili.com/…"）：一律補成 https */
function absUrl(s){s=String(s||'').trim();return s.startsWith('//')?'https:'+s:s;}
function toEmbed(u){
  try{const x=new URL(u);
    if(x.hostname==='open.spotify.com'){const m=x.pathname.match(/^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|episode|show|album|playlist|artist)\/([A-Za-z0-9]+)/);
      if(m)return 'https://open.spotify.com/embed/'+m[1]+'/'+m[2]+x.search;}
    /* Bilibili：影片頁網址換成官方播放器；播放器預設不自動播放（整面牆一起出聲很吵） */
    if(/(^|\.)bilibili\.com$/.test(x.hostname)&&x.hostname!=='player.bilibili.com'){
      const bv=x.pathname.match(/\/video\/(BV[0-9A-Za-z]{10})/);
      if(bv){const p=x.searchParams.get('p');return 'https://player.bilibili.com/player.html?isOutside=true&bvid='+bv[1]+(p?'&p='+encodeURIComponent(p):'')+'&autoplay=0';}
    }
    if(x.hostname==='player.bilibili.com'){
      if(!x.searchParams.has('autoplay'))x.searchParams.set('autoplay','0');
      if(!x.searchParams.has('isOutside'))x.searchParams.set('isOutside','true');
      return x.href;
    }
  }catch(e){}
  return u;
}
function attrNum(raw,name){const m=String(raw).match(new RegExp('\\s'+name+'\\s*=\\s*["\']?\\s*([0-9.]+)\\s*(%)?','i'));return m?{v:parseFloat(m[1]),pct:!!m[2]}:null;}
function fitOf(o){
  if(isTomb(o))return {t:'fixed',h:250};
  if(o.type==='youtube')return {t:'ratio',r:16/9};
  if(o.type==='html'||o.type==='md')return {t:'auto'};
  if(o.type==='model')return {t:'ratio',r:4/3};
  const raw=String(o._raw||''),u=String(o.url||'');
  const fbm=u.match(/^https:\/\/(?:www\.)?facebook\.com\/plugins\/[^?]+\?(.*)$/);
  if(fbm){const q=new URLSearchParams(fbm[1]),uw=+q.get('width'),uh=+q.get('height'),H=(attrNum(raw,'height')||{}).v;
    if(uw>0&&uh>0)return {t:'lin',r:uh/uw,x:H>uh?Math.round(H-uh):0};}
  const ifr=(raw.match(/<iframe\b[^>]*>/i)||[])[0];
  if(ifr){
    const w=attrNum(ifr,'width'),h=attrNum(ifr,'height');
    if(h&&!h.pct&&h.v>=40){if(w&&!w.pct&&w.v>0)return {t:'ratio',r:w.v/h.v};return {t:'fixed',h:Math.round(h.v)};}
  }
  let host='';try{host=new URL(u).hostname;}catch(e){}
  if(host==='open.spotify.com'&&/\/embed\//.test(u))return {t:'fixed',h:/\/embed\/(track|episode)\//.test(u)?232:352};
  if(host==='w.soundcloud.com')return {t:'fixed',h:166};
  if(/(^|\.)sketchfab\.com$/.test(host)&&/\/embed/.test(u))return {t:'ratio',r:4/3};
  if(host==='embed.podcasts.apple.com')return {t:'fixed',h:/[?&]i=/.test(u)?175:450};
  if(host==='player.vimeo.com'||host==='player.bilibili.com'||(host==='www.dailymotion.com'&&/\/embed\//.test(u)))return {t:'ratio',r:16/9};
  return {t:'page'};
}
const NO_FRAME=/(^|\.)(google\.[a-z.]+|facebook\.com|fb\.com|instagram\.com|threads\.net|x\.com|twitter\.com|linkedin\.com|github\.com|gitlab\.com|amazon\.[a-z.]+|reddit\.com|stackoverflow\.com|stackexchange\.com|medium\.com|apple\.com|openai\.com|chatgpt\.com|claude\.ai|notion\.so|paypal\.com|netflix\.com|discord\.com|tiktok\.com|zhihu\.com|weibo\.com|ebay\.[a-z.]+|dropbox\.com|zoom\.us|youtube\.com|figma\.com|canva\.com)$/i;
const FRAME_OK=/\/(embed|preview|pub|pubhtml|plugins)(\/|\?|$)|[?&](embed|output=embed)/i;
function knownBlocked(u){try{const x=new URL(u);return NO_FRAME.test(x.hostname)&&!/^embed\./i.test(x.hostname)&&!FRAME_OK.test(x.pathname+x.search);}catch(e){return false;}}
function isTomb(o){return o.type==='web'&&(o.emb==='no'||(o.emb!=='yes'&&(o.blk||knownBlocked(o.url))));}
const GAP=18,BORDER=5;
function autoCap(w){return Math.max(420,Math.min(900,Math.round(w*1.25)));}
function fitH(o,w,k){
  const f=o.fit||{t:'page'};let h;
  if(f.t==='fixed')h=f.h+BORDER;
  else if(f.t==='ratio')h=Math.round((w-BORDER)/f.r)+BORDER;
  else if(f.t==='lin')h=Math.round((w-BORDER)*f.r+f.x)+BORDER;
  else if(f.t==='auto')h=o.mh?Math.min(o.mh,o.full?Infinity:autoCap(w))+BORDER:Math.round(Math.min(w*1.2,autoCap(w)));
  else h=Math.round(w*(k===1?0.5625:0.75));
  return Math.max(f.t==='page'?MIN:40,Math.min(MAX,h));
}
function sameOrigin(url){try{return new URL(url).origin===location.origin;}catch(e){return false;}}
function unwrapSrcdoc(h){
  const s=String(h||'').trim();
  if(!/^<iframe\b/i.test(s))return h;
  try{
    const d=new DOMParser().parseFromString(s,'text/html'),k=d.body.children;
    if(k.length!==1)return h;
    const f=k[0];
    if(f.tagName!=='IFRAME'||f.hasAttribute('src')||!f.hasAttribute('srcdoc'))return h;
    if(d.body.textContent.trim())return h;
    return f.getAttribute('srcdoc');
  }catch(e){return h;}
}

// Markdown
const MD_W=420,MD_H=520,MD_MAX=60000;
const MD_RE=/^<md>[\s\S]*<\/md>$/i;
function mdInner(raw){return String(raw||'').trim().replace(/^<md>[ \t]*\r?\n?/i,'').replace(/\r?\n?[ \t]*<\/md>$/i,'');}
function mdTag(md){return '<md>\n'+md+'\n</md>';}
const MD_A=u=>'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">';
function mdInline(s){
  const keep=[],hold=h=>'\u0001'+(keep.push(h)-1)+'\u0002';
  s=String(s).replace(/[\u0001\u0002]/g,'');
  s=s.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g,(m,f,x)=>hold('<code>'+esc(x.trim())+'</code>'));
  s=s.replace(/\\([\\`*_{}\[\]()#+\-.!|~>])/g,(m,ch)=>hold(esc(ch)));
  s=s.replace(/!\[([^\]\n]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g,(m,a,u)=>{
    const x=/^https:\/\//i.test(u)?httpUrl(u):'';
    return x?hold('<img src="'+esc(x)+'" alt="'+esc(a)+'" loading="lazy">'):hold(esc(m));});
  s=s.replace(/\[([^\]\n]+)\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g,(m,a,u)=>{
    const x=httpUrl(u);return x?hold(MD_A(x))+a+hold('</a>'):m;});
  s=s.replace(/<(https?:\/\/[^\s<>]+)>/g,(m,u)=>{const x=httpUrl(u);return x?hold(MD_A(x)+esc(u)+'</a>'):m;});
  s=s.replace(/(^|[\s(（])(https?:\/\/[^\s<>()（）]*[^\s<>()（）.,;:!?'"。，、！？])/g,(m,p,u)=>{const x=httpUrl(u);return x?p+hold(MD_A(x)+esc(u)+'</a>'):m;});
  s=esc(s)
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g,'<strong>$1</strong>')
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g,'$1<strong>$2</strong>')
    .replace(/\*(?=[^\s*])([^*]*?[^\s*])\*/g,'<em>$1</em>')
    .replace(/(^|[^\w])_(?=[^\s_])([^_]*?[^\s_])_(?!\w)/g,'$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g,'<del>$1</del>')
    .replace(/(?: {2,}|\\)\n/g,'<br>');
  return s.replace(/\u0001(\d+)\u0002/g,(m,i)=>keep[+i]);
}
const MD_FENCE=/^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/,MD_HR=/^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
      MD_HD=/^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/,MD_Q=/^ {0,3}>/,MD_LI=/^( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/,
      MD_SETEXT=/^ {0,3}(=+|-+)[ \t]*$/,MD_TSEP=/^ *\|? *:?-+:? *(\| *:?-+:? *)*\|? *$/;
function mdBlockStart(l){return MD_FENCE.test(l)||MD_HD.test(l)||MD_Q.test(l)||MD_HR.test(l)||MD_LI.test(l);}
function mdCells(s){return s.trim().replace(/^\|/,'').replace(/(^|[^\\])\|$/,'$1').split(/(?<!\\)\|/).map(x=>x.trim().replace(/\\\|/g,'|'));}
function mdRender(src,depth){
  depth=depth||0;if(depth>12)return '<p>'+esc(src)+'</p>';
  const L=String(src).replace(/\r\n?/g,'\n').replace(/\t/g,'    ').split('\n'),out=[],blank=s=>!s.trim();
  let i=0,m;
  while(i<L.length){
    const l=L[i];
    if(blank(l)){i++;continue;}
    if((m=l.match(MD_FENCE))){
      const f=m[1],buf=[];i++;
      while(i<L.length&&!(L[i].trim().startsWith(f[0].repeat(f.length))&&!L[i].trim().replace(/[`~]/g,''))){buf.push(L[i]);i++;}
      i++;out.push('<pre><code'+(m[2]?' class="lang-'+esc(m[2])+'"':'')+'>'+esc(buf.join('\n'))+'</code></pre>');continue;
    }
    if((m=l.match(MD_HD))){const n=m[1].length;out.push('<h'+n+'>'+mdInline(m[2]||'')+'</h'+n+'>');i++;continue;}
    if(MD_HR.test(l)){out.push('<hr>');i++;continue;}
    if(MD_Q.test(l)){
      const buf=[];
      while(i<L.length&&!blank(L[i])&&(MD_Q.test(L[i])||!mdBlockStart(L[i]))){buf.push(L[i].replace(/^ {0,3}> ?/,''));i++;}
      out.push('<blockquote>'+mdRender(buf.join('\n'),depth+1)+'</blockquote>');continue;
    }
    if(l.includes('|')&&i+1<L.length&&L[i+1].includes('-')&&MD_TSEP.test(L[i+1])){
      const al=mdCells(L[i+1]).map(x=>/^:-+:$/.test(x)?'center':/-:$/.test(x)?'right':/^:/.test(x)?'left':'');
      const cell=(tag,x,k)=>'<'+tag+(al[k]?' style="text-align:'+al[k]+'"':'')+'>'+mdInline(x)+'</'+tag+'>';
      let h='<table><thead><tr>'+mdCells(l).map((x,k)=>cell('th',x,k)).join('')+'</tr></thead><tbody>';
      i+=2;
      while(i<L.length&&!blank(L[i])&&L[i].includes('|')){h+='<tr>'+mdCells(L[i]).map((x,k)=>cell('td',x,k)).join('')+'</tr>';i++;}
      out.push('<div class="tw">'+h+'</tbody></table></div>');continue;
    }
    if((m=l.match(MD_LI))){
      const ord=/\d/.test(m[2]),base=m[1].length,items=[];let loose=false;
      while(i<L.length){
        const x=L[i],mm=x.match(MD_LI);
        if(mm&&mm[1].length<=base+1&&/\d/.test(mm[2])===ord){items.push({pad:mm[1].length+mm[2].length+1,lines:[mm[3]]});i++;continue;}
        if(mm&&mm[1].length<=base+1)break;
        const cur=items[items.length-1];
        if(blank(x)){
          const nx=L[i+1];
          if(nx!==undefined&&!blank(nx)&&(/^ /.test(nx)&&nx.match(/^ */)[0].length>base||(nx.match(MD_LI)&&nx.match(MD_LI)[1].length<=base+1))){cur.lines.push('');loose=true;i++;continue;}
          break;
        }
        const ind=x.match(/^ */)[0].length;
        if(ind>base||!mdBlockStart(x)){cur.lines.push(x.slice(Math.min(ind,cur.pad)));i++;continue;}
        break;
      }
      const start=ord?parseInt(m[2],10):1;
      out.push((ord?'<ol'+(start!==1?' start="'+start+'"':'')+'>':'<ul>')+items.map(it=>{
        let first=it.lines[0],task='';
        const tk=first.match(/^\[([ xX])\][ \t]+/);
        if(tk){task='<input type="checkbox" disabled'+(tk[1]===' '?'':' checked')+'> ';first=first.slice(tk[0].length);}
        let body=mdRender([first].concat(it.lines.slice(1)).join('\n'),depth+1);
        if(!loose)body=body.replace(/^<p>([\s\S]*?)<\/p>/,'$1');
        return '<li'+(task?' class="task"':'')+'>'+task+body+'</li>';
      }).join('')+(ord?'</ol>':'</ul>'));
      continue;
    }
    const buf=[l];i++;
    while(i<L.length&&!blank(L[i])&&!MD_SETEXT.test(L[i])&&!mdBlockStart(L[i])){buf.push(L[i]);i++;}
    if(i<L.length&&MD_SETEXT.test(L[i])){const n=L[i].trim()[0]==='='?1:2;out.push('<h'+n+'>'+mdInline(buf.join('\n'))+'</h'+n+'>');i++;continue;}
    out.push('<p>'+mdInline(buf.join('\n'))+'</p>');
  }
  return out.join('\n');
}
const MD_CSS="html{scrollbar-width:thin;scrollbar-color:#bbb transparent}html,body{margin:0;background:#fff}::-webkit-scrollbar{width:7px}::-webkit-scrollbar-thumb{background:#c9c5bd;border-radius:9px}body{padding:18px 20px 46px;color:#111;font:14px/1.7 -apple-system,BlinkMacSystemFont,\"Segoe UI\",\"PingFang TC\",\"Microsoft JhengHei\",\"Noto Sans TC\",\"Noto Sans\",sans-serif;overflow-wrap:anywhere}"
 +".md::before{content:\"\";float:left;width:40px;height:40px;margin:-18px 0 0 -20px;shape-outside:polygon(0 0,100% 0,0 100%)}"
 +".md>:first-child{margin-top:0}.md>:last-child{margin-bottom:0}h1,h2,h3,h4,h5,h6{line-height:1.3;margin:1.1em 0 .45em;font-weight:900}h1{font-size:1.6em}h2{font-size:1.32em}h3{font-size:1.12em}h4,h5,h6{font-size:1em}"
 +"p,ul,ol,blockquote,pre,.tw{margin:0 0 .8em}ul,ol{padding-left:1.4em}li+li{margin-top:.2em}li.task{list-style:none;margin-left:-1.3em}li.task input{margin:0 .4em 0 0;vertical-align:-1px;accent-color:#0E7C7B}"
 +"a{color:#0E7C7B;font-weight:700;text-decoration:underline;text-underline-offset:2px}img{max-width:100%;height:auto;border-radius:10px;display:block;margin:.4em 0}"
 +"code{font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#F2EFE9;border-radius:5px;padding:.1em .35em}pre{background:#111;color:#F7F5F1;border-radius:12px;padding:12px 14px;overflow:auto}pre code{background:none;padding:0;color:inherit}"
 +"blockquote{border-left:4px solid #FFE27A;background:#FFFBEA;padding:.5em .9em;border-radius:0 10px 10px 0}blockquote>:last-child{margin-bottom:0}hr{border:0;border-top:2px dashed #ccc;margin:1.2em 0}"
 +".tw{overflow-x:auto}table{border-collapse:collapse;min-width:60%;font-size:13px}th,td{border:1.5px solid #111;padding:5px 9px}th{background:#FFE27A;font-weight:900}tr:nth-child(even) td{background:#F7F5F1}del{opacity:.6}";
function mdDoc(md){
  return '<!doctype html><html><head><meta charset="utf-8">'
    +'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+MD_CSS+'</style></head>'
    +'<body><article class="md">'+mdRender(md)+'</article></body></html>';
}
function mdTitle(md){
  const h=String(md).match(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/m);
  const s=h?h[1]:(String(md).split('\n').find(x=>x.trim())||'');
  return s.replace(/[*_`~>#\[\]]|\(https?:[^)]*\)/g,'').trim().slice(0,80);
}

const SOLO_OK=/^(DIV|P|SPAN|A|B|STRONG|EM|I|U|BR|SMALL|IFRAME|FIGURE|FIGCAPTION|CENTER|SECTION|H[1-6])$/;
function soloIframe(h){
  const s=String(h||'').trim();
  if(!/^<[a-z]/i.test(s)||!/<iframe\b/i.test(s))return null;
  try{
    const d=new DOMParser().parseFromString(s,'text/html'),fs=d.querySelectorAll('iframe');
    if(fs.length!==1||d.head.children.length)return null;
    if([...d.body.querySelectorAll('*')].some(e=>!SOLO_OK.test(e.tagName)))return null;
    const f=fs[0],src=httpUrl(absUrl(f.getAttribute('src')));
    if(!src||f.hasAttribute('srcdoc'))return null;
    return {src,title:(f.getAttribute('title')||'').trim().slice(0,200)};
  }catch(e){return null;}
}

// Normalize
function normalize(o){
  if(!o||typeof o!=='object')return null;
  const raw=String(o._raw||o.html||o.url||'');
  const _id=/^[a-z0-9]{6,32}$/i.test(String(o._id||''))?o._id:uid();
  const extra={manual:!!o.manual,zone:(o.zone==='a'||o.zone==='c')?o.zone:'b'};
  const px=Number(o.px),py=Number(o.py);
  if(o.free&&Number.isFinite(px)&&Number.isFinite(py)&&px>=0&&py>=0&&px<20000&&py<200000){extra.free=true;extra.px=Math.round(px);extra.py=Math.round(py);}
  const at=Number(o.at);if(at>946684800000&&at<Date.now()+DAY)extra.at=at;
  const pub=Number(o.pub);if(pub>0&&pub<Date.now()+2*DAY)extra.pub=pub;
  if(typeof o.title==='string'&&o.title.trim())extra.title=o.title.trim().slice(0,200);
  let tg=o.tags;if(typeof tg==='string')tg=tg.split(',');
  if(Array.isArray(tg)){tg=tg.map(x=>String(x).trim().replace(/^#/,'').slice(0,40)).filter(Boolean).slice(0,20);if(tg.length)extra.tags=tg;}
  const du=Number(o.dur);if(du>0&&du<172800)extra.dur=Math.round(du);if(o.emb==='no'||o.emb==='yes')extra.emb=o.emb;if(o.blk===true)extra.blk=true;if(o.pic===true)extra.pic=true;const sp=Number(o.span),rh=Number(o.rh);
  if(Number.isInteger(sp)&&sp>=1&&sp<=8)extra.span=sp;if(rh>=0.3&&rh<=3)extra.rh=rh;const mh=Number(o.mh);if(mh>0&&mh<MAX)extra.mh=Math.round(mh);
  const done=r=>r?Object.assign(r,extra,{fit:fitOf(r)}):null;
  if(o.type==='youtube'){
    const id=/^[a-zA-Z0-9_-]{11}$/.test(String(o.id||''))?o.id:(String(o.embedSrc||o.url||raw).match(YT)||[])[1];
    return done(id?{_id,_raw:raw,type:'youtube',id,url:String(o.url||raw),w:size(o.w,STD_W),h:size(o.h,STD_H)}:null);
  }
  if(o.type==='model'){
    const m=o.mdl||{},d=String(m.d||''),u=/^https:\/\//i.test(String(m.u||''))?httpUrl(m.u):'',e=String(m.e||'').toLowerCase();
    const inl=/^data:[^,]{0,120},/.test(d);
    if(!M3D_OK.test(e)||!(inl||u))return null;
    const mdl=inl?{d,e,n:String(m.n||'').slice(0,120)}:{u,e,n:String(m.n||'').slice(0,120)};
    const r=done({_id,_raw:raw&&(raw.charAt(0)==='<'||mdl.u)?raw:modelTag(mdl),type:'model',mdl,
      html:modelDoc(mdl),w:size(o.w,MODEL_W),h:size(o.h,MODEL_H)});
    if(r)Object.defineProperty(r,'toJSON',{value:function(){
      const c=Object.assign({},this);delete c.html;delete c.fit;return c;}});
    return r;
  }
  if(o.type==='md'){
    const md=typeof o.md==='string'?o.md:mdInner(raw);
    if(!md.trim()||md.length>MD_MAX)return null;
    const r=done({_id,_raw:MD_RE.test(raw.trim())?raw.trim():mdTag(md),type:'md',md,html:mdDoc(md),w:size(o.w,MD_W),h:size(o.h,MD_H)});
    if(r)Object.defineProperty(r,'toJSON',{value:function(){
      const c=Object.assign({},this);delete c.html;delete c.fit;delete c.md;return c;}});
    return r;
  }
  if(o.type==='html'){
    const html=unwrapSrcdoc(o.html||raw);
    const solo=soloIframe(html);
    if(solo){
      const base=Object.assign({},o,{_id,_raw:raw||html,html:undefined});
      if(!base.title&&solo.title)base.title=solo.title;
      const yt=solo.src.match(YT);
      return normalize(yt?Object.assign(base,{type:'youtube',id:yt[1],url:solo.src}):Object.assign(base,{type:'web',url:solo.src}));
    }
    return done(html.trim()?{_id,_raw:raw||html,type:'html',html,w:size(o.w,HTML_W),h:size(o.h,HTML_H)}:null);
  }
  const url=toEmbed(httpUrl(o.url||raw));
  return done(url?{_id,_raw:raw||url,type:'web',url,w:size(o.w,STD_W),h:size(o.h,STD_H)}:null);
}

function fitPluginUrl(u,w){
  try{const x=new URL(u);
    if(!w||!/(^|\.)facebook\.com$/.test(x.hostname)||!/^\/plugins\//.test(x.pathname))return u;
    const ow=+x.searchParams.get('width'),oh=+x.searchParams.get('height');
    x.searchParams.set('width',Math.round(w));if(ow>0&&oh>0)x.searchParams.set('height',Math.round(oh*w/ow));
    return x.href;
  }catch(e){return u;}
}
function frameHTML(o,w){
  if(o.type==='youtube')return `<iframe class="embed" src="https://www.youtube-nocookie.com/embed/${esc(o.id)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
  if(o.type==='html')return `<iframe class="html-frame" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation" loading="lazy"></iframe>`;
  if(o.type==='model')return `<iframe class="html-frame m3d" sandbox="allow-scripts" loading="lazy"></iframe>`;
  if(o.type==='md')return `<iframe class="html-frame md" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" loading="lazy"></iframe>`;
  const sb=sameOrigin(o.url)?'allow-scripts allow-popups allow-forms':'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation';
  const cls=o.fit&&o.fit.t!=='page'?' class="embed"':'';
  return `<iframe${cls} src="${esc(fitPluginUrl(o.url,w))}" sandbox="${sb}" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; xr-spatial-tracking; accelerometer; gyroscope; web-share" allowfullscreen></iframe>`;
}

const TOMB_SVG='<svg class="tomb-img" viewBox="0 0 120 104" aria-hidden="true">'
 +'<ellipse cx="60" cy="98" rx="54" ry="6" fill="#0A7A34" opacity=".22"/>'
 +'<path d="M30 97V44a30 30 0 0 1 60 0v53z" fill="#D6D2CA" stroke="#111" stroke-width="3" stroke-linejoin="round"/>'
 +'<path d="M38 94V46a22 22 0 0 1 22-22" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>'
 +'<text x="60" y="56" text-anchor="middle" font-size="15" font-weight="900" fill="#111" opacity=".72" font-family="Georgia,serif">R.I.P.</text>'
 +'<path d="M46 67h28M50 76h20" stroke="#111" stroke-width="2.5" stroke-linecap="round" opacity=".3"/>'
 +'<path d="M81 27l-6 9 5 5-5 8" fill="none" stroke="#111" stroke-width="2" stroke-linejoin="round" opacity=".45"/>'
 +'<path d="M20 98h80" stroke="#111" stroke-width="3" stroke-linecap="round"/>'
 +'<path d="M14 98l4-9 3 9 3-11 3 11 3-8 2 8zM88 98l3-8 3 8 3-11 3 11 4-9 3 9z" fill="#0A7A34" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/>'
 +'<path d="M36 97v-10" stroke="#0A7A34" stroke-width="2.5" stroke-linecap="round"/><circle cx="36" cy="85" r="4.5" fill="#FFE27A" stroke="#111" stroke-width="1.5"/>'
 +'</svg>';
function hostOf(u){try{return new URL(u).hostname.replace(/^www\./,'');}catch(e){return '';}}
function tombHTML(o){
  return '<div class="tomb-body">'+TOMB_SVG+'<div class="tomb-label">Non-Embeddable</div>'
    +'<div class="tomb-host">'+esc(hostOf(o.url))+'</div><div class="tomb-note" data-i18n="tombNote">'+esc(t('tombNote'))+'</div>'
    +'<a class="tomb-link" href="'+esc(o.url)+'" target="_blank" rel="noopener noreferrer"><span data-i18n="openTab">'+esc(t('openTab'))+'</span><span aria-hidden="true">↗</span></a></div>';
}
function cornerHTML(o){
  const co=!!o.guest,cls=co?'co '+(o.ok?'ok':'pend'):'own';
  return '<div class="corner '+cls+'" aria-hidden="true"><svg viewBox="0 0 52 52"><path class="c-fill" d="M0 0H52L0 52Z"/><path class="c-edge" d="M52 0L0 52"/></svg><span class="c-lbl">'+(co?'Co-WiKi':'WiKi')+'</span></div>';
}
function cardHTML(o,ro){
  const tomb=isTomb(o);
  const tog=!ro&&o.type==='web'?'<button class="tog" data-act="emb" data-i18n-aria="'+(tomb?'tryEmbed':'markTomb')+'" aria-label="'+esc(t(tomb?'tryEmbed':'markTomb'))+'" title="'+esc(t(tomb?'tryEmbed':'markTomb'))+'">'+(tomb?'↻':'🪦')+'</button>':'';
  const ins='<button class="ins" data-act="ins" title="'+esc(t('insCard'))+'" aria-label="'+esc(t('insCard'))+'" data-i18n-aria="insCard">\uFF0B</button>'
    +(ro&&o.guest&&!o.ok?'<button class="gdel" data-act="gdel" title="'+esc(t('insDel'))+'" aria-label="'+esc(t('insDel'))+'" data-i18n-aria="insDel">\u2715</button>':'');
  const grips='<div class="side-anchor"></div><div class="resize-anchor"></div>';
  const fold=o.fit&&o.fit.t==='auto'?'<div class="fold"><button type="button" class="fold-btn" data-i18n="foldMore">'+esc(t('foldMore'))+'</button></div>':'';
  const lnk=ro&&o.ref?'<button class="lnk" data-act="link" title="'+esc(t('cardLink'))+'" aria-label="'+esc(t('cardLink'))+'" data-i18n-aria="cardLink">🔗</button>':'';
  const tools=ins+lnk+(ro?grips:tog+'<button class="del" data-act="del" aria-label="'+esc(t('del'))+'">✕</button><button class="edit" data-act="edit" aria-label="'+esc(t('edit'))+'">✎</button><div class="move-anchor" title="'+esc(t('moveCard'))+'"></div>'+grips);
  return `<div class="item${tomb?' tomb':''}${o.guest?' guest '+(o.ok?'ok':'pending'):''}" data-id="${esc(o._id)}"${o.ref?' data-ref="'+esc(o.ref)+'"':''} style="width:${o.w}px;height:${o.h}px">${cornerHTML(o)}${ro?'':'<div class="corner-dim">'+o.w+'×'+o.h+'</div>'}${tomb?tombHTML(o):(LAZY?phHTML(o):frameHTML(o))}${fold}${tools}</div>`;
}

// 3D Model Constants
const M3D_EXT=/\.(glb|gltf|stl|obj)$/i;
const M3D_MIME={glb:'model/gltf-binary',gltf:'model/gltf+json',stl:'model/stl',obj:'model/obj'};
const M3D_OK=/^(glb|gltf|stl|obj)$/;
const M3D_CSS="html,body{margin:0;height:100%;background:transparent}#w{position:relative;width:100%;height:100vh;background:radial-gradient(120% 120% at 50% 0%,#ffffff 0%,#EAE7E1 100%)}canvas{width:100%;height:100%;display:block;cursor:grab;touch-action:none}#n{display:none;position:absolute;inset:0;padding:22px;align-items:center;justify-content:center;text-align:center;font-weight:700;color:#666}#b{display:none;position:absolute;right:9px;bottom:9px;background:rgba(17,17,17,.82);color:#fff;font-size:10px;font-weight:800;padding:3px 8px;border-radius:99px}";
const VIEWER3D=`(function(){var C=document.getElementById('c'),NOTE=document.getElementById('n'),BADGE=document.getElementById('b');var EXT=(C.getAttribute('data-ext')||'').toLowerCase();NOTE.textContent='3D Model ('+EXT.toUpperCase()+')';NOTE.style.display='flex';BADGE.textContent=EXT.toUpperCase();BADGE.style.display='block';})();`;
function modelDoc(m){
  return '<!doctype html><html><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+M3D_CSS+'</style></head>'
    +'<body><div id="w"><canvas id="c" data-ext="'+esc(m.e)+'" data-src="'+esc(m.d||m.u)+'"></canvas>'
    +'<div id="n"></div><div id="b"></div></div><script>'+VIEWER3D+'<\/script></body></html>';
}
function modelTag(m){
  return '<model type="'+esc(m.e)+'" name="'+esc(m.n||'')+'" src="'+esc(m.d||m.u)+'"></model>';
}
function parseModelTag(s){
  const g=k=>((s.match(new RegExp('\\b'+k+'=["\']([^"\']*)["\']','i'))||[])[1]||'');
  const d=g('src').replace(/&amp;/g,'&'),e=g('type').toLowerCase()||(d.match(/^data:model\/(gltf-binary|gltf\+json|stl|obj)/i)||[])[1]||'';
  let ex=e==='gltf-binary'?'glb':e==='gltf+json'?'gltf':e;
  if(/^https:\/\//i.test(d)){
    const u=httpUrl(d);if(!u)return null;
    if(!ex)ex=modelExt(new URL(u).pathname);
    return M3D_OK.test(ex)?{u,e:ex,n:g('name')||decodeURIComponent(new URL(u).pathname.split('/').pop()||'')}:null;
  }
  return M3D_OK.test(ex)&&/^data:[^,]{0,120},/.test(d)?{d,e:ex,n:g('name')}:null;
}
const isModelFile=f=>M3D_EXT.test(f&&f.name||'');
const modelExt=name=>String(name||'').toLowerCase().replace(/^.*\./,'');

function parseOne(raw){
  raw=String(raw||'').trim();if(!raw)return null;
  if(MD_RE.test(raw))return normalize({_raw:raw,type:'md'});
  if(raw.startsWith('<')){
    if(/^<model\b/i.test(raw)){const m=parseModelTag(raw);if(m)return normalize({_raw:raw,type:'model',mdl:m});}
    const src=((raw.match(/\bsrc=["']([^"']+)["']/i)||[])[1]||'').replace(/&amp;/g,'&');
    const yt=src.match(YT);
    if(yt)return normalize({_raw:raw,type:'youtube',id:yt[1],url:src});
    if(/^<iframe\b[^>]*>\s*<\/iframe>$/i.test(raw)){const u=httpUrl(absUrl(src));if(u)return normalize({_raw:raw,type:'web',url:u});}
    return normalize({_raw:raw,type:'html',html:raw});
  }
  const yt=raw.match(YT);if(yt)return normalize({_raw:raw,type:'youtube',id:yt[1],url:raw});
  let s=raw;
  if(!/^https?:\/\//i.test(s)){
    if(/\s/.test(s)||!/^[^\/\s]+\.[a-z]{2,}(\/|:|\?|$)/i.test(s))return null;
    s='https://'+s;
  }
  const u=httpUrl(s);if(!u)return null;
  try{const x=new URL(u);if(x.protocol==='https:'&&M3D_EXT.test(x.pathname))
    return normalize({_raw:raw,type:'model',mdl:{u,e:modelExt(x.pathname),n:decodeURIComponent(x.pathname.split('/').pop())}});}catch(e){}
  return normalize({_raw:raw,type:'web',url:u});
}

const WALL_RE=/^W\d{7,12}$/,REF_RE=/^(Z-[a-z0-9]{1,13}(-\d{1,4})?|C\d{4,})$/i;
function ownerRefs(list){
  const seen=new Map();
  list.forEach(o=>{if(o.guest)return;const h='Z-'+rawHash(o._raw),n=(seen.get(h)||0)+1;seen.set(h,n);o.ref=n>1?h+'-'+n:h;});
}
function rawHash(s){
  let x=2166136261;s=String(s||'');
  for(let i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,16777619);}
  return (x>>>0).toString(36);
}

function resizeStart(a,el,o,side,ev,onDone){
  ev.preventDefault();
  try{a.setPointerCapture(ev.pointerId);}catch(e){}
  document.body.classList.add('resizing');el.classList.add('dragging');
  const sx=ev.clientX,sy=ev.clientY,sw=el.offsetWidth,sh=el.offsetHeight;
  const locked=o.fit&&o.fit.t!=='page';let free=false;
  const move=e2=>{
    o.w=Math.max(MIN,Math.round((sw+e2.clientX-sx)/GRID)*GRID);
    free=side?false:(!locked||e2.shiftKey);
    o.h=free?Math.max(MIN,Math.round((sh+e2.clientY-sy)/GRID)*GRID)
            :(locked?fitH(o,o.w,2):Math.max(MIN,Math.round(sh*(o.w/Math.max(1,sw))/GRID)*GRID));
    applySize(el,o);
  };
  const up=()=>{
    a.removeEventListener('pointermove',move);a.removeEventListener('pointerup',up);
    a.removeEventListener('pointercancel',up);
    document.body.classList.remove('resizing');el.classList.remove('dragging');
    o.manual=locked&&free;o.span=0;
    if(onDone)onDone();
  };
  a.addEventListener('pointermove',move);a.addEventListener('pointerup',up);
  a.addEventListener('pointercancel',up);
}

let insBox=null;
function insClose(){if(insBox){insBox.remove();insBox=null;}}
function insertDialog(guest,onSave){
  insClose();
  const box=document.createElement('div');
  box.className='ins-modal';box.id='insModal';
  box.innerHTML='<div class="ins-card" role="dialog" aria-modal="true" aria-labelledby="insHead">'
    +'<b id="insHead" data-i18n="insTitle"></b>'
    +'<p class="ins-hint" data-i18n="'+(guest?(SYNC?(SYNC_UP?'insHintLive':'insDown'):'insHintGuest'):'insHintOwner')+'"></p>'
    +'<textarea id="insTa" spellcheck="false" data-i18n-ph="insPh" data-i18n-aria="insTitle"></textarea>'
    +'<div class="ins-kinds"><button type="button" class="ins-kind" id="insMd" data-i18n="insMd"></button><span class="ins-kinds-note" data-i18n="insKinds"></span></div>'
    +'<div class="ins-err" id="insErr" role="alert"></div>'
    +'<div class="ins-go"><button type="button" class="ins-btn" id="insNo" data-i18n="insCancel"></button>'
    +'<button type="button" class="ins-btn on" id="insYes" data-i18n="insSave"></button></div></div>';
  document.body.appendChild(box);insBox=box;
  applyI18n();
  const ta=box.querySelector('#insTa'),err=box.querySelector('#insErr');
  const btnYes=box.querySelector('#insYes'),btnNo=box.querySelector('#insNo');
  box.addEventListener('click',e=>{if(e.target===box)insClose();});
  btnNo.addEventListener('click',insClose);
  box.querySelector('#insMd').addEventListener('click',()=>{
    const v=ta.value.trim();
    if(!MD_RE.test(v)){ta.value=mdTag(v||t('insMdTpl'));}
    ta.focus();const p=ta.value.indexOf('\n')+1;ta.setSelectionRange(p,ta.value.length-6);err.textContent='';
  });
  const commit=()=>{
    const v=ta.value.trim();
    if(MD_RE.test(v)&&mdInner(v).length>MD_MAX){err.textContent=t('insBig');ta.focus();return;}
    const o=parseOne(v);
    if(!o){err.textContent=t('insBad');ta.focus();return;}
    const r=onSave(o);
    if(!r||typeof r.then!=='function'){insClose();return;}
    btnYes.disabled=true;btnNo.disabled=true;err.textContent='';
    const back=why=>{btnYes.disabled=false;btnNo.disabled=false;err.textContent=t(why||'insBusy');ta.focus();};
    r.then(ok=>{if(ok===true)insClose();else back(typeof ok==='string'?ok:'insBusy');},()=>back('insDown'));
  };
  btnYes.addEventListener('click',commit);
  ta.addEventListener('input',()=>{err.textContent='';});
  box.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.key==='Escape'){e.preventDefault();insClose();}
    else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();commit();}
  });
  setTimeout(()=>ta.focus(),30);
}

// Server Synchronization
let SYNC='',SYNC_ES=null,SYNC_UP=false;
function setWallSync(u){
  SYNC=httpUrl(u)?String(u).replace(/\/+$/,''):'';
  if(SYNC&&!FRAME_CHECK)setFrameCheck(SYNC+'/api/frame-check');
}
function wallMe(){
  let v='';try{v=localStorage.getItem('wall_me')||'';}catch(e){}
  if(!/^[a-z0-9-]{8,64}$/i.test(v)){
    v=(crypto&&crypto.randomUUID)?crypto.randomUUID():String(Math.random()).slice(2)+Date.now().toString(36);
    try{localStorage.setItem('wall_me',v);}catch(e){}
  }
  return v;
}
function ownerToken(){try{return localStorage.getItem('wall_owner')||'';}catch(e){return '';}}
function setOwnerToken(v){try{v?localStorage.setItem('wall_owner',v):localStorage.removeItem('wall_owner');}catch(e){}}
function syncHeaders(json){
  const hd={'x-wall-me':wallMe()};
  if(json)hd['content-type']='application/json';
  const o=ownerToken();if(o)hd['x-wall-owner']=o;
  return hd;
}
const syncBase=id=>SYNC+'/api/wall/'+encodeURIComponent(id);
function syncAdd(id,card){
  return fetch(syncBase(id)+'/cards',{method:'POST',headers:syncHeaders(true),body:JSON.stringify(card)})
    .then(r=>r.json().then(j=>({ok:r.ok,status:r.status,j})));
}
function syncDrop(id,cid){
  return fetch(syncBase(id)+'/cards/'+encodeURIComponent(cid),{method:'DELETE',headers:syncHeaders(false)})
    .then(r=>({ok:r.ok,status:r.status}));
}
function syncApprove(id,cid){
  return fetch(syncBase(id)+'/cards/'+encodeURIComponent(cid)+'/approve',{method:'POST',headers:syncHeaders(false)})
    .then(r=>({ok:r.ok,status:r.status}));
}
function syncReview(id){
  return fetch(syncBase(id)+'/review',{headers:syncHeaders(false)})
    .then(r=>r.ok?r.json():Promise.reject(r.status));
}
function syncStream(id,on){
  if(!SYNC||typeof EventSource==='undefined')return null;
  let es;
  try{es=new EventSource(syncBase(id)+'/stream');}catch(e){return null;}
  SYNC_ES=es;
  es.addEventListener('sync',e=>{try{on('sync',JSON.parse(e.data));}catch(x){}});
  es.addEventListener('card',e=>{try{on('card',JSON.parse(e.data));}catch(x){}});
  es.addEventListener('drop',e=>{try{on('drop',JSON.parse(e.data));}catch(x){}});
  es.addEventListener('promote',e=>{try{on('promote',JSON.parse(e.data));}catch(x){}});
  es.addEventListener('error',()=>{SYNC_UP=false;on('down',null);});
  es.addEventListener('open',()=>{SYNC_UP=true;on('up',null);});
  addEventListener('pagehide',()=>{try{es.close();}catch(x){}});
  return es;
}
function syncBtnHTML(){
  return '<span id="syncDot" class="pill sync" hidden title=""><span class="mi">●</span></span>'
        +'<button id="revBtn" class="pill rev" hidden data-i18n-aria="revTitle"><span class="mi">🛡</span></button>';
}

const REPORT='<script>(function(){var last=-1;function m(){var b=document.body;if(!b)return;var r=b.getBoundingClientRect(),h=r.bottom+(parseFloat(getComputedStyle(b).marginBottom)||0);for(var i=0;i<b.children.length;i++){var c=b.children[i].getBoundingClientRect().bottom;if(c>h)h=c;}h=Math.ceil(h+(window.scrollY||0));if(Math.abs(h-last)>1){last=h;parent.postMessage({__wallH:h},"*");}}addEventListener("load",m);if(window.ResizeObserver&&document.body)new ResizeObserver(m).observe(document.body);setTimeout(m,60);setTimeout(m,900);setTimeout(m,3000);})();<\/script>';
function srcdocOf(o){return o.type==='model'?o.html:o.html+REPORT;}
const measureCbs=[];
window.addEventListener('message',e=>{
  const d=e.data;if(!d||typeof d.__wallH!=='number'||!(d.__wallH>0))return;
  const f=[...document.querySelectorAll('iframe.html-frame')].find(x=>x.contentWindow===e.source);if(!f)return;
  const el=f.closest('.item');
  if(el)measureCbs.forEach(cb=>cb(el.dataset.id.replace(/^[ac]-/,''),Math.min(Math.round(d.__wallH),MAX-BORDER)));
});
function onMeasure(cb){measureCbs.push(cb);}

let FRAME_CHECK='';const asked=new Set();
function setFrameCheck(u){FRAME_CHECK=httpUrl(u)?u:'';}
function checkFrames(list,onBlocked){
  if(!FRAME_CHECK)return;
  list.forEach(o=>{
    if(o.type!=='web'||o.emb||o.blk||isTomb(o)||(o.fit&&o.fit.t!=='page')||asked.has(o.url))return;
    asked.add(o.url);
    fetch(FRAME_CHECK+(FRAME_CHECK.includes('?')?'&':'?')+'url='+encodeURIComponent(o.url))
      .then(r=>r.ok?r.json():null).then(j=>{if(j&&j.embeddable===false){o.blk=true;o.fit=fitOf(o);onBlocked(o);}}).catch(()=>{});
  });
}

const LAZY='IntersectionObserver' in window;
let nearIO=null,farIO=null,qRaf=0;const mountQ=new Set();
function phHTML(o){
  const k={video:'▶',audio:'♪',html:'</>',page:'🌐',model:'◈',md:'M↓'}[kindOf(o)]||'🌐';
  const lbl=o.type==='md'?'Markdown':o.type==='model'?(o.mdl&&o.mdl.e||'3d').toUpperCase()
    :o.type==='html'?'HTML':o.type==='youtube'?'youtube.com':hostOf(o.url);
  return '<div class="ph" aria-hidden="true"><span class="ph-i">'+k+'</span><span class="ph-h">'+esc(lbl)+'</span></div>';
}
function mount(el){
  if(el._mounted||!el._o)return;const ph=el.querySelector('.ph');if(!ph)return;
  el._pw=el.clientWidth-BORDER;
  const tp=document.createElement('template');tp.innerHTML=frameHTML(el._o,el._pw);
  const f=tp.content.firstElementChild;if(f.classList.contains('html-frame'))f.srcdoc=srcdocOf(el._o);
  ph.replaceWith(f);el._mounted=true;
}
function unmount(el){
  if(!el._mounted||el._keep||el.classList.contains('engaged'))return;
  const f=el.querySelector('iframe');if(!f)return;
  const tp=document.createElement('template');tp.innerHTML=phHTML(el._o);
  f.replaceWith(tp.content.firstElementChild);el._mounted=false;
}
function pump(){
  if(qRaf)return;
  qRaf=requestAnimationFrame(()=>{
    qRaf=0;
    if(document.body.classList.contains('shuffling'))return;
    let n=0;
    for(const el of mountQ){mountQ.delete(el);if(!el.isConnected||!(el._vis||el._keep))continue;mount(el);if(++n>=3)break;}
    if(mountQ.size)pump();
  });
}
function observeCard(el){
  if(!nearIO){
    nearIO=new IntersectionObserver(es=>es.forEach(e=>{
      const el=e.target;el._vis=e.isIntersecting;
      if(e.isIntersecting){clearTimeout(el._unT);if(!document.body.classList.contains('shuffling')){mountQ.add(el);pump();}}
    }),{rootMargin:'100% 50%'});
    farIO=new IntersectionObserver(es=>es.forEach(e=>{
      const el=e.target;clearTimeout(el._unT);
      if(!e.isIntersecting)el._unT=setTimeout(()=>unmount(el),10000);
    }),{rootMargin:'300% 200%'});
    addEventListener('blur',()=>setTimeout(()=>{const f=document.activeElement;if(f&&f.tagName==='IFRAME'){const it=f.closest('.item');if(it)it.classList.add('engaged');}},0));
  }
  nearIO.observe(el);farIO.observe(el);
}
function dropCard(el){if(nearIO){nearIO.unobserve(el);farIO.unobserve(el);}clearTimeout(el._unT);mountQ.delete(el);el.remove();}
function makeCard(o,ro){
  bindFold();
  const tp=document.createElement('template');tp.innerHTML=cardHTML(o,ro);
  const el=tp.content.firstElementChild;el._o=o;
  const f=el.querySelector('.html-frame');if(f)f.srcdoc=srcdocOf(o);
  if(el.querySelector('.ph'))observeCard(el);
  return el;
}
function renderAll(wall,list,ro){wall.replaceChildren(...list.map(o=>makeCard(o,ro)));}
function applySize(el,o){el.style.width=o.w+'px';el.style.height=o.h+'px';const t=el.querySelector('.corner-dim');if(t)t.textContent=o.w+'×'+o.h;}
function foldSync(el,o,h){
  const f=el.querySelector('.fold');if(!f)return;
  const cut=!!(o.mh&&o.mh+BORDER>h+6),open=!!o.full&&!!o.mh&&o.mh+BORDER>autoCap(el.clientWidth||h)+6;
  el.classList.toggle('clipped',cut);el.classList.toggle('unfolded',!cut&&open);
  const b=f.querySelector('.fold-btn'),k=cut?'foldMore':'foldLess';
  if(b.dataset.i18n!==k){b.dataset.i18n=k;b.textContent=t(k);}
}
let foldBound=false;
function bindFold(){
  if(foldBound)return;foldBound=true;
  document.addEventListener('click',e=>{
    const b=e.target.closest('.fold-btn');if(!b)return;
    const el=b.closest('.item'),o=el&&el._o;if(!o)return;
    e.preventDefault();e.stopPropagation();
    o.full=!o.full;
    if(o.manual)o.manual=false;
    if(!o.full&&el.getBoundingClientRect().top<0)el.scrollIntoView({block:'start',behavior:'smooth'});
    dispatchEvent(new Event('wall:relayout'));
  },true);
}
function markApproved(o){
  o.ok=true;
  ['', 'a-', 'c-'].forEach(p=>document.querySelectorAll('.item[data-id="'+p+o._id+'"]').forEach(el=>{
    el.classList.remove('pending');el.classList.add('ok');
    const k=el.querySelector('.corner');if(k)k.outerHTML=cornerHTML(o);
    const g=el.querySelector('.gdel');if(g)g.remove();
  }));
}

function colSize(wall,n){
  const W=wall.clientWidth;
  const k=Math.max(1,Math.min(n,Math.floor((W+GAP)/(MIN+GAP))));
  return {k,w:Math.max(MIN,Math.floor((W-GAP*(k-1))/k))};
}
function carK(W,cols){return cols>0?Math.max(1,Math.min(cols,Math.floor((W+GAP)/(MIN+GAP)))):Math.max(1,Math.min(4,Math.floor((W+GAP)/(340+GAP))));}
function layoutWall(wall,list,cols,car){
  const W=wall.clientWidth,pos=new Map(),sz=new Map();let H=0;
  const fixed=[];
  if(!car)list.forEach(o=>{
    if(!o.free||o.px==null)return;
    const w=Math.min(o.w,W),x=Math.max(0,Math.min(o.px,Math.max(0,W-w))),y=Math.max(0,o.py);
    pos.set(o._id,[x,y]);fixed.push([x,y,w,o.h]);H=Math.max(H,y+o.h);
  });
  const avoid=(x,y,w,h)=>{
    let moved=true,guard=0;
    while(moved&&guard++<40){
      moved=false;
      for(const f of fixed){
        if(x<f[0]+f[2]+GAP&&f[0]<x+w+GAP&&y<f[1]+f[3]+GAP&&f[1]<y+h+GAP){y=f[1]+f[3]+GAP;moved=true;}
      }
    }
    return y;
  };
  if(car){
    const k=carK(W,cols),w=Math.max(MIN,Math.floor((W-GAP*(k-1))/k));
    wall._hs=[];
    list.forEach((o,i)=>{const h=fitH(o,w,k);sz.set(o._id,{w,h});pos.set(o._id,[i*(w+GAP),0]);wall._hs.push(h);if(h>H)H=h;});
    wall.dataset.k=k;wall._step=w+GAP;wall._n=list.length;wall._ids=list.map(o=>o._id);
  }else if(cols>0){
    const {k,w}=colSize(wall,cols),colH=new Array(k).fill(0);
    list.forEach(o=>{
      o.w=w;o.h=fitH(o,w,k);o.manual=false;o.span=0;
      if(pos.has(o._id))return;
      let c=0;for(let i=1;i<k;i++)if(colH[i]<colH[c]-.5)c=i;
      const x=c*(w+GAP),y=avoid(x,colH[c],w,o.h);
      pos.set(o._id,[x,y]);colH[c]=y+o.h+GAP;
    });
    H=Math.max(H,Math.max(...colH)-GAP);
  }else{
    const G=Math.max(2,Math.min(8,Math.round((W+GAP)/(190+GAP)))),cw=(W-GAP*(G-1))/G,colH=new Array(G).fill(0);
    list.forEach(o=>{
      let s;
      if(o.span){s=Math.min(o.span,G);o.w=Math.round(s*cw+(s-1)*GAP);o.h=(o.fit||{}).t==='page'?Math.max(MIN,Math.round(o.w*(o.rh||.75))):fitH(o,o.w,2);}
      else s=Math.min(G,Math.max(1,Math.ceil((Math.min(o.w,W)+GAP)/(cw+GAP)-.001)));
      if(pos.has(o._id))return;
      let bc=0,by=Infinity;
      for(let c=0;c+s<=G;c++){let y=0;for(let j=c;j<c+s;j++)if(colH[j]>y)y=colH[j];if(y<by-.5){by=y;bc=c;}}
      const x=Math.round(bc*(cw+GAP));by=avoid(x,by,Math.round(s*cw+(s-1)*GAP),o.h);
      pos.set(o._id,[x,by]);for(let j=bc;j<bc+s;j++)colH[j]=by+o.h+GAP;
    });
    H=Math.max(H,Math.max(0,...colH)-GAP);
  }
  const byId=new Map(list.map(o=>[o._id,o]));
  wall.querySelectorAll('.item').forEach(el=>{
    const o=byId.get(el.dataset.id),p=pos.get(el.dataset.id);if(!o||!p)return;
    const d=sz.get(el.dataset.id)||o;
    el._o=o;applySize(el,d);foldSync(el,o,d.h);el.style.left=p[0]+'px';el.style.top=p[1]+'px';
    el.classList.toggle('free',!!o.free&&!car);
  });
  wall.style.height=list.length?Math.max(0,H)+'px':'';
  if(!wall.classList.contains('ready'))requestAnimationFrame(()=>requestAnimationFrame(()=>wall.classList.add('ready')));
  if(car){
    const {k,step,pages}=carState(wall),pg=Math.min(wall._carPage||0,pages-1);
    const sb=wall.style.scrollBehavior;wall.style.scrollBehavior='auto';wall.scrollLeft=pg*k*step;wall.style.scrollBehavior=sb;
    carSync(wall,true);
  }
}

// Carousel
function carouselBtnHTML(){return '<button id="carBtn" class="pill car" aria-pressed="false" data-i18n-aria="carousel"><span class="mi">🎠</span><span class="lbl" data-i18n="carousel"></span></button>';}
function carState(wall){const k=+wall.dataset.k||1,step=wall._step||1,n=wall._n||0;return {k,step,n,pages:Math.max(1,Math.ceil(n/k))};}
function carCurrent(wall){
  const {k,step,pages}=carState(wall);if(!wall._n)return 0;
  if(wall.scrollLeft>=wall.scrollWidth-wall.clientWidth-2&&wall.scrollLeft>0)return pages-1;
  return Math.max(0,Math.min(pages-1,Math.round(wall.scrollLeft/step/k)));
}
function carGo(wall,p){const {k,step,pages}=carState(wall);p=Math.max(0,Math.min(pages-1,p));wall.scrollTo({left:p*k*step});}
let carRaf=0;
function placeSides(wall){
  const L=document.getElementById('carL'),R=document.getElementById('carR');if(!L)return;
  const on=wall.classList.contains('carousel');L.hidden=R.hidden=!on;if(!on)return;
  const r=wall.getBoundingClientRect(),h=parseFloat(wall.style.height)||r.height,sz=L.offsetWidth||44;
  const y=r.top+scrollY+Math.min(h/2,260)-sz/2;
  L.style.top=R.style.top=Math.round(y)+'px';
  L.style.left=Math.round(r.left+scrollX+6)+'px';
  R.style.left=Math.round(r.right+scrollX-sz-6)+'px';
}
function carSync(wall,force){
  const nav=document.getElementById('carNav');if(!nav||nav.hidden){placeSides(wall);return;}
  const {pages,k,step,n}=carState(wall),cur=carCurrent(wall),box=nav.querySelector('.car-dots');
  const first=Math.max(0,Math.min(Math.round(wall.scrollLeft/step),n-k));
  if(!force&&cur===wall._carPage&&first===wall._carFirst)return;
  wall._carPage=cur;wall._carFirst=first;
  if(wall._ids){
    const idx=new Map(wall._ids.map((id,i)=>[id,i])),from=first-k,to=first+2*k;
    wall.querySelectorAll('.item').forEach(el=>{const i=idx.get(el.dataset.id);el._keep=i!=null&&i>=from&&i<to;if(el._keep)mountQ.add(el);});
    pump();
  }
  if(wall._hs&&wall._hs.length){const vis=wall._hs.slice(first,first+k);if(vis.length)wall.style.height=Math.max(...vis)+'px';}
  if(pages<=10){
    if(box.children.length!==pages||box.firstElementChild&&!box.firstElementChild.classList.contains('car-dot')){
      box.innerHTML='';for(let i=0;i<pages;i++){const d=document.createElement('button');d.className='car-dot';d.dataset.page=i;box.appendChild(d);}
    }
    [...box.children].forEach((d,i)=>{d.setAttribute('aria-current',i===cur);d.setAttribute('aria-label',t('page',{n:i+1}));});
  }else box.innerHTML='<span class="car-count">'+(cur+1)+' / '+pages+'</span>';
  const [prev,next]=nav.querySelectorAll('.car-arrow'),L=document.getElementById('carL'),R=document.getElementById('carR');
  prev.disabled=L.disabled=cur<=0;next.disabled=R.disabled=cur>=pages-1;
  [prev,L].forEach(b=>b.setAttribute('aria-label',t('prev')));[next,R].forEach(b=>b.setAttribute('aria-label',t('next')));
  placeSides(wall);
}
function setCarousel(wall,on){
  let nav=document.getElementById('carNav');
  if(!nav){
    nav=document.createElement('div');nav.id='carNav';nav.className='car-nav';nav.hidden=true;
    nav.innerHTML='<button class="car-arrow" data-dir="-1">‹</button><div class="car-dots"></div><button class="car-arrow" data-dir="1">›</button>';
    wall.before(nav);
    document.body.insertAdjacentHTML('beforeend','<button id="carL" class="car-side" data-dir="-1" hidden>‹</button><button id="carR" class="car-side" data-dir="1" hidden>›</button>');
    ['carL','carR'].forEach(id=>document.getElementById(id).addEventListener('click',e=>carGo(wall,carCurrent(wall)+ +e.currentTarget.dataset.dir)));
    wall.addEventListener('transitionend',e=>{if(e.target===wall)placeSides(wall);});
    addEventListener('resize',()=>placeSides(wall));
    addEventListener('wall:offset',()=>placeSides(wall));
    nav.addEventListener('click',e=>{
      const a=e.target.closest('[data-dir]');if(a){carGo(wall,carCurrent(wall)+ +a.dataset.dir);return;}
      const d=e.target.closest('[data-page]');if(d)carGo(wall,+d.dataset.page);
    });
    wall.addEventListener('scroll',()=>{if(!carRaf)carRaf=requestAnimationFrame(()=>{carRaf=0;carSync(wall);});},{passive:true});
    document.addEventListener('keydown',e=>{
      if(!wall.classList.contains('carousel')||(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'))return;
      if(e.target.closest&&e.target.closest('input,textarea,select,[contenteditable],.menu'))return;
      const panel=document.getElementById('panel');if(panel&&!panel.classList.contains('hidden'))return;
      e.preventDefault();carGo(wall,carCurrent(wall)+(e.key==='ArrowRight'?1:-1));
    });
  }
  wall._carPage=0;wall.classList.toggle('carousel',on);nav.hidden=!on;
  if(!on)wall.querySelectorAll('.item').forEach(el=>{el._keep=false;});document.body.classList.toggle('car-on',on);
  wall._carFirst=-1;if(!on)wall.scrollLeft=0;
  const b=document.getElementById('carBtn');if(b)b.setAttribute('aria-pressed',on);
  dispatchEvent(new Event('wall:carousel'));placeSides(wall);
}
function watchWidth(wall,cb){
  let last=wall.clientWidth,raf=0,pending=false;
  const run=()=>{raf=0;if(document.hidden){pending=true;return;}const W=wall.clientWidth;if(W!==last){last=W;cb();}};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&pending){pending=false;last=-1;run();}});
  const kick=()=>{if(!raf)raf=requestAnimationFrame(run);};
  if('ResizeObserver' in window)new ResizeObserver(kick).observe(wall);else window.addEventListener('resize',kick);
}

const COLS_MAX=5,COLS_QUICK=5;
const validCols=c=>Number.isInteger(c)&&c>=0&&c<=COLS_MAX;

// Languages
const I18N = {
  en: { title:"Wall editor", upload:"Upload", download:"Download", copyWall:"Copy standalone wall", dlWall:"Download standalone wall", clear:"Clear", hint:"Enter adds a ━━━━ divider | a boundary labels the block above it: ### = InfoMercial, === = Topic; whatever is left is Content | Shift+Enter: line break | Ctrl+Enter: push to wall", placeholder:"Paste URLs, one per line", cancel:"Cancel", push:"✓ Push to wall", count:"{n} items", layout:"Layout", random:"Random", cols:"{n} columns", col1:"1 column", openEditor:"Open editor", close:"Close", edit:"Edit", language:"Language", noInput:"No URLs or embed code found", skipped:"Skipped {n} unrecognized line(s)", storageFull:"Storage full", emptyWall:"The wall is empty", copied:"Copied HTML", clipFallback:"Clipboard unavailable", downloaded:"Downloaded wall", fileEmpty:"Empty file", loaded:"Loaded {n} items", loadedSkip:", {n} skipped", confirmClear:"Clear this wall?", wallEmpty:"This wall has no content yet", del:"Delete", original:"Original", shuffle:"Shuffle", tombNote:"This site doesn't allow embedding", openTab:"Open in new tab", markTomb:"Mark as non-embeddable", tryEmbed:"Try embedding again", carousel:"Carousel", prev:"Previous", next:"Next", page:"Page {n}", filter:"Filter", searchPh:"Search titles, sites, #tags…", fType:"Type", fDate:"Date", fSort:"Sort", tAll:"All types", tVideo:"Video", tAudio:"Audio", tPage:"Web pages", tHtml:"HTML", tBlocked:"Non-embeddable", dAny:"Any date", dToday:"Today", d7:"Last 7 days", d30:"Last 30 days", sWall:"Sort: wall order", sNew:"Newest first", sOld:"Oldest first", sLong:"Longest first", sShort:"Shortest first", sAz:"Title A–Z", results:"{n} of {m}", fClear:"Clear", noMatch:"No cards match", fTitle:"Title", fTags:"Tags", fLength:"Length", tagsPh:"comma, separated", lenPh:"mm:ss", fxToggle:"Effects", resetPos:"Reset positions", moveCard:"Move card", fxFire:"Fireworks", fxFly:"Flying bees", fxSound:"Sound", tabSheet:"EzSheet", tabPics:"Images & 3D", picDrop:"Drop images or 3D models here", picHint:"Inlined images & 3D models", asCard:"As card", asSprite:"As flying sprite", picAdd:"Add as cards", picSprites:"Use as sprites", spriteReset:"Default bees", picZoneA:"Topic", picZoneB:"Content", picAdded:"{n} image card(s) added", spriteOk:"{n} flying sprite(s) applied", picNone:"No images yet", zA:"Topic band", zB:"Content wall", zC:"InfoMercial band", zorder:"Zone order", zorderHint:"Drag to set order of bands", picZoneC:"InfoMercial", tModel:"3D models", picTooBig:"{n} skipped: over 12 MB", picBadType:"{n} skipped: not image/3D", insCard:"Insert a card before this one", insTitle:"Insert a card", insHintOwner:"Paste URL, embed code, or Markdown.", insHintGuest:"Paste URL, embed code, or Markdown.", insPh:"https://… · <iframe> · <md>…</md>", insSave:"Save and insert", insCancel:"Cancel", insBad:"Invalid content", insDone:"✓ One card inserted", insDel:"Remove the card you added", revTitle:"Co-WiKi cards", revDrop:"Remove card", revHint:"Visitor cards go live immediately as Co-WiKi. ✓ approves, ✕ removes.", revNone:"No visitor cards yet", revDenied:"Wrong owner key", revFail:"Connection failed", revAsk:"Owner key", syncOn:"Live — shared with every visitor", syncOff:"Offline", insHintLive:"Paste a URL or Markdown. It goes in as a Co-WiKi card live to everyone.", insBusy:"Server refused", insRate:"Too many cards", insDown:"Offline right now", insBig:"Markdown too long", insMd:"M↓ Markdown", insKinds:"3D: paste Sketchfab or https .glb", insMdTpl:"# Title\n\nWrite Markdown here.", revOk:"Approve", revPend:"Pending", revOkd:"Approved", tMd:"Markdown", sprTitle:"Flying sprites 🐝", sprHint:"Change or replace sprites", sprRep:"Replace", sprDel:"Remove", sprAdd:"Add sprite", sprReset:"Default bees", sprDef:"built-in", sprNone:"No flying sprites", sprBig:"Image > 2 MB", foldMore:"⌄ Show all", foldLess:"⌃ Show less", cardLink:"Copy link", linkCopied:"Link copied", insFull:"Wall is full", saveAs:"Save as:", savedAs:"Saved: {name}", saveHint:"Downloaded" },
  'zh-TW': { title:"牆面編輯", upload:"上傳", download:"下載", copyWall:"複製獨立牆", dlWall:"下載獨立牆", clear:"清空", hint:"Enter 自動加━━━━分隔｜界線標記：### = InfoMercial, === = Topic，其餘是 Content｜Ctrl+Enter 推上牆", placeholder:"貼網址，每行一個", cancel:"取消", push:"✓ 推上牆", count:"{n} 組", layout:"版面", random:"自由隨機", cols:"{n} 欄", openEditor:"開啟編輯面板", close:"關閉", edit:"編輯", language:"語言", noInput:"沒抓到可用的網址或嵌入碼", skipped:"已略過 {n} 行", storageFull:"儲存空間已滿", emptyWall:"牆是空的", copied:"已複製 HTML", clipFallback:"已改為下載", downloaded:"已下載獨立牆", fileEmpty:"空檔案", loaded:"已載入 {n} 組", loadedSkip:"，略過 {n} 組", confirmClear:"清空這面牆？", wallEmpty:"這面牆目前沒有內容", del:"刪除", original:"原始版面", shuffle:"洗牌", tombNote:"此網站不允許嵌入", openTab:"在新分頁開啟", markTomb:"標示為無法嵌入", tryEmbed:"重新嘗試嵌入", carousel:"輪播", prev:"上一頁", next:"下一頁", page:"第 {n} 頁", filter:"篩選", searchPh:"搜尋標題、網站、#標籤…", fType:"類型", fDate:"日期", fSort:"排序", tAll:"所有類型", tVideo:"影片", tAudio:"音訊", tPage:"網頁", tHtml:"HTML", tBlocked:"無法嵌入", dAny:"不限日期", dToday:"今天", d7:"最近 7 天", d30:"最近 30 天", sWall:"排序：牆面順序", sNew:"最新優先", sOld:"最舊優先", sLong:"最長優先", sShort:"最短優先", sAz:"標題 A–Z", results:"{n} / {m}", fClear:"清除", noMatch:"沒有符合條件的卡片", fTitle:"標題", fTags:"標籤", fLength:"長度", tagsPh:"以逗號分隔", lenPh:"分:秒", fxToggle:"特效", resetPos:"一鍵復位", moveCard:"拖曳搬移", fxFire:"煙火", fxFly:"飛行物", fxSound:"音效", tabSheet:"EzSheet", tabPics:"圖檔與 3D", picDrop:"把圖檔或 3D 模型拖到這裡", picHint:"直接內嵌進牆面", asCard:"當卡片", asSprite:"當飛行圖示", picAdd:"加入為卡片", picSprites:"套用為飛行圖示", spriteReset:"回到預設蜜蜂", picZoneA:"放 Topic", picZoneB:"放 Content", picAdded:"已加入 {n} 張圖卡", spriteOk:"已套用 {n} 個飛行圖示", picNone:"還沒有圖檔", zA:"Topic（主題帶）", zB:"Content（內容牆）", zC:"InfoMercial（業配帶）", zorder:"區塊順序", zorderHint:"拖曳調整順序", picZoneC:"放 InfoMercial", tModel:"3D 模型", picTooBig:"略過 {n} 個檔案：超過 12 MB", picBadType:"略過 {n} 個檔案：不是圖檔或 3D", insCard:"在這張卡前面插入一張", insTitle:"插入新卡", insHintOwner:"貼上網址、嵌入碼或 Markdown", insHintGuest:"貼上網址、嵌入碼或 Markdown", insPh:"https://… · <iframe> · <md>…</md>", insSave:"儲存並插入", insCancel:"取消", insBad:"無法呈現的內容", insDone:"✓ 已插入一張卡", insDel:"移除你加的這張卡", revTitle:"Co-WiKi 來客卡", revDrop:"移除這張卡", revHint:"來客卡即時公開。✓ 認可為永久卡，✕ 移除", revNone:"目前沒有訪客卡片", revDenied:"版主金鑰不對", revFail:"連不上伺服器", revAsk:"版主金鑰", syncOn:"連線中——所有訪客同步看到", syncOff:"離線", insHintLive:"貼上網址或 Markdown，會以 Co-WiKi 卡插在前面，所有訪客立刻看得到", insBusy:"伺服器不接受", insRate:"送出的卡太多了", insDown:"目前離線", insBig:"Markdown 太長", insMd:"M↓ Markdown", insKinds:"3D：貼 Sketchfab 或 .glb 網址", insMdTpl:"# 標題\n\n在這裡寫 Markdown", revOk:"認可", revPend:"待審", revOkd:"已認可", tMd:"Markdown", sprTitle:"飛行圖示 🐝", sprHint:"內建蜜蜂可以直接替換", sprRep:"換圖", sprDel:"移除", sprAdd:"新增飛行圖示", sprReset:"恢復內建蜜蜂", sprDef:"內建", sprNone:"沒有飛行圖示", sprBig:"圖檔超過 2 MB", foldMore:"⌄ 展開全文", foldLess:"⌃ 收合", cardLink:"複製這張卡的連結", linkCopied:"已複製連結", insFull:"牆面已滿", saveAs:"另存新檔：", savedAs:"已儲存：{name}", saveHint:"已下載" }
};
let LANG='en';
function setLangCode(l){LANG=I18N[l]?l:'en';return LANG;}
function getLang(){return LANG;}
function t(k,v){let s=(I18N[LANG]||{})[k];if(s==null)s=I18N.en[k];if(s==null)s=k;return v?s.replace(/\{(\w+)\}/g,(_,x)=>v[x]!=null?v[x]:''):s;}
function colsText(n){return t(n===1&&I18N[LANG].col1?'col1':'cols',{n});}
function applyI18n(){
  document.documentElement.lang=LANG;
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{el.setAttribute('aria-label',t(el.dataset.i18nAria));el.title=t(el.dataset.i18nAria);});
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{el.placeholder=t(el.dataset.i18nPh);});
  document.querySelectorAll('[data-i18n-cols]').forEach(el=>{el.textContent=colsText(+el.dataset.i18nCols);});
}
const LANGS=[['en','EN'],['zh-TW','繁中']];
function langSelectHTML(){return '<select id="lang" class="lang-select" data-i18n-aria="language">'+LANGS.map(([v,n])=>'<option value="'+v+'">'+n+'</option>').join('')+'</select>';}

const bars=n=>'<span class="ci">'+'<i></i>'.repeat(n)+'</span>';
function menuHTML(withOriginal){
  let items=withOriginal?'<button role="menuitemradio" data-cols="-1"><span class="mi">📌</span><span data-i18n="original">'+t('original')+'</span></button>':'';
  items+='<button data-reset="1"><span class="mi">↺</span><span data-i18n="resetPos">'+t('resetPos')+'</span></button><hr>';
  items+='<button role="menuitemradio" data-cols="0"><span class="mi">🎲</span><span data-i18n="random">'+t('random')+'</span></button><hr>';
  for(let n=1;n<=COLS_QUICK;n++)items+='<button role="menuitemradio" data-cols="'+n+'"><span class="mi">'+bars(Math.min(n,4))+(n>4?'<b class="cn">'+n+'</b>':'')+'</span><span data-i18n-cols="'+n+'">'+colsText(n)+'</span></button>';
  return '<div class="menu-wrap" id="menuWrap"><button id="layoutBtn" class="pill" aria-haspopup="menu" aria-expanded="false" aria-controls="layoutMenu"><span class="mi" id="layoutIcon">🎲</span><span class="lbl" id="layoutText">'+t('random')+'</span><span class="caret">▼</span></button><div id="layoutMenu" class="menu" role="menu" hidden>'+items+'</div></div>';
}
function updateLayoutUI(mode){
  document.querySelectorAll('#layoutMenu [data-cols]').forEach(b=>{const on=+b.dataset.cols===mode;b.classList.toggle('on',on);b.setAttribute('aria-checked',on);});
  const txt=mode>0?colsText(mode):mode===0?t('random'):t('original');
  const icon=document.getElementById('layoutIcon');
  if(icon) icon.innerHTML=mode>0?bars(Math.min(mode,4))+(mode>4?'<b class="cn">'+mode+'</b>':''):mode===0?'🎲':'📌';
  const lt=document.getElementById('layoutText');
  if(lt) lt.textContent=txt;
  const b=document.getElementById('layoutBtn');
  if(b){
    b.classList.toggle('random',mode===0);
    b.setAttribute('aria-label',t('layout')+': '+txt);b.title=t('layout')+': '+txt;
  }
}
function bindMenu(onPick){
  const menu=document.getElementById('layoutMenu'),btn=document.getElementById('layoutBtn'),wrap=document.getElementById('menuWrap');
  const items=()=>[...menu.querySelectorAll('button')];
  const open=()=>{menu.hidden=false;btn.setAttribute('aria-expanded','true');(menu.querySelector('.on')||items()[0]).focus();};
  const close=f=>{if(menu.hidden)return;menu.hidden=true;btn.setAttribute('aria-expanded','false');if(f)btn.focus();};
  btn.addEventListener('click',()=>menu.hidden?open():close(false));
  menu.addEventListener('click',e=>{
    const r=e.target.closest('[data-reset]');if(r){close(true);onPick('reset');return;}
    const b=e.target.closest('[data-cols]');if(!b)return;close(true);onPick(+b.dataset.cols);
  });
  document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!wrap.contains(e.target))close(false);});
}

function shuffled(a){
  if(a.length<2)return a.slice();
  let b;do{b=a.slice();for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}}
  while(b.every((o,i)=>o===a[i]));
  return b;
}
function shuffleBtnHTML(){return '<button id="shuffleBtn" class="pill shuffle" data-i18n-aria="shuffle"><span class="mi">🔀</span><span class="lbl" data-i18n="shuffle"></span></button>';}
async function reorderAnimated(wall,next,commit){
  if(commit)commit();
  return true;
}

// Effects (fireworks & bees)
const FX_COLORS=['#FFE27A','#0E7C7B','#F7F5F1','#FF8A65','#81C784','#64B5F6'];
let fxFw=false,fxFly=false,fxWall=null,AC=null,MASTER=null,SND=true;
let fwCanvas=null,fwCtx=null,fwRaf=null,fwParticles=[];
let flyContainer=null,flyRaf=null,flyBees=[];

function audio(){
  if(AC)return AC;
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;
  AC=new C();MASTER=AC.createGain();MASTER.gain.value=SND?0.5:0;MASTER.connect(AC.destination);
  return AC;
}
function sndSet(on){SND=!!on;if(MASTER&&AC)MASTER.gain.value=SND?0.5:0;fxPaint();}
function popSound(){
  if(!SND)return;
  try{
    const ctx=audio();if(!ctx)return;
    const osc=ctx.createOscillator(),g=ctx.createGain();
    osc.type='triangle';osc.frequency.setValueAtTime(400+Math.random()*400,ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100,ctx.currentTime+0.12);
    g.gain.setValueAtTime(0.12,ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.001,ctx.currentTime+0.12);
    osc.connect(g);g.connect(MASTER);
    osc.start();osc.stop(ctx.currentTime+0.12);
  }catch(e){}
}
function fwLoop(){
  if(!fxFw){
    if(fwCanvas){fwCanvas.remove();fwCanvas=null;fwCtx=null;}
    cancelAnimationFrame(fwRaf);fwRaf=null;return;
  }
  if(!fwCanvas){
    fwCanvas=document.createElement('canvas');
    fwCanvas.id='fwCanvas';
    fwCanvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:999';
    document.body.appendChild(fwCanvas);
    fwCtx=fwCanvas.getContext('2d');
    fwCanvas.width=window.innerWidth;
    fwCanvas.height=window.innerHeight;
  }
  if(Math.random()<0.08){
    const cx=Math.random()*fwCanvas.width,cy=Math.random()*(fwCanvas.height*0.65)+50;
    const color=FX_COLORS[Math.floor(Math.random()*FX_COLORS.length)];
    for(let i=0;i<30;i++){
      const ang=Math.random()*Math.PI*2,spd=Math.random()*4+1;
      fwParticles.push({x:cx,y:cy,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,alpha:1,color,size:Math.random()*3+2});
    }
    popSound();
  }
  fwCtx.clearRect(0,0,fwCanvas.width,fwCanvas.height);
  for(let i=fwParticles.length-1;i>=0;i--){
    const p=fwParticles[i];
    p.x+=p.vx;p.y+=p.vy;p.vy+=0.04;p.alpha-=0.015;
    if(p.alpha<=0){fwParticles.splice(i,1);continue;}
    fwCtx.globalAlpha=p.alpha;
    fwCtx.fillStyle=p.color;
    fwCtx.beginPath();
    fwCtx.arc(p.x,p.y,p.size,0,Math.PI*2);
    fwCtx.fill();
  }
  fwRaf=requestAnimationFrame(fwLoop);
}

function flyLoop(){
  if(!fxFly){
    if(flyContainer){flyContainer.remove();flyContainer=null;}
    cancelAnimationFrame(flyRaf);flyRaf=null;return;
  }
  if(!flyContainer){
    flyContainer=document.createElement('div');
    flyContainer.id='flyContainer';
    flyContainer.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:998;overflow:hidden';
    document.body.appendChild(flyContainer);
    const sprites=(window.WALL_SPRITES&&window.WALL_SPRITES.length)?window.WALL_SPRITES:['🐝','🐝','🐝','🐝','🐝'];
    flyBees=[];
    sprites.slice(0,8).forEach(spr=>{
      const el=document.createElement('div');
      el.style.cssText='position:absolute;font-size:24px;transition:none;will-change:transform';
      if(spr.startsWith('data:image/')||/^https?:\/\//i.test(spr)){
        el.innerHTML='<img src="'+esc(spr)+'" style="width:28px;height:28px;object-fit:contain">';
      } else {
        el.textContent=spr;
      }
      flyContainer.appendChild(el);
      flyBees.push({
        el,
        x:Math.random()*window.innerWidth,
        y:Math.random()*window.innerHeight,
        vx:(Math.random()-0.5)*3+1,
        vy:(Math.random()-0.5)*2,
        t:Math.random()*100
      });
    });
  }
  flyBees.forEach(b=>{
    b.t+=0.04;
    b.x+=b.vx+Math.sin(b.t)*1.5;
    b.y+=b.vy+Math.cos(b.t*1.3)*1.2;
    if(b.x>window.innerWidth+40)b.x=-40;
    if(b.x<-40)b.x=window.innerWidth+40;
    if(b.y>window.innerHeight+40)b.y=-40;
    if(b.y<-40)b.y=window.innerHeight+40;
    const flip=b.vx<0?'-1':'1';
    b.el.style.transform=`translate3d(${b.x}px,${b.y}px,0) scaleX(${flip})`;
  });
  flyRaf=requestAnimationFrame(flyLoop);
}

function fwBtnHTML(){return '<button id="fwBtn" class="pill fx" aria-pressed="false" data-i18n-aria="fxFire"><span class="mi">🎆</span></button>';}
function flyBtnHTML(){return '<button id="flyBtn" class="pill fx" aria-pressed="false" data-i18n-aria="fxFly"><span class="mi">🐝</span></button>';}
function sndBtnHTML(){return '<button id="sndBtn" class="pill snd" aria-pressed="true" data-i18n-aria="fxSound"><span class="mi">🔊</span></button>';}
function fxBtnHTML(){return '<span id="fxGroup" class="fx-group">'+fwBtnHTML()+flyBtnHTML()+sndBtnHTML()+'</span>';}
function fxPaint(){
  const f=document.getElementById('fwBtn'),y=document.getElementById('flyBtn'),n=document.getElementById('sndBtn');
  if(f){f.setAttribute('aria-pressed',fxFw);f.querySelector('.mi').textContent=fxFw?'🎆':'🌑';}
  if(y){y.setAttribute('aria-pressed',fxFly);y.querySelector('.mi').textContent=fxFly?'🐝':'💤';}
  if(n){n.setAttribute('aria-pressed',SND);n.querySelector('.mi').textContent=SND?'🔊':'🔇';}
}
function fxSetFw(on){
  fxFw=!!on;
  fxPaint();
  if(fxFw&&!fwRaf)fwLoop();
  else if(!fxFw&&fwCanvas){fwCanvas.remove();fwCanvas=null;cancelAnimationFrame(fwRaf);fwRaf=null;}
}
function fxSetFly(on){
  fxFly=!!on;
  fxPaint();
  if(fxFly&&!flyRaf)flyLoop();
  else if(!fxFly&&flyContainer){flyContainer.remove();flyContainer=null;cancelAnimationFrame(flyRaf);flyRaf=null;}
}
function fxState(){return {fw:fxFw,fly:fxFly,snd:SND};}
function fxDefaults(d){if(d&&typeof d.snd==='boolean')SND=d.snd;}
function fxShow(on){const g=document.getElementById('fxGroup');if(g)g.hidden=!on;}
function fxAvailable(){return true;}
function playFX(wall,delay){
  fxSetFw(true);
  setTimeout(()=>{if(!fxState().fw)fxSetFw(false);},3000);
}
function fxInit(wall){
  fxPaint();
  const f=document.getElementById('fwBtn'),y=document.getElementById('flyBtn'),n=document.getElementById('sndBtn');
  if(f)f.addEventListener('click',()=>fxSetFw(!fxFw));
  if(y)y.addEventListener('click',()=>fxSetFly(!fxFly));
  if(n)n.addEventListener('click',()=>sndSet(!SND));
}

// Bands (Zone A & Zone C)
function Band(id){return {id,els:new Map(),items:[],off:0,timer:0,step:0,h:0,k:3,hover:false,paused:false};}
const ZA=Band('zoneA'),ZC=Band('zoneC');
function bandUpdate(B,items){
  const sec=document.getElementById(B.id);if(!sec)return;
  const track=sec.querySelector('.za-track');
  const on=items.length>0;sec.hidden=!on;
  if(!on){B.els.forEach(el=>dropCard(el));B.els.clear();B.items=[];return;}
  B.items=items;
  items.forEach(o=>{
    let el=B.els.get(o._id);
    if(!el){el=makeCard(o,true);el.dataset.id=(B.id==='zoneC'?'c-':'a-')+o._id;track.appendChild(el);B.els.set(o._id,el);}
    el._o=o;
    applySize(el,{w:280,h:180});
  });
  sec.style.height='200px';
}
function bandInit(B,before,cls){
  if(document.getElementById(B.id))return;
  before.insertAdjacentHTML('beforebegin','<section id="'+B.id+'" class="zone-a '+(cls||'')+'" hidden><div class="za-track"></div></section>');
}
function zoneAInit(b){bandInit(ZA,b,'');}
function zoneAUpdate(i){bandUpdate(ZA,i);}
function zoneCInit(b){bandInit(ZC,b,'zone-c');}
function zoneCUpdate(i){bandUpdate(ZC,i);}

// Zones & Filters
const ZONES=['a','b','c'],ZNAME={a:'Topic',b:'Content',c:'InfoMercial'},ZORDERS=[['c','a','b'],['a','c','b']];
function validOrder(o){return Array.isArray(o)&&o.length===3?o:ZORDERS[0].slice();}
function applyZoneOrder(order){
  const put=(id,v)=>{const el=document.getElementById(id);if(el)el.style.order=v;};
  order.forEach((z,i)=>{
    const base=(i+1)*10;
    if(z==='b'){put('barZone',base+1);put('carNav',base+2);put('wall',base+3);}
    else put(z==='a'?'zoneA':'zoneC',base+1);
  });
}
function zoneBtnHTML(){
  return ZONES.map(z=>'<button id="zone'+z.toUpperCase()+'Btn" class="pill zone" data-zone="'+z+'"><span class="lbl">'+ZNAME[z]+'</span><span class="zn" id="zn'+z.toUpperCase()+'"></span></button>').join('');
}
function zonePaint(state,counts){
  ZONES.forEach(z=>{
    const b=document.getElementById('zone'+z.toUpperCase()+'Btn');if(!b)return;
    b.setAttribute('aria-pressed',!!state[z]);
    const n=document.getElementById('zn'+z.toUpperCase());
    if(n&&counts)n.textContent=counts[z]?String(counts[z]):'';
  });
}
function zoneCounts(list){
  const c={a:0,b:0,c:0};
  (list||[]).forEach(o=>{const z=(o.zone==='a'||o.zone==='c')?o.zone:'b';c[z]++;});
  return c;
}
function bindZones(state,onChange){
  ZONES.forEach(z=>{const b=document.getElementById('zone'+z.toUpperCase()+'Btn');
    if(b)b.addEventListener('click',()=>{state[z]=!state[z];zonePaint(state);onChange(z);});});
}
function validZones(o){
  const r={a:true,b:true,c:true};
  if(o&&typeof o==='object')ZONES.forEach(z=>{if(typeof o[z]==='boolean')r[z]=o[z];});
  return r;
}

const FDEF={q:'',type:'all',date:'any',sort:'wall'},FILTER_MIN=16;
function kindOf(o){
  if(isTomb(o))return 'blocked';
  if(o.type==='model')return 'model';
  if(o.type==='md')return 'md';
  if(o.type==='html')return 'html';
  if(o.type==='youtube')return 'video';
  return 'page';
}
function matches(o,F){
  if(F.type!=='all'&&kindOf(o)!==F.type)return false;
  const q=String(F.q||'').trim().toLowerCase();if(!q)return true;
  return [o.title,o.url].join(' ').toLowerCase().includes(q);
}
function viewOf(list,F){return list.filter(o=>matches(o,F));}
function filterBtnHTML(){return '<button id="filterBtn" class="pill filt"><span class="mi">🔍</span><span class="lbl" data-i18n="filter"></span></button>';}
function filterBarHTML(){
  return '<div id="filterBar" class="filter-bar" hidden><input id="fq" type="search" placeholder="Search…"><select id="ftype"><option value="all">All types</option><option value="video">Video</option><option value="audio">Audio</option><option value="md">Markdown</option><option value="page">Web pages</option><option value="model">3D models</option></select><button id="fclear" class="f-clear">Clear</button></div>';
}
function bindFilter(wall,F,onChange){
  const bar=document.getElementById('filterBar'),btn=document.getElementById('filterBtn'),q=document.getElementById('fq'),ty=document.getElementById('ftype');
  if(!btn||!bar)return null;
  btn.addEventListener('click',()=>{bar.hidden=!bar.hidden;});
  q.addEventListener('input',()=>{F.q=q.value;onChange();});
  ty.addEventListener('change',()=>{F.type=ty.value;onChange();});
  document.getElementById('fclear').addEventListener('click',()=>{F.q='';F.type='all';q.value='';ty.value='all';onChange();});
  return {sync:()=>{},show:()=>{},open:()=>!bar.hidden};
}
function applyView(wall,list,F){
  const v=viewOf(list,F),keep=new Set(v.map(o=>o._id));
  wall.querySelectorAll('.item').forEach(el=>el.classList.toggle('f-out',!keep.has(el.dataset.id)));
  return v;
}

// Review dialog
let revBox=null;
function reviewClose(){if(revBox){revBox.remove();revBox=null;}}
function reviewOpen(id,onDrop,onOk){
  reviewClose();
  const box=document.createElement('div');
  box.className='ins-modal';box.id='revModal';
  box.innerHTML='<div class="ins-card rev-card"><b data-i18n="revTitle">Co-WiKi Review</b><p class="ins-hint" data-i18n="revHint"></p><div class="rev-list" id="revList">Loading…</div><div class="ins-go"><button type="button" class="ins-btn" id="revClose">Close</button></div></div>';
  document.body.appendChild(box);revBox=box;
  box.querySelector('#revClose').addEventListener('click',reviewClose);
  syncReview(id).then(r=>{
    const list=box.querySelector('#revList');
    const cards=r.cards||[];
    if(!cards.length){list.innerHTML='<div class="rev-none">No visitor cards yet</div>';return;}
    // Pending cards come first per Owner Guide s2b
    cards.sort((a,b) => (a.ok === b.ok ? (b.at || 0) - (a.at || 0) : (a.ok ? 1 : -1)));
    list.innerHTML=cards.map(c=>`<div class="rev-row ${c.ok?'ok':''}"><div class="rev-meta"><b>${esc(c.cid)}</b> · <b>${c.ok?'✓ Approved':'⏳ Pending'}</b> · <span>${new Date(c.at).toLocaleTimeString()}</span> · Zone ${esc(String(c.zone||'b').toUpperCase())} · <code>${esc(c.fingerprint||'visitor')}</code></div><code class="rev-raw">${esc(c.raw)}</code><div class="rev-acts">${c.ok?'':'<button type="button" class="rev-ok" data-ok="'+c.cid+'" title="Approve card">✓</button>'}<button type="button" class="rev-x" data-drop="'+c.cid+'" title="Remove card">✕</button></div></div>`).join('');
    list.addEventListener('click',e=>{
      const a=e.target.closest('[data-ok]');
      if(a){syncApprove(id,a.dataset.ok).then(()=>{if(onOk)onOk(a.dataset.ok);reviewClose();});return;}
      const b=e.target.closest('[data-drop]');
      if(b){syncDrop(id,b.dataset.drop).then(()=>{if(onDrop)onDrop(b.dataset.drop);reviewClose();});}
    });
  }).catch(()=>{
    box.querySelector('#revList').innerHTML='<div class="rev-none">Unauthorized. Owner key required.</div>';
  });
}

function parseDur(s){return 0;}
function fmtDur(n){return '';}
function randomSize(o){return {...o,span:[1,2,2,3][Math.floor(Math.random()*4)],rh:0.75};}

function validSprites(arr){
  if(!Array.isArray(arr))return [];
  return arr.filter(s=>typeof s==='string'&&(s.startsWith('data:image/')||/^https?:\/\//i.test(s)||s.length<=8));
}

function saveFile(data, mime, filename){
  const blob=new Blob([data],{type:mime||'text/html'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename||'wall.html';
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{a.remove();URL.revokeObjectURL(a.href);},1000);
}

function bootReadonly(){
  const dataEl=document.getElementById('wall-data');
  if(!dataEl)return;
  let data={};
  try{data=JSON.parse(dataEl.textContent);}catch(e){}
  const list=(data.list||[]).map(normalize).filter(Boolean);
  const wall=document.getElementById('wall');
  if(!wall)return;
  if(data.lang)setLangCode(data.lang);
  applyI18n();
  const cols=data.cols||0,car=!!data.car,zones=data.zones||{a:true,b:true,c:true},zorder=data.zorder||['c','a','b'];
  if(data.zorder)applyZoneOrder(zorder);
  zoneAInit(wall);
  zoneCInit(document.getElementById('zoneA')||wall);
  fxInit(wall);
  if(data.fx){
    if(data.fx.fw)fxSetFw(true);
    if(data.fx.fly)fxSetFly(true);
    if(typeof data.fx.snd==='boolean')sndSet(data.fx.snd);
  }
  const A=zones.a?list.filter(o=>o.zone==='a'):[];
  const B=zones.b?list.filter(o=>o.zone==='b'||!o.zone):[];
  const C=zones.c?list.filter(o=>o.zone==='c'):[];
  zoneCUpdate(C);
  zoneAUpdate(A);
  wall.hidden=!zones.b;
  renderAll(wall, B, true);
  B.forEach(o=>{
    const el=wall.querySelector('.item[data-id="'+o._id+'"]');
    if(el)applySize(el,o);
  });
  if(car)setCarousel(wall,true);
  layoutWall(wall, B, cols, car);
  watchWidth(wall, ()=>{
    layoutWall(wall, B, cols, car);
  });
}

window.WallCore={
  STD_W,STD_H,GRID,MIN,YT,esc,httpUrl,normalize,makeCard,renderAll,applySize,watchWidth,validCols,layoutWall,fitH,onMeasure,fitOf,isTomb,setFrameCheck,checkFrames,dropCard,carouselBtnHTML,setCarousel,carSync,
  VERSION,verBadge,parseOne,ownerRefs,WALL_RE,REF_RE,autoCap,foldSync,markApproved,mdRender,mdDoc,mdInner,mdTag,MD_RE,MD_MAX,rawHash,insertDialog,resizeStart,setWallSync,wallMe,setOwnerToken,ownerToken,syncBtnHTML,reviewOpen,modelDoc,modelTag,parseModelTag,isModelFile,modelExt,M3D_EXT,M3D_OK,MODEL_W,MODEL_H,ZONES,ZNAME,ZORDERS,validOrder,applyZoneOrder,zoneBtnHTML,zonePaint,zoneCounts,bindZones,validZones,FDEF,FILTER_MIN,applyView,zoneAInit,zoneAUpdate,zoneCInit,zoneCUpdate,playFX,fxInit,fxSetFw,fxSetFly,fxState,fxDefaults,fxShow,fxAvailable,sndSet,fxBtnHTML,filterBtnHTML,filterBarHTML,bindFilter,setMetaFetch:()=>{},fetchMeta:()=>{},parseDur,fmtDur,
  I18N,t,colsText,setLangCode,getLang,applyI18n,langSelectHTML,menuHTML,updateLayoutUI,bindMenu,randomSize,shuffled,shuffleBtnHTML,reorderAnimated,
  validSprites,saveFile,bootReadonly
};
})();
