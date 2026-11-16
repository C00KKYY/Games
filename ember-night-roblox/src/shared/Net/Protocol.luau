-- Remote names, message ids, event kinds and lookup tables shared by server and client (docs/DESIGN.md §3.1,
-- Appendix B). Pure data.
local Enemies = if script then require(script.Parent.Parent.Sim.Data.Enemies) else require("../Sim/Data/Enemies")
local Weapons = if script then require(script.Parent.Parent.Sim.Data.Weapons) else require("../Sim/Data/Weapons")

local Protocol = {}

Protocol.REMOTES = {
	Move = "UnreliableRemoteEvent", -- client -> server, Move packet (buffer, 14 B)
	Snap = "UnreliableRemoteEvent", -- server -> client, snapshot packets (buffer, <= 900 B)
	Ev = "RemoteEvent", -- server -> client, one event buffer per step
	Ui = "RemoteEvent", -- server -> client, Lua tables (low frequency)
	Cmd = "RemoteEvent", -- client -> server, { op = "...", ... }
	Query = "RemoteFunction", -- client -> server, profile view / shop data
}

Protocol.MSG_SNAP = 1
Protocol.MSG_MOVE = 2
Protocol.MSG_EV = 3

-- binary event kinds (Appendix B.3); everything else goes out as Ui tables
Protocol.EV = {
	kill = 1,
	dmg = 2,
	["eshot+"] = 3,
	["eshot-"] = 4,
	["tele+"] = 5,
	["tele~"] = 6,
	["tele-"] = 7,
	["haz+"] = 8,
	["haz-"] = 9,
	["pick+"] = 10,
	["pick~"] = 11,
	["pick-"] = 12,
	gemPull = 13,
	gemGot = 14,
	fire = 15,
	orbit = 16,
	sfx = 17,
	shake = 18,
	["prop-"] = 19,
	["gem+"] = 20,
	boom = 21,
	burst = 22,
	arc = 23,
	pool = 24,
	["shot-"] = 25,
	despawn = 26,
	warp = 27,
	aura = 28,
	flash = 29,
	["haz~"] = 30,
	text = 31,
}
Protocol.EV_NAME = {}
for k, v in Protocol.EV do
	Protocol.EV_NAME[v] = k
end

-- sim events that become Ui messages (reliable tables)
Protocol.UI_EVENTS = {
	banner = true,
	countdown = true,
	levelup = true,
	levelupDone = true,
	chest = true,
	state = true,
	victory = true,
	gameOver = true,
	boss = true,
	hurt = true,
	down = true,
	revived = true,
	ward = true,
	correct = true,
	vote = true,
	endless = true,
	left = true,
	start = true,
}

-- enemy type index (wire): 0-based position in Enemies.ORDER
Protocol.TYPE_INDEX = {}
for i, id in Enemies.ORDER do
	Protocol.TYPE_INDEX[id] = i - 1
end
Protocol.TYPE_NAME = Enemies.ORDER

Protocol.WEAPON_INDEX = {}
for i, id in Weapons.ORDER do
	Protocol.WEAPON_INDEX[id] = i - 1
end
Protocol.WEAPON_NAME = Weapons.ORDER

Protocol.SFX = {
	"hit",
	"kill",
	"shoot",
	"slash",
	"zap",
	"throw",
	"knife",
	"nova",
	"orbit",
	"flask",
	"gem",
	"coin",
	"heal",
	"magnet",
	"bomb",
	"chestpick",
	"chest",
	"levelup",
	"hurt",
	"death",
	"revive",
	"boss",
	"bossdown",
	"summon",
	"dash",
	"slam",
	"break",
	"alarm",
	"warn",
	"tick",
	"surge",
	"achievement",
	"ewind",
	"efire",
	"eimpact",
	"victory",
}
Protocol.SFX_INDEX = {}
for i, n in Protocol.SFX do
	Protocol.SFX_INDEX[n] = i
end

Protocol.PICK_KINDS = { "coin", "bag", "heart", "magnet", "bomb", "chest" }
Protocol.PICK_INDEX = {}
for i, n in Protocol.PICK_KINDS do
	Protocol.PICK_INDEX[n] = i
end

Protocol.TELE_KINDS = { "circle", "lane", "line", "aim", "wedge", "ring" }
Protocol.SHOT_KINDS = { orb = 0, needle = 1, lance = 2 }
Protocol.SHOT_KIND_NAME = { [0] = "orb", [1] = "needle", [2] = "lance" }

Protocol.COLORS = { "#ff3d5a", "#ff8a5c", "#fff3c4", "#c9b8ff", "#5dff8f", "#ff5a6e", "#ffe27a", "#ffd23f", "#ffffff" }
Protocol.COLOR_INDEX = {}
for i, c in Protocol.COLORS do
	Protocol.COLOR_INDEX[c] = i
end

-- client commands accepted by the server, with their argument checks (server validates everything)
Protocol.COMMANDS = {
	pick = { i = "int1_4" },
	reroll = {},
	skip = {},
	banish = { i = "int1_4" },
	chestClose = {},
	pause = {},
	resume = {},
	vote = { endless = "bool" },
	giveup = {},
	-- lobby
	selectHero = { hero = "heroId" },
	selectStage = { stage = "stageId", heat = "int0_5" },
	ready = { on = "bool" },
	start = {},
	lang = { lang = "lang" },
}

return Protocol
