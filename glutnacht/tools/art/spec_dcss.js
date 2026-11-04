const L=require('fs').readFileSync(__dirname+'/dcss_list.txt','utf8').trim().split('\n');
const R=n=>{if(n.includes('/'))return n;const m=L.filter(p=>p.endsWith('/'+n+'.png'));if(!m.length){console.error('unresolved',n);return 'MISSING/'+n+'.png'}return m.sort((a,b)=>a.length-b.length)[0]};
const I=(label,names,note)=>({label,files:names.map(R),note});
const S=[
{name:'Heroes (9) — single static 32x32 tile each (no animation frames). Alternative: paper-doll from player/base + body/head/hand layers',items:[
I('warden',['hell_knight_new','death_knight'],'hell_knight / death_knight'),I('mage',['wizard','deep_elf_mage'],'wizard'),I('hunter',['deep_elf_master_archer'],'master archer'),
I('priestess',['deep_elf_high_priest'],'high priest'),I('smith',['deep_dwarf','dwarf_new'],'deep dwarf'),I('storm witch',['salamander_stormcaller','enchantress_human'],'stormcaller / enchantress'),
I('frost warden',['vampire_knight_new'],'tint icy'),I('lucky one',['halfling_new'],'halfling'),I('fire starter',['deep_elf_annihilator','necromancer_new'],'annihilator'),
I('paper-doll bases',['human_male','human_female','elf_female','dwarf_male'],'player/base/* + gear layers')]},
{name:'Enemies (all static 32x32)',items:[
I('bat',['bat','giant_bat','fire_bat'],'bat / giant / fire'),I('slime',['jelly','ooze_new','acid_blob','azure_jelly_new','death_ooze_new'],'jelly / oozes (tint variants)'),
I('skeleton',['skeleton_humanoid_small_new','skeletal_warrior_new'],''),I('ghost',['ghost_new','phantom_new','hungry_ghost'],''),
I('ghoul',['monster/undead/ghoul.png','monster/undead/mummy.png'],''),I('spitter (ranged)',['giant_eyeball','golden_eye_new','eye_of_draining'],'floating eyes'),
I('wraith',['wraith','shadow_wraith'],''),I('brute / ogre',['ogre_new','two_headed_ogre_new','ettin_new'],''),I('golem',['stone_golem','clay_golem','iron_golem','crystal_golem'],'')]},
{name:'Boss candidates (15+, all distinct art, static)',items:[
I('undead lords',['lich','ancient_lich_new','wight_king','vampire_knight_new','greater_mummy'],''),
I('giants/brutes',['fire_giant_new','frost_giant_new','titan_new','juggernaut'],''),
I('horrors',['great_orb_of_eyes','bone_dragon_new','executioner','green_death','blizzard_demon','ice_fiend'],'')]},
{name:'Weapon effects / projectiles (DCSS effect/ has 8-direction projectiles + 3-frame clouds)',items:[
I('magic bolt',['magic_bolt_1','magic_bolt_3','magic_dart_0'],'8 directions'),I('whip/blade slash',[],'GAP — no slash arcs (use Kenney particle slash)'),
I('orbiting orbs',['orb_glow_0','orb_glow_1','monster/nonliving/orb_of_fire_new.png','orb_of_electricity'],''),I('aura',['heataura_0','goldaura_0','cloud_magic_trail_0'],''),
I('lightning',['ball_lightning','cloud_storm_1','zap_0'],'no bolt strip — GAP'),I('sickle boomerang',['item/weapon/scythe_1_new.png','iron_shot_0'],'scythe item'),
I('fire bottle + puddle',['item/potion/ruby_new.png','cloud_fire_0','cloud_fire_1','cloud_fire_2'],'3-frame fire cloud'),I('frost nova ring',['cloud_cold_0','cloud_cold_1','frost_0','icicle_0'],'ring shape GAP'),
I('daggers',['dart_0','needle_0','item/weapon/dagger_3.png'],'8 directions')]},
{name:'Pickups / props',items:[
I('XP gems',['item/misc/misc_crystal_new.png','item/amulet/crystal_green.png','item/amulet/crystal_red.png','item/amulet/crystal_white.png','item/wand/gem_glass_new.png'],'weak fit — tint'),
I('gold',['gold_pile_1','gold_pile_5','gold_pile_10'],'piles, no coin spin'),I('chest',['dungeon/chest.png','dungeon/chest_2_closed.png','dungeon/chest_2_open.png'],''),
I('heart',['misc/brands/top_right/heart_new.png','item/potion/ruby_new.png'],'tiny brand overlay — weak'),I('magnet',[],'GAP'),I('bomb',[],'GAP'),
I('brazier',['torch_0','torch_1','torch_2','torch_3'],'wall torch 4 frames — brazier GAP')]},
{name:'Decor',items:[
I('graves/crosses',['dungeon/vaults/sarcophagus_sealed.png','dungeon/statues/statue_wraith.png','dungeon/statues/crumbled_column_1.png'],'no gravestones — GAP'),
I('rocks',['dungeon/boulder.png','dungeon/statues/granite_stump_new.png'],''),I('mushrooms/plants',['wandering_mushroom_new','deathcap','bush_2','plant'],'monster tiles reused'),
I('bones/blood',['item/food/bone.png','green_bones_1','blood_red_3_new','blood_puddle_red'],''),I('trees/stumps',['tree_1_red','tree_2_yellow','mangrove_1'],'')]},
{name:'Ground tiles (32x32, several variants each) for the 5 lands',items:[
I('graveyard grass',['dungeon/floor/grass/grass_0_new.png','dungeon/floor/grass/grass_flowers_red_1_new.png','dungeon/floor/grass/grass0-dirt-mix_1.png','dungeon/floor/grey_dirt_2_old.png'],''),
I('burnt forest ash',['volcanic_floor_0','volcanic_floor_2','grey_dirt_b_0','mud_0'],''),
I('frozen lake ice',['ice_0_new','ice_1_new','frozen_0','frozen_3'],''),
I('ruined keep stone',['dungeon/floor/rect_gray_0_new.png','crypt_10','limestone_0','tomb_0_new'],''),
I('violet void',['crystal_floor_0','black_cobalt_1','infernal_1','etched_0'],'tint to violet')]},
{name:'UI icons for passives (32x32 spell icons, 400+ available)',items:[
I('might/damage',['spells/enchantment/berserker_rage_new.png']),I('armor',['spells/earth/stoneskin_new.png']),I('max HP',['spells/necromancy/regeneration_new.png']),
I('speed',['spells/air/swiftness_new.png']),I('cooldown/haste',['spells/enchantment/haste_new.png']),I('area',['spells/fire/ring_of_flames_new.png']),
I('projectiles',['spells/conjuration/magic_dart.png']),I('duration',['spells/enchantment/extension.png']),I('magnet',['spells/translocation/apportation_new.png']),
I('luck',['spells/divination/detect_items.png']),I('revive',['spells/necromancy/deaths_door_new.png']),I('curse',['spells/enchantment/cause_fear_new.png']),
I('fire',['spells/fire/fireball_new.png']),I('frost',['spells/ice/freezing_aura.png']),I('lightning',['spells/air/chain_lightning_new.png']),I('orbs',['spells/conjuration/battlesphere.png']),I('growth/xp',['spells/divination/magic_mapping.png'])].map(x=>({...x,files:x.files.map(f=>f.startsWith('spells/')?'gui/'+f:f)}))}];
require('fs').writeFileSync(__dirname+'/spec_dcss.json',JSON.stringify({title:'Dungeon Crawl Stone Soup 32x32 tiles (CC0) — mapping to Ember Night',subtitle:'Shown at 2x. Source: opengameart.org/content/dungeon-crawl-32x32-tiles (zip "Dungeon Crawl Stone Soup Full_0.zip", 5.7 MB, 6029 PNGs). Static tiles: animate via code (bob/squash/flash).',root:'/tmp/claude-0/overhaul/art/dl/dcss/x/Dungeon Crawl Stone Soup Full',scale:2,width:1500,cellmax:340,maxpx:200,sections:S}));
