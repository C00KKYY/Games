// usage: node sheet.js spec.json out.png
const fs=require('fs'),path=require('path');const {chromium}=require('playwright');
const spec=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const out=process.argv[3];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sc=spec.scale||3;
let h=`<!doctype html><meta charset=utf-8><style>
body{margin:0;padding:16px;background:${spec.bg||'#1a1620'};color:#ddd;font:12px/1.3 system-ui,sans-serif;width:${spec.width||1600}px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:14px 0 6px;color:#f0b060;border-bottom:1px solid #444}
.sub{color:#999;margin-bottom:8px}.grid{display:flex;flex-wrap:wrap;gap:8px}
.it{background:${spec.cell||'#2a2430'};padding:6px;border-radius:4px;display:flex;flex-direction:column;align-items:center;max-width:${spec.cellmax||260}px}
.imgs{display:flex;gap:3px;align-items:flex-end;flex-wrap:wrap;justify-content:center}
.imgs img{image-rendering:pixelated}.lb{margin-top:4px;text-align:center;font-weight:600;color:#eee}.nt{color:#aaa;text-align:center;font-size:11px}
.miss{color:#f66;font-size:11px}</style><h1>${esc(spec.title)}</h1><div class=sub>${esc(spec.subtitle||'')}</div>`;
let missing=[];
for(const sec of spec.sections){h+=`<h2>${esc(sec.name)}</h2><div class=grid>`;
 for(const it of sec.items){h+=`<div class=it><div class=imgs>`;
  for(const f of (it.files||[])){const p=path.resolve(spec.root||'.',f);
   if(!fs.existsSync(p)){missing.push(p);h+=`<span class=miss>missing ${esc(path.basename(f))}</span>`;continue}
   const s=it.scale||sec.scale||sc;h+=`<img src="file://${encodeURI(p).replace(/#/g,'%23')}" data-s="${s}">`;}
  h+=`</div><div class=lb>${esc(it.label)}</div>${it.note?`<div class=nt>${esc(it.note)}</div>`:''}</div>`;}
 h+='</div>';}
h+=`<script>for(const i of document.images){const f=()=>{const s=+i.dataset.s;let w=i.naturalWidth*s,hh=i.naturalHeight*s;if(w>${spec.maxpx||200}){const k=${spec.maxpx||200}/w;w*=k;hh*=k}i.width=w;i.height=hh};i.complete?f():i.onload=f}</script>`;
const tmp=out.replace(/\.png$/,'.html');fs.writeFileSync(tmp,h);
(async()=>{const b=await chromium.launch({args:['--allow-file-access-from-files']});const pg=await b.newPage({viewport:{width:(spec.width||1600)+32,height:800}});
await pg.goto('file://'+tmp);await pg.waitForLoadState('networkidle');await pg.waitForTimeout(300);
await pg.screenshot({path:out,fullPage:true});await b.close();console.log('wrote',out,'missing',missing.length);missing.slice(0,20).forEach(m=>console.log(' ',m));})();
