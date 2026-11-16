-- Level-up offers and choices, chests (web buildOptions, optionCount, applyOption, chooseLevel, skipLevel, reroll,
-- banish, openChest). Solo pauses the world like the web game; co-op shows a non-modal tray with an auto-pick
-- (docs/DESIGN.md §2.5).
local K = if script then require(script.Parent.K) else require("./K")
local Weapons = if script then require(script.Parent.Data.Weapons) else require("./Data/Weapons")
local Passives = if script then require(script.Parent.Data.Passives) else require("./Data/Passives")
local Stats = if script then require(script.Parent.Stats) else require("./Stats")
local Util = if script then require(script.Parent.Util) else require("./Util")
local Tuning = if script then require(script.Parent.Parent.Config.Tuning) else require("../Config/Tuning")

local LevelUp = {}

local WDEF, PDEF = Weapons.byId, Passives.byId

local function findWeapon(pl, id)
	for _, w in pl.weapons do
		if w.id == id then
			return w
		end
	end
	return nil
end
local function findPassive(pl, id)
	for _, p in pl.passives do
		if p.id == id then
			return p
		end
	end
	return nil
end

function K.buildOptions(run, pl, count: number)
	local rng = run.rng
	local cands = {}
	for _, w in pl.weapons do
		if w.level < Weapons.WEAPON_MAX and not w.evo then
			table.insert(cands, { kind = "weapon", id = w.id, level = w.level + 1, weight = 10 })
		end
	end
	for _, pa in pl.passives do
		if pa.level < PDEF[pa.id].max then
			table.insert(cands, { kind = "passive", id = pa.id, level = pa.level + 1, weight = 8 })
		end
	end
	if #pl.weapons < Weapons.MAX_WEAPONS then
		for _, id in Weapons.ORDER do
			if not findWeapon(pl, id) and not pl.banished[id] then
				table.insert(cands, { kind = "weapon", id = id, level = 1, isNew = true, weight = 7 })
			end
		end
	end
	if #pl.passives < Passives.MAX_PASSIVES then
		for _, id in Passives.ORDER do
			if not findPassive(pl, id) and not pl.banished[id] then
				table.insert(cands, { kind = "passive", id = id, level = 1, isNew = true, weight = 6 })
			end
		end
	end
	local out = {}
	while #out < count and #cands > 0 do
		local sum = 0
		for _, c in cands do
			sum += c.weight
		end
		local x = rng:next() * sum
		local idx = 1
		while idx <= #cands do
			x -= cands[idx].weight
			if x <= 0 then
				break
			end
			idx += 1
		end
		idx = math.min(idx, #cands)
		table.insert(out, cands[idx])
		table.remove(cands, idx)
	end
	-- early levels: always offer a new weapon (the most visible upgrade)
	if #pl.weapons == 1 and pl.level <= 4 and #out > 0 then
		local has = false
		for _, o in out do
			if o.kind == "weapon" and o.isNew then
				has = true
			end
		end
		if not has then
			local nw = {}
			for _, c in cands do
				if c.kind == "weapon" and c.isNew then
					table.insert(nw, c)
				end
			end
			if #nw > 0 then
				out[#out] = rng:pick(nw)
			end
		end
	end
	if #out == 0 then
		table.insert(out, { kind = "gold", id = "gold", amount = 25 })
		table.insert(out, { kind = "heal", id = "heal", amount = 40 })
	end
	return out
end

function K.optionCount(run, pl): number
	return if run.rng:next() < (pl.stats.luck - 1) * 0.6 + 0.05 then 4 else 3
end

function K.applyOption(run, pl, o)
	if o.kind == "weapon" then
		local w = findWeapon(pl, o.id)
		if w then
			w.level += 1
			Stats.weapon(w, pl.stats)
		else
			K.addWeapon(run, pl, o.id)
		end
	elseif o.kind == "passive" then
		local pa = findPassive(pl, o.id)
		if pa then
			pa.level += 1
		else
			table.insert(pl.passives, { id = o.id, level = 1 })
		end
		K.refreshStats(run, pl)
	elseif o.kind == "gold" then
		pl.gold += o.amount
	elseif o.kind == "heal" then
		pl.hp = math.min(pl.stats.maxHp, pl.hp + o.amount)
	end
	K.ev(run, { k = "build", slot = pl.slot })
end

local function sendOffer(run, pl)
	K.ev(run, {
		k = "levelup",
		slot = pl.slot,
		options = pl.offer,
		rerolls = pl.rerolls,
		skips = pl.skips,
		banishes = pl.banishes,
		deadline = if run.solo then nil else run.t + pl.offerT,
	})
end

-- creates the offer for the player's next pending level (solo: pauses; co-op: tray + ward + auto-pick timer)
function K.openLevelUp(run, pl)
	pl.offer = K.buildOptions(run, pl, K.optionCount(run, pl))
	pl.offerT = Tuning.AUTO_PICK_TIME
	if run.solo then
		run.state = "levelup"
	elseif not pl.trayOpen then
		pl.trayOpen = true
		if pl.state == "active" and run.t - pl.wardLast >= Tuning.WARD_COOLDOWN then
			pl.wardLast = run.t
			pl.wardT = Tuning.WARD_TIME
			K.ev(run, { k = "ward", slot = pl.slot, dur = Tuning.WARD_TIME })
		end
	end
	K.sfx(run, "levelup", pl.x, pl.y)
	sendOffer(run, pl)
end

local function afterChoice(run, pl)
	pl.offer = nil
	if run.solo then
		K.afterModal(run)
	elseif pl.pendingLevels <= 0 then
		pl.trayOpen = false
		K.ev(run, { k = "levelupDone", slot = pl.slot })
	end
end

function K.chooseLevel(run, pl, i: number): boolean
	local o = pl.offer and pl.offer[i]
	if not o then
		return false
	end
	K.applyOption(run, pl, o)
	pl.pendingLevels -= 1
	afterChoice(run, pl)
	return true
end

function K.skipLevel(run, pl): boolean
	if not pl.offer or pl.skips <= 0 then
		return false
	end
	pl.skips -= 1
	pl.pendingLevels -= 1
	K.gainXp(run, pl, 0)
	afterChoice(run, pl)
	return true
end

function K.reroll(run, pl): boolean
	if not pl.offer or pl.rerolls <= 0 then
		return false
	end
	pl.rerolls -= 1
	pl.offer = K.buildOptions(run, pl, K.optionCount(run, pl))
	sendOffer(run, pl)
	return true
end

function K.banish(run, pl, i: number): boolean
	local o = pl.offer and pl.offer[i]
	if not o or pl.banishes <= 0 or not o.isNew then
		return false
	end
	pl.banishes -= 1
	pl.banished[o.id] = true
	local rest = {}
	for _, x in pl.offer do
		if x ~= o then
			table.insert(rest, x)
		end
	end
	local more = K.buildOptions(run, pl, 6)
	for _, x in more do
		local dup = false
		for _, y in rest do
			if y.kind == x.kind and y.id == x.id then
				dup = true
			end
		end
		if not dup and x.kind ~= "gold" and x.kind ~= "heal" then
			table.insert(rest, x)
			break
		end
	end
	if #rest == 0 then
		rest = K.buildOptions(run, pl, 3)
	end
	pl.offer = rest
	sendOffer(run, pl)
	return true
end

-- solo: after a dialog continue with the next level-up or chest, else play
function K.afterModal(run)
	local pl = run.plist[1]
	if pl.pendingLevels > 0 then
		K.openLevelUp(run, pl)
	elseif pl.pendingChests > 0 then
		K.openChest(run, pl)
	elseif run.state ~= "over" and run.state ~= "victory" and run.state ~= "lastchance" then
		K.resumePlay(run)
	end
end

-- co-op: tray handling and auto-pick, every step for every player in the run
function K.updateTrays(run, dt: number)
	for _, pl in run.plist do
		if pl.state ~= "left" then
			if pl.offer then
				pl.offerT -= dt
				if pl.offerT <= 0 then
					K.chooseLevel(run, pl, 1)
				end
			elseif pl.pendingLevels > 0 then
				K.openLevelUp(run, pl)
			end
		end
	end
end

-- ---------- chests ----------
function K.gotChest(run, pl)
	if run.solo then
		pl.pendingChests += 1
	else
		K.openChest(run, pl)
	end
end

local function evolve(_run, pl, w, res)
	w.evo = true
	Stats.weapon(w, pl.stats)
	res.evolved = w.id
	pl.evolvedCount += 1
	pl.bank.evolutions += 1
	pl.bank.evolved[w.id] = true
end

function K.openChest(run, pl)
	local rng = run.rng
	if run.solo then
		pl.pendingChests -= 1
		run.state = "chest"
	end
	pl.chestsOpened += 1
	pl.bank.chests += 1
	local res = { evolved = nil, items = {}, gold = 0 }
	local evo = nil
	for _, w in pl.weapons do
		if K.canEvolve(pl, w) then
			evo = w
			break
		end
	end
	if evo then
		evolve(run, pl, evo, res)
	else
		local luck = pl.stats.luck
		local roll = rng:next()
		local n = if roll < 0.05 * luck then 5 elseif roll < 0.25 * luck then 3 else 1
		for i = 0, n - 1 do
			local cands = {}
			for _, w in pl.weapons do
				if w.level < Weapons.WEAPON_MAX and not w.evo then
					table.insert(cands, { kind = "weapon", id = w.id, level = w.level + 1 })
				end
			end
			for _, pa in pl.passives do
				if pa.level < PDEF[pa.id].max then
					table.insert(cands, { kind = "passive", id = pa.id, level = pa.level + 1 })
				end
			end
			if #cands == 0 then
				break
			end
			local o = rng:pick(cands)
			K.applyOption(run, pl, o)
			table.insert(res.items, o)
			local ev2 = nil
			for _, w in pl.weapons do
				if K.canEvolve(pl, w) then
					ev2 = w
					break
				end
			end
			if ev2 and not res.evolved and i == n - 1 and n > 1 then
				evolve(run, pl, ev2, res)
			end
		end
	end
	res.gold = Util.round(rng:int(15, 40) * pl.stats.greed * run.heatDef.gold)
	pl.gold += res.gold
	K.sfx(run, "chest", pl.x, pl.y)
	K.ev(run, { k = "chest", slot = pl.slot, res = res })
	return res
end

function K.closeChest(run)
	if run.state == "chest" then
		K.afterModal(run)
	end
end

LevelUp.WDEF = WDEF
return LevelUp
