-- Hero stats and weapon stats (web computeStats, refreshStats, refreshWeapon), per player.
local K = if script then require(script.Parent.K) else require("./K")
local Heroes = if script then require(script.Parent.Data.Heroes) else require("./Data/Heroes")
local Forge = if script then require(script.Parent.Data.Forge) else require("./Data/Forge")
local Passives = if script then require(script.Parent.Data.Passives) else require("./Data/Passives")
local Weapons = if script then require(script.Parent.Data.Weapons) else require("./Data/Weapons")
local Util = if script then require(script.Parent.Util) else require("./Util")

local Stats = {}

-- keys of the stats table in a fixed order (adding bonuses in a fixed order keeps float results deterministic)
local KEYS = {
	"maxHp",
	"maxHpMul",
	"speedMul",
	"armor",
	"regen",
	"might",
	"area",
	"cooldown",
	"amount",
	"duration",
	"projSpeed",
	"magnetMul",
	"luck",
	"growth",
	"greed",
	"crit",
	"revival",
	"rerolls",
	"skips",
	"banish",
}
Stats.KEYS = KEYS

local function add(s, o, mul)
	-- iterate the fixed key list, not the bonus table (deterministic order, same as web insertion order effects)
	for _, k in KEYS do
		local v = o[k]
		if v ~= nil then
			s[k] += v * mul
		end
	end
end

-- heroId, forge = { [shopId] = level }, passives = { { id, level } }
function Stats.compute(heroId: string, forge: { [string]: number }?, passives: { any }): { [string]: number }
	local s = {
		maxHp = 100,
		maxHpMul = 1,
		speedMul = 1,
		armor = 0,
		regen = 0,
		might = 1,
		area = 1,
		cooldown = 1,
		amount = 0,
		duration = 1,
		projSpeed = 1,
		magnetMul = 1,
		luck = 1,
		growth = 1,
		greed = 1,
		crit = 0.05,
		revival = 0,
		rerolls = 0,
		skips = 0,
		banish = 0,
	}
	local hero = Heroes.byId[heroId] or Heroes.byId.aron
	add(s, hero.bonus, 1)
	if forge then
		for _, item in Forge.list do
			local lvl = forge[item.id] or 0
			if lvl > 0 then
				add(s, item.per, lvl)
			end
		end
	end
	for _, pa in passives do
		add(s, Passives.byId[pa.id].per, pa.level)
	end
	s.maxHp = Util.round(s.maxHp * s.maxHpMul)
	s.speed = 150 * s.speedMul
	s.magnet = 70 * s.magnetMul
	s.cooldown = math.max(0.45, s.cooldown)
	return s
end

local WKEYS = { "dmg", "cd", "amount", "speed", "pierce", "area", "dur", "crit" }

-- w = { id, level, evo }, s = hero stats -> w.st
function Stats.weapon(w: any, s: { [string]: number })
	local def = Weapons.byId[w.id]
	local st = { crit = 0 }
	for _, k in WKEYS do
		if def.base[k] ~= nil then
			st[k] = def.base[k]
		end
	end
	for i = 1, w.level - 1 do
		local inc = def.levels[i]
		for _, k in WKEYS do
			if inc[k] ~= nil then
				st[k] = (st[k] or 0) + inc[k]
			end
		end
	end
	if w.evo then
		for _, k in WKEYS do
			local v = def.evo.stats[k]
			if v ~= nil then
				st[k] = (st[k] or 0) + v
			end
		end
	end
	st.dmg *= s.might
	st.cd = math.max(0.1, st.cd * s.cooldown)
	st.amount = math.max(1, Util.round(st.amount + s.amount))
	st.area *= s.area
	st.dur *= s.duration
	st.speed *= s.projSpeed
	st.crit += s.crit
	w.st = st
end

-- player-level helpers
function K.refreshStats(_run, pl)
	local oldMax = if pl.stats then pl.stats.maxHp else 0
	pl.stats = Stats.compute(pl.heroId, pl.forge, pl.passives)
	if pl.stats.maxHp > oldMax and oldMax > 0 then
		pl.hp += pl.stats.maxHp - oldMax
	end
	pl.hp = math.min(pl.hp, pl.stats.maxHp)
	for _, w in pl.weapons do
		Stats.weapon(w, pl.stats)
	end
end

function K.addWeapon(_run, pl, id: string)
	local w = {
		id = id,
		level = 1,
		evo = false,
		cdT = 0.4,
		burst = 0,
		burstT = 0,
		burstI = 0,
		ang = 0,
		active = 0,
		aim = 0,
		st = nil,
		orbs = {},
		rad = 0,
		orbitSent = -1,
	}
	table.insert(pl.weapons, w)
	Stats.weapon(w, pl.stats)
	return w
end

function K.hasPassive(pl, id: string): boolean
	for _, p in pl.passives do
		if p.id == id then
			return true
		end
	end
	return false
end

function K.canEvolve(pl, w): boolean
	return not w.evo and w.level >= Weapons.WEAPON_MAX and K.hasPassive(pl, Weapons.byId[w.id].evo.with)
end

return Stats
