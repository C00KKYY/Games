-- Player profile (DataStore value, docs/DESIGN.md Appendix C): defaults, migration, sanitizing, stage and forge
-- helpers (web defaultSave, Store.load, stageBest, stageStars, stageUnlocked, stageMaxHeat, totalStars, shopPrice,
-- shopRefundValue). Pure; no Roblox services.
local Stages = if script then require(script.Parent.Data.Stages) else require("./Data/Stages")
local Heat = if script then require(script.Parent.Data.Heat) else require("./Data/Heat")
local Forge = if script then require(script.Parent.Data.Forge) else require("./Data/Forge")
local Heroes = if script then require(script.Parent.Data.Heroes) else require("./Data/Heroes")
local Util = if script then require(script.Parent.Util) else require("./Util")
local Cosmetics = if script then require(script.Parent.Parent.Config.Cosmetics) else require("../Config/Cosmetics")
local Products = if script then require(script.Parent.Parent.Config.Products) else require("../Config/Products")

local Profile = {}

-- version history: 1 = R1/R2 schema (Appendix C); 2 = R3: weapon colour "fx_crimson" became "fx_solar" (the
-- validator forbids effect colours in the enemy-shot hue family), equipped cosmetics are checked against the list
Profile.VERSION = 2
local STAT_KEYS = {
	"kills",
	"runs",
	"bestTime",
	"bestLevel",
	"bestKills",
	"wins",
	"evolutions",
	"bossKills",
	"chests",
	"goldEarned",
	"playTime",
	"coopRuns",
	"revivesGiven",
}
Profile.STAT_KEYS = STAT_KEYS

function Profile.default()
	local stats = {}
	for _, k in STAT_KEYS do
		stats[k] = 0
	end
	return {
		v = Profile.VERSION,
		gold = 0,
		shop = {},
		shopSpent = 0,
		giftGiven = false,
		chars = { "aron", "mira" },
		achievements = {},
		evolved = {},
		bosses = {},
		stats = stats,
		stages = {},
		stageSel = "graveyard",
		stageHeat = {},
		storySeen = {},
		lastChar = "aron",
		settings = { sfx = true, music = true, dmgNums = true, shake = true, lang = nil, camZoom = 1, lowFx = false },
		cosmetics = { owned = {}, equipped = {} }, -- equipped = { skin = id?, fx = id?, trail = id? }
		reviveTokens = 0,
		receipts = {},
		passCache = {},
		created = 0,
		lastSave = 0,
	}
end

local function num(v, lo: number, hi: number, def: number): number
	if type(v) ~= "number" or v ~= v then
		return def
	end
	return math.clamp(v, lo, hi)
end
local function int(v, lo, hi, def)
	return math.floor(num(v, lo, hi, def))
end
local function boolMap(t, valid: ((string) -> boolean)?)
	local out = {}
	if type(t) == "table" then
		for k, v in t do
			if type(k) == "string" and v == true and (not valid or valid(k)) then
				out[k] = true
			end
		end
	end
	return out
end

local stageIds, heroIds, forgeById = {}, {}, {}
for _, s in Stages.list do
	stageIds[s.id] = true
end
for _, id in Heroes.ORDER do
	heroIds[id] = true
end
for _, it in Forge.list do
	forgeById[it.id] = it
end

-- fill missing fields and fix types/ranges after loading (never trusts stored data)
function Profile.sanitize(d: any)
	local def = Profile.default()
	if type(d) ~= "table" then
		return def
	end
	local p = def
	p.v = Profile.VERSION
	p.gold = int(d.gold, 0, 1e12, 0)
	if type(d.shop) == "table" then
		for id, lvl in d.shop do
			local it = forgeById[id]
			if it then
				local l = int(lvl, 0, it.max, 0)
				if l > 0 then
					p.shop[id] = l
				end
			end
		end
	end
	p.shopSpent = int(d.shopSpent, 0, 1e12, 0)
	p.giftGiven = d.giftGiven == true
	if type(d.chars) == "table" then
		local seen = {}
		p.chars = {}
		for _, id in { "aron", "mira" } do
			table.insert(p.chars, id)
			seen[id] = true
		end
		for _, id in d.chars do
			if type(id) == "string" and heroIds[id] and not seen[id] then
				seen[id] = true
				table.insert(p.chars, id)
			end
		end
	end
	p.achievements = boolMap(d.achievements)
	p.evolved = boolMap(d.evolved)
	p.bosses = boolMap(d.bosses)
	if type(d.stats) == "table" then
		for _, k in STAT_KEYS do
			p.stats[k] = num(d.stats[k], 0, 1e15, 0)
		end
	end
	if type(d.stages) == "table" then
		for id, h in d.stages do
			if stageIds[id] then
				p.stages[id] = int(h, -1, #Heat.list - 1, -1)
				if p.stages[id] < 0 then
					p.stages[id] = nil
				end
			end
		end
	end
	p.stageSel = if type(d.stageSel) == "string" and stageIds[d.stageSel] then d.stageSel else "graveyard"
	if type(d.stageHeat) == "table" then
		for id, h in d.stageHeat do
			if stageIds[id] then
				p.stageHeat[id] = int(h, 0, #Heat.list - 1, 0)
			end
		end
	end
	p.storySeen = boolMap(d.storySeen)
	p.lastChar = if type(d.lastChar) == "string" and heroIds[d.lastChar] then d.lastChar else "aron"
	if type(d.settings) == "table" then
		local s = d.settings
		for _, k in { "sfx", "music", "dmgNums", "shake", "lowFx" } do
			if type(s[k]) == "boolean" then
				p.settings[k] = s[k]
			end
		end
		p.settings.lang = if s.lang == "de" or s.lang == "en" then s.lang else nil
		p.settings.camZoom = num(s.camZoom, 0.7, 1.3, 1)
	end
	if type(d.cosmetics) == "table" then
		p.cosmetics.owned = boolMap(d.cosmetics.owned, function(id)
			return Cosmetics.byId[id] ~= nil
		end)
		if type(d.cosmetics.equipped) == "table" then
			for _, k in Cosmetics.SLOTS do
				local v = d.cosmetics.equipped[k]
				local c = type(v) == "string" and Cosmetics.byId[v]
				if c and c.slot == k then
					p.cosmetics.equipped[k] = v
				end
			end
		end
	end
	p.reviveTokens = int(d.reviveTokens, 0, 1000, 0)
	if type(d.receipts) == "table" then
		for k, v in d.receipts do
			if type(k) == "string" and type(v) == "number" then
				p.receipts[k] = v
			end
		end
	end
	p.passCache = boolMap(d.passCache, function(key)
		local it = Products.byKey[key]
		return it ~= nil and it.kind == "pass"
	end)
	p.created = num(d.created, 0, 1e12, 0)
	p.lastSave = num(d.lastSave, 0, 1e12, 0)
	local lock = d._lock
	if type(lock) == "table" and type(lock.job) == "string" and type(lock.t) == "number" then
		p._lock = { job = lock.job, t = lock.t }
	end
	return p
end

local function deepCopy(t: any): any
	if type(t) ~= "table" then
		return t
	end
	local out = {}
	for k, v in t do
		out[k] = deepCopy(v)
	end
	return out
end
Profile.deepCopy = deepCopy

-- one step per version: MIGRATIONS[v] turns a version-v table into version v + 1 (works on a copy)
local MIGRATIONS = {
	[1] = function(d)
		local c = d.cosmetics
		if type(c) == "table" then
			if type(c.owned) == "table" and c.owned.fx_crimson then
				c.owned.fx_crimson = nil
				c.owned.fx_solar = true
			end
			if type(c.equipped) == "table" and c.equipped.fx == "fx_crimson" then
				c.equipped.fx = "fx_solar"
			end
		end
		if type(d.passCache) == "table" then
			d.passCache.fx_crimson = nil
		end
	end,
}
Profile.MIGRATIONS = MIGRATIONS

-- stored value -> current profile. Returns nil, "newer" for data written by a newer server version (a rolling
-- update): such a profile must not be loaded here, or saving would drop its new fields. A missing or broken
-- version counts as 1. Never mutates `d`.
function Profile.migrate(d: any): (any, string?)
	if type(d) ~= "table" then
		return Profile.default(), nil
	end
	local v = if type(d.v) == "number" and d.v == math.floor(d.v) and d.v >= 1 then d.v else 1
	if v > Profile.VERSION then
		return nil, "newer"
	end
	local c = deepCopy(d)
	while v < Profile.VERSION do
		MIGRATIONS[v](c)
		v += 1
	end
	return Profile.sanitize(c), nil
end

-- ---------- stages ----------
function Profile.stageBest(p, id: string): number
	local v = p.stages and p.stages[id]
	return if type(v) == "number" then v else -1
end
function Profile.stageStars(p, id: string): number
	local b = Profile.stageBest(p, id)
	return if b < 0 then 0 elseif b >= 3 then 3 elseif b >= 1 then 2 else 1
end
-- i = 1-based land index
function Profile.stageUnlocked(p, i: number): boolean
	return i == 1 or Profile.stageBest(p, Stages.list[i - 1].id) >= 0
end
function Profile.stageMaxHeat(p, id: string): number
	return math.min(#Heat.list - 1, Profile.stageBest(p, id) + 1)
end
function Profile.totalStars(p): number
	local n = 0
	for _, s in Stages.list do
		n += Profile.stageStars(p, s.id)
	end
	return n
end

-- ---------- forge ----------
function Profile.forgePrice(p, item): number
	local lvl = p.shop[item.id] or 0
	local bought = 0
	for _, it in Forge.list do
		bought += p.shop[it.id] or 0
	end
	return Util.round(item.cost * (lvl + 1) * (1 + 0.05 * bought) / 5) * 5
end

-- refund value of a shop table (cheapest possible buying order)
function Profile.forgeRefundValue(shop): number
	local back = 0
	local tmp = { shop = {} }
	local items = table.clone(Forge.list)
	-- stable sort by cost descending (JS Array.sort is stable)
	for i = 2, #items do
		local it = items[i]
		local j = i - 1
		while j >= 1 and items[j].cost < it.cost do
			items[j + 1] = items[j]
			j -= 1
		end
		items[j + 1] = it
	end
	for _, it in items do
		local lvl = shop[it.id] or 0
		for _ = 1, lvl do
			back += Profile.forgePrice(tmp, it)
			tmp.shop[it.id] = (tmp.shop[it.id] or 0) + 1
		end
	end
	return back
end

-- buy one forge level; returns ok, reason
function Profile.forgeBuy(p, id: string): (boolean, string?)
	local it = forgeById[id]
	if not it then
		return false, "unknown"
	end
	local lvl = p.shop[id] or 0
	if lvl >= it.max then
		return false, "max"
	end
	local price = Profile.forgePrice(p, it)
	if p.gold < price then
		return false, "gold"
	end
	p.gold -= price
	p.shopSpent += price
	p.shop[id] = lvl + 1
	return true, nil
end

-- refund all forge levels (the amount actually spent)
function Profile.forgeRefund(p): number
	local back = p.shopSpent
	p.gold += back
	p.shopSpent = 0
	p.shop = {}
	return back
end

function Profile.cheapestForgePrice(p): number
	local m = math.huge
	for _, it in Forge.list do
		m = math.min(m, Profile.forgePrice(p, it))
	end
	return m
end

-- heroes the player may pick: earned by achievement (profile.chars) or owned through a pass
-- ownedPasses = { [heroId] = true } (already resolved from game pass ownership by the server)
function Profile.unlockedHeroes(p, ownedPasses: { [string]: boolean }?): { string }
	local out = {}
	for _, id in Heroes.ORDER do
		local earned = table.find(p.chars, id) ~= nil
		if earned or (ownedPasses and ownedPasses[id]) then
			table.insert(out, id)
		end
	end
	return out
end

return Profile
