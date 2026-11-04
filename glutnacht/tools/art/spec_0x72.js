const A=(n,k=4)=>Array.from({length:k},(_,i)=>`frames/${n}_f${i}.png`);
const I=(label,files,note)=>({label,files:Array.isArray(files)?files:[files],note});
const S=[
{name:'Heroes (9 needed) — 4-frame idle shown; each also has 4-frame run (+1 hit frame for knight/elf/wizzard/lizard/dwarf)',items:[
I('warden',A('knight_m_idle_anim'),'knight_m 16x28'),I('mage',A('wizzard_m_idle_anim'),'wizzard_m'),I('hunter',A('elf_m_idle_anim'),'elf_m + weapon_bow'),
I('priestess',A('elf_f_idle_anim'),'elf_f (or angel)'),I('smith',A('dwarf_m_idle_anim'),'dwarf_m + weapon_big_hammer'),I('storm witch',A('wizzard_f_idle_anim'),'wizzard_f'),
I('frost warden',A('knight_f_idle_anim'),'knight_f (tint icy)'),I('lucky one',A('lizard_m_idle_anim'),'lizard_m (or doc / pumpkin_dude)'),I('fire starter',A('lizard_f_idle_anim'),'lizard_f / dwarf_f'),
I('spares',['frames/angel_idle_anim_f0.png','frames/doc_idle_anim_f0.png','frames/pumpkin_dude_idle_anim_f0.png','frames/dwarf_f_idle_anim_f0.png'],'angel, doc, pumpkin_dude, dwarf_f')]},
{name:'Enemies',items:[
I('bat',[],'GAP - no bat in pack'),I('slime',A('swampy_anim'),'swampy (also muddy)'),I('skeleton',A('skelet_idle_anim'),'skelet 16x16'),
I('ghost',[],'GAP - no ghost'),I('ghoul',['frames/zombie_anim_f1.png','frames/zombie_anim_f2.png','frames/zombie_anim_f3.png','frames/zombie_anim_f10.png'],'zombie / tiny_zombie / ice_zombie'),I('spitter (ranged)',A('orc_shaman_idle_anim'),'orc_shaman (or necromancer)'),
I('wraith',A('necromancer_anim'),'necromancer (weak fit)'),I('brute / ogre',A('ogre_idle_anim'),'ogre 32x36'),I('golem',A('muddy_anim'),'muddy (weak fit) — GAP'),
I('extra fodder',['frames/imp_idle_anim_f0.png','frames/goblin_idle_anim_f0.png','frames/tiny_zombie_idle_anim_f0.png','frames/ice_zombie_anim_f0.png','frames/tiny_slug_anim_f0.png','frames/chort_idle_anim_f0.png','frames/wogol_idle_anim_f0.png','frames/masked_orc_idle_anim_f0.png','frames/orc_warrior_idle_anim_f0.png'],'imp goblin tiny_zombie ice_zombie tiny_slug chort wogol masked_orc orc_warrior')]},
{name:'Boss candidates (32x36 bigs + scaled/tinted 16px)',items:[
I('big_demon',A('big_demon_idle_anim')),I('big_zombie',A('big_zombie_idle_anim')),I('ogre',['frames/ogre_idle_anim_f0.png']),I('slug',A('slug_anim'),'16x23'),I('necromancer',['frames/necromancer_anim_f0.png'])]},
{name:'Weapons / projectiles (only held weapon sprites; NO effects)',items:[
I('magic bolt',['frames/weapon_red_magic_staff.png','frames/weapon_green_magic_staff.png'],'staff only — bolt is GAP'),I('whip/blade slash',['frames/weapon_regular_sword.png','frames/weapon_katana.png'],'slash arc GAP'),
I('orbiting orbs',[],'GAP'),I('aura',[],'GAP'),I('lightning',[],'GAP'),I('sickle boomerang',['frames/weapon_throwing_axe.png'],'throwing axe stand-in'),
I('fire bottle',['frames/flask_big_red.png','frames/flask_red.png'],'puddle GAP'),I('frost nova',[],'GAP'),I('daggers',['frames/weapon_knife.png','frames/weapon_arrow.png'])]},
{name:'Pickups / props',items:[
I('XP gems',['frames/flask_blue.png','frames/flask_green.png','frames/flask_yellow.png','frames/flask_red.png'],'no gems — flasks only'),I('gold coin',A('coin_anim'),'6x7, 4 frames'),
I('chest',['frames/chest_full_open_anim_f0.png','frames/chest_full_open_anim_f1.png','frames/chest_full_open_anim_f2.png','frames/chest_mimic_open_anim_f2.png'],'3-frame open + mimic'),
I('heart',['frames/ui_heart_full.png','frames/ui_heart_half.png','frames/ui_heart_empty.png']),I('magnet',[],'GAP'),I('bomb',['frames/bomb_f0.png','frames/bomb_f1.png','frames/bomb_f2.png']),
I('brazier',['frames/wall_fountain_top_1.png','frames/column.png'],'GAP (no brazier/torch)'),I('crate / skull',['frames/crate.png','frames/skull.png'])]},
{name:'Decor & ground (dungeon stone only)',items:[
I('graves/crosses/rocks/mushrooms/stumps/flowers',[],'GAP — none outdoor'),I('bones',['frames/skull.png']),
I('stone floor (ruined keep)',['frames/floor_1.png','frames/floor_2.png','frames/floor_3.png','frames/floor_4.png','frames/floor_5.png','frames/floor_6.png','frames/floor_7.png','frames/floor_8.png'],'fits keep only'),
I('graveyard grass / ash / ice / void',[],'GAP — would need palette swaps of stone floor'),
I('walls/banners',['frames/wall_mid.png','frames/wall_banner_red.png','frames/wall_goo.png','frames/hole.png','frames/floor_spikes_anim_f3.png'])]},
{name:'UI icons for 17 passives',items:[I('icons',[],'GAP — none (only hearts)')]}];
require('fs').writeFileSync(__dirname+'/spec_0x72.json',JSON.stringify({title:'0x72 16x16 DungeonTileset II v1.7 (CC0) — mapping to Ember Night',subtitle:'Shown at 4x nearest-neighbour. Source: 0x72.itch.io/dungeontileset-ii; fetched via github.com/series-ai/jam-ready-assets (LFS media URLs). 374 PNGs, 1.6 MB.',root:'/tmp/claude-0/overhaul/art/dl/0x72',scale:4,width:1500,cellmax:330,maxpx:200,sections:S}));
