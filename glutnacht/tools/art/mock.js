const {chromium}=require('playwright');const fs=require('fs');
const D='file:///tmp/claude-0/overhaul/art/dl/dcss/x/Dungeon%20Crawl%20Stone%20Soup%20Full/';
const X='file:///tmp/claude-0/overhaul/art/dl/0x72/frames/';
const P='file:///tmp/claude-0/overhaul/art/repos/shorepine-kenney/2d/Particle%20Pack/PNG%20(Transparent)/';
const html=`<!doctype html><body style="margin:0;background:#000;color:#ccc;font:14px system-ui">
<div style="display:flex;gap:10px;padding:10px"><div><div>A: DCSS 32px (graveyard, static sprites, Kenney particle VFX tinted)</div><canvas id=a width=480 height=300 style="width:960px;height:600px;image-rendering:pixelated"></canvas></div></div>
<div style="display:flex;gap:10px;padding:10px"><div><div>B: 0x72 16px (keep, 4-frame anim, Kenney particle VFX tinted)</div><canvas id=b width=480 height=300 style="width:960px;height:600px;image-rendering:pixelated"></canvas></div></div>
<script>
const L=s=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>{console.log('ERR '+s);r(null)};i.src=s});
function tint(img,col,size){const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');g.drawImage(img,0,0,size,size);g.globalCompositeOperation='source-in';g.fillStyle=col;g.fillRect(0,0,size,size);return c}
function glow(g,img,x,y,s,col,a){g.save();g.globalCompositeOperation='lighter';g.globalAlpha=a||1;g.drawImage(tint(img,col,s),x-s/2,y-s/2);g.restore()}
function vign(g,w,h,cx,cy){const r=g.createRadialGradient(cx,cy,30,cx,cy,280);r.addColorStop(0,'rgba(0,0,0,0)');r.addColorStop(1,'rgba(5,0,15,.85)');g.fillStyle=r;g.fillRect(0,0,w,h)}
function shadow(g,x,y,w){g.fillStyle='rgba(0,0,0,.45)';g.beginPath();g.ellipse(x,y,w/2,w/6,0,0,7);g.fill()}
(async()=>{
const D='${D}',X='${X}',P='${P}';
// A
let g=document.getElementById('a').getContext('2d');g.imageSmoothingEnabled=false;
const gr=await Promise.all(['grass/grass_0_new','grass/grass_1_new','grass/grass_2_new','grass/grass_0_new','grass/grass_1_new','grass/grass_2_new','grass/grass_flowers_red_1_new'].map(n=>L(D+'dungeon/floor/'+n+'.png')));
for(let y=0;y<300;y+=32)for(let x=0;x<480;x+=32){const t=gr[((x*7+y*13+((x*y)>>3))>>5)%gr.length]||gr[0];g.drawImage(t,x,y)}
const sp=async(n,x,y)=>{const i=await L(D+n+'.png');if(!i)return;shadow(g,x+16,y+30,22);g.drawImage(i,x,y)};
for(const [n,x,y] of [['dungeon/statues/statue_wraith',60,40],['dungeon/trees/tree_1_red',380,30],['dungeon/boulder',300,220],['monster/fungi_plants/deathcap',90,230],['item/food/bone',200,60]]) await sp(n,x,y);
const pc=await L(P+'circle_03.png'),pm=await L(P+'magic_01.png'),ps=await L(P+'slash_02.png'),pl=await L(P+'light_01.png');
glow(g,pc,240,150,110,'#ff7a2a',.5);
await sp('monster/undead/wraith',150,110);await sp('monster/animals/bat',320,90);await sp('monster/undead/skeletons/skeleton_humanoid_small_new',330,150);await sp('monster/undead/ghost_new',140,170);await sp('monster/amorphous/jelly',380,170);await sp('monster/ogre_new',40,120);
await sp('monster/hell_knight_new',224,134);
glow(g,ps,280,150,60,'#ffd27a',.9);glow(g,pm,180,100,40,'#a07aff',1);
const gem=await L(D+'item/amulet/crystal_green.png');for(const [x,y] of [[260,200],[200,210],[110,90]])g.drawImage(gem,x,y,16,16);
const fire=await L(D+'effect/cloud_fire_1.png');g.globalAlpha=.9;g.drawImage(fire,300,40);g.globalAlpha=1;
vign(g,480,300,240,150);
// B
g=document.getElementById('b').getContext('2d');g.imageSmoothingEnabled=false;
const fl=await Promise.all([1,1,1,1,1,1,1,1,1,2,3,4,5,6,7,8].map(n=>L(X+'floor_'+n+'.png')));
for(let y=0;y<300;y+=16)for(let x=0;x<480;x+=16){g.drawImage(fl[((x*7+y*13)>>4)%fl.length],x,y)}
const sx=async(n,x,y,sc=1)=>{const i=await L(X+n+'.png');if(!i)return;shadow(g,x+i.width*sc/2,y+i.height*sc-1,i.width*sc*.8);g.drawImage(i,x,y,i.width*sc,i.height*sc)};
glow(g,pc,240,150,90,'#ff7a2a',.5);
for(const [n,x,y] of [['skelet_idle_anim_f1',300,120],['skelet_idle_anim_f2',330,160],['swampy_anim_f0',150,180],['necromancer_anim_f1',120,110],['ogre_idle_anim_f0',40,120],['big_demon_idle_anim_f1',380,60],['tiny_zombie_idle_anim_f0',200,90],['imp_idle_anim_f2',270,210],['skull',90,240],['crate',60,40],['column',420,200]]) await sx(n,x,y);
await sx('knight_m_idle_anim_f0',232,136);
glow(g,ps,262,150,44,'#ffd27a',.9);glow(g,pm,180,110,30,'#a07aff',1);
const fb=await L(X+'flask_blue.png');for(const [x,y] of [[260,200],[200,210],[110,90]])g.drawImage(fb,x,y);
vign(g,480,300,240,150);
document.title='done';})();
</script>`;
fs.writeFileSync('/tmp/claude-0/overhaul/art/sheets/mock_scenes.html',html);
(async()=>{const b=await chromium.launch({args:['--allow-file-access-from-files']});const pg=await b.newPage({viewport:{width:990,height:1300}});pg.on('console',m=>console.log(m.text()));
await pg.goto('file:///tmp/claude-0/overhaul/art/sheets/mock_scenes.html');await pg.waitForFunction(()=>document.title==='done',null,{timeout:20000});
await pg.screenshot({path:'/tmp/claude-0/overhaul/art/sheets/mock_scenes_dcss_vs_0x72.png',fullPage:true});await b.close();console.log('ok')})();
