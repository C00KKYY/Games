const t=n=>'2d/Tiny Dungeon/Tiles/tile_'+String(n).padStart(4,'0')+'.png';
const p=n=>'2d/Particle Pack/PNG (Transparent)/'+n+'.png';
const I=(label,files,note,scale)=>({label,files,note,scale});
const S=[
{name:'Tiny Dungeon (16x16, 132 tiles, 1 frame each) — heroes',scale:4,items:[
I('warden',[t(96),t(97)],'knights'),I('mage',[t(84),t(111)],'wizards'),I('hunter',[t(112)],'ranger'),I('priestess',[t(99),t(100)],''),I('smith',[t(87),t(86)],''),
I('storm witch',[t(84)],'tint'),I('frost warden',[t(97)],'tint'),I('lucky one',[t(85),t(98)],''),I('fire starter',[t(88)],'')]},
{name:'Tiny Dungeon — enemies & items',scale:4,items:[
I('bat',[t(120)]),I('slime',[t(108)]),I('skeleton',[],'GAP'),I('ghost',[t(121)]),I('ghoul/brute/golem/wraith',[t(109),t(110),t(122),t(123),t(124)],'cyclops, crab-demon, spider, rats — rest GAP'),
I('chest',[t(89),t(90),t(91),t(92)]),I('weapons',[t(103),t(104),t(106),t(107),t(117),t(118),t(119),t(129),t(130)]),I('potions',[t(113),t(114),t(115),t(116)]),
I('decor',[t(64),t(65),t(66),t(63),t(82),t(72)],'grave cross, tombstone, coffin...'),I('floors',[t(48),t(49),t(0),t(42),t(24),t(40)],'only tan/brown + stone')]},
{name:'Particle Pack (512x512 greyscale alpha, tint at runtime) — usable with ANY sprite set for weapon VFX',scale:0.18,items:[
I('blade slash',[p('slash_01'),p('slash_02'),p('slash_03'),p('slash_04')]),I('magic bolt / orbs',[p('magic_01'),p('magic_03'),p('magic_05'),p('light_01'),p('circle_05')]),
I('aura / frost nova ring',[p('circle_01'),p('circle_03'),p('twirl_01'),p('twirl_02')]),I('lightning',[p('spark_05'),p('spark_06'),p('trace_01'),p('trace_04')]),
I('fire / puddle',[p('fire_01'),p('flame_02'),p('flame_05'),p('scorch_01')]),I('hit sparks / stars',[p('star_06'),p('star_09'),p('spark_01'),p('flare_01')]),I('smoke',[p('smoke_02'),p('smoke_07')])]},
{name:'Smoke Particles (explosion 9 frames)',scale:0.3,items:[I('explosion / bomb',Array.from({length:9},(_,i)=>'2d/Smoke Particles/Explosion/explosion0'+i+'.png'))]},
{name:'Game Icons (100x100 flat white) — system UI only, NOT passive icons',scale:0.5,items:[
I('menu',['icons/Game Icons/White/2x/pause.png','icons/Game Icons/White/2x/gear.png','icons/Game Icons/White/2x/musicOn.png','icons/Game Icons/White/2x/audioOn.png','icons/Game Icons/White/2x/trophy.png','icons/Game Icons/White/2x/star.png','icons/Game Icons/White/2x/locked.png','icons/Game Icons/White/2x/target.png'])]}];
require('fs').writeFileSync(__dirname+'/spec_kenney.json',JSON.stringify({title:'Kenney (CC0) — Tiny Dungeon + Particle Pack + Smoke Particles + Game Icons',subtitle:'Fetched via git sparse clone of github.com/shorepine/kenney (full Kenney library mirror, CC0). kenney.nl itself returns 403 to curl from this container.',root:'/tmp/claude-0/overhaul/art/repos/shorepine-kenney',scale:4,width:1500,cellmax:520,maxpx:110,bg:'#14111a',sections:S}));
