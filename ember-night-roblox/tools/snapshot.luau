-- Renders the client as it would look (development aid, no Studio here): plays a scene with the whole client on
-- Lune's Instances against the real server services (tests/lib/Arena.luau) and draws the workspace through the
-- client camera plus the ScreenGuis as rectangles (tests/lib/Snap.luau) into PNG files.
-- Usage: lune run tools/snapshot.luau -- <scene> <out.png> [width height [zoom]]
-- Scenes: hub, run (graveyard 60 s), land:<stageId>, enemies[:<stageId>], boss:<bossId>, levelup, chest, downed,
-- results, phone (run on a 844 x 390 screen)
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local Arena = require("../tests/lib/Arena")
local Snap = require("../tests/lib/Snap")
local Run = require("../src/shared/Sim/Run")
local Stages = require("../src/shared/Sim/Data/Stages")
local Enemies = require("../src/shared/Sim/Data/Enemies")
local K = Run.K

local args = table.clone(process.args)
if args[1] == "--" then
	table.remove(args, 1)
end
local scene = args[1] or "run"
local out = args[2] or "snapshot.png"
local W, H = tonumber(args[3]) or 1280, tonumber(args[4]) or 720
local ZOOM = tonumber(args[5]) or 1 -- render-only zoom (narrower field of view) to look at models closely
if scene == "phone" then
	W, H = 844, 390
end
Arena.Roblox.viewport = roblox.Vector2.new(W, H)

local n = if scene == "downed" or string.find(scene, "^boss") then 2 else 1
local a = Arena.new(n)
local function start(stageId, heat)
	local parts = {}
	for _, p in a.players do
		table.insert(parts, { player = p, hero = if #parts == 0 then "mira" else "brom" })
	end
	a.rb.deps.RunHost.start(parts, stageId, heat or 0)
	a:frames(0.5)
end
local Controls = a:client("Input/Controls")
local tt = 0
Controls.move = function()
	tt += 1 / 30
	return math.cos(tt * 0.5), math.sin(tt * 0.5) * 0.6
end

local function spawnAll(run)
	local p = run.players[1]
	local types = table.clone(Enemies.ORDER)
	table.remove(types)
	for i, id in types do
		local ang = i / #types * math.pi * 2
		local e = K.spawnEnemy(run, id, p.x + math.cos(ang) * 230, p.y + math.sin(ang) * 150)
		if e and i % 4 == 0 then
			e.elite = true
		end
	end
end

if scene == "hub" then
	a:frames(1)
elseif scene == "run" or scene == "phone" then
	start("graveyard")
	a:frames(60, true)
elseif string.find(scene, "^land:") then
	start(string.sub(scene, 6))
	a:frames(25, true)
elseif string.find(scene, "^enemies") then
	start(string.sub(scene, 9) ~= "" and string.sub(scene, 9) or "graveyard")
	Controls.move = function()
		return 0, 0
	end
	a:frames(2, true)
	spawnAll(a:run())
	a:frames(1.2, true)
elseif string.find(scene, "^boss:") then
	local id = string.sub(scene, 6)
	local def, land
	for _, s in Stages.list do
		for _, b in s.bosses do
			if b.id == id then
				def, land = b, s
			end
		end
	end
	assert(def, "unknown boss " .. id)
	start(land.id, 3)
	Controls.move = function()
		return 0, 0
	end
	a:frames(2, true)
	local run = a:run()
	K.spawnBoss(run, def, 1)
	local b = run.enemies[#run.enemies]
	b.x, b.y = run.players[1].x + 160, run.players[1].y - 60
	a:frames(4, true)
elseif scene == "levelup" or scene == "chest" then
	start("ashwood")
	local run = a:run()
	a:frames(5, true)
	if scene == "levelup" then
		K.gainXp(run, run.players[1], 50)
	else
		K.openChest(run, run.players[1])
	end
	for _ = 1, 20 do
		a:frame(true)
	end
elseif scene == "downed" then
	start("frostlake")
	a:frames(15, true)
	local run = a:run()
	local me = run.players[1]
	me.iframe, me.wardT, me.revivals = 0, 0, 0
	K.hurtPlayer(run, me, 1e6, "test")
	a:frames(1.5)
elseif scene == "results" then
	start("ruins")
	a:frames(20, true)
	a.cnet.command({ op = "pause" })
	a:frames(0.2)
	a.cnet.command({ op = "giveup" })
	a:frames(1)
end
assert(#a:errors() == 0, table.concat(a:errors(), "\n"))
local sky = { 10, 8, 18 }
local img = Snap.world(a.rb.workspace, W, H, sky, ZOOM)
if ZOOM == 1 then
	Snap.ui(img, a.rb.playerGui)
end
Snap.save(img, out)
print("wrote " .. out)
