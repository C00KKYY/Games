--!native
-- Gems, coins, hearts, magnets, bombs, chests (web dropGem, drop, updatePickups, collect, gainXp).
-- Co-op: XP and coin gold are shared by the team (docs/DESIGN.md §2.4); chests have an owner.
local K = if script then require(script.Parent.K) else require("./K")
local Coop = if script then require(script.Parent.Coop) else require("./Coop")
local Curves = if script then require(script.Parent.Curves) else require("./Curves")
local Util = if script then require(script.Parent.Util) else require("./Util")
local Tuning = if script then require(script.Parent.Parent.Config.Tuning) else require("../Config/Tuning")

local Pickups = {}

local sqrt = math.sqrt
local GEM_CAP, PICKUP_CAP = Tuning.GEM_CAP, Tuning.PICKUP_CAP
local VIEW_HW, VIEW_HH = Tuning.VIEW_HW, Tuning.VIEW_HH

function K.dropGem(run, x: number, y: number, v: number)
	local gems = run.gems
	if #gems > GEM_CAP then
		gems[1].v += v
		return
	end
	local g = { id = K.oid(run), x = x, y = y, v = v, mag = nil, sp = 0 }
	gems[#gems + 1] = g
	K.ev(run, { k = "gem+", id = g.id, x = x, y = y, v = v })
end

function K.drop(run, x: number, y: number, kind: string, v: number?, owner: number?)
	local pk = run.pickups
	if #pk >= PICKUP_CAP and kind ~= "chest" then
		return nil
	end
	local it = { id = K.oid(run), x = x, y = y, kind = kind, v = v or 0, mag = nil, sp = 0, owner = owner }
	pk[#pk + 1] = it
	K.ev(run, { k = "pick+", id = it.id, kind = kind, x = x, y = y, owner = owner or 0 })
	return it
end

-- one chest per player in the run, marked with the owner
function K.dropChests(run, x: number, y: number)
	local n = 0
	for _, pl in run.plist do
		if pl.state ~= "left" then
			local ox = if run.solo then 0 else (n - 1.5) * 44
			K.drop(run, x + ox, y, "chest", 0, pl.slot)
			n += 1
		end
	end
end

function K.gainXp(_run, pl, v: number)
	pl.xp += v * pl.stats.growth
	while pl.xp >= pl.xpNext do
		pl.xp -= pl.xpNext
		pl.level += 1
		pl.xpNext = Curves.xpFor(pl.level)
		pl.pendingLevels += 1
	end
end

-- team XP: every player in the run gains v x xpShare(N), scaled by his own growth
function K.teamXp(run, v: number)
	if run.solo then
		K.gainXp(run, run.plist[1], v)
		return
	end
	local share = Coop.f(Coop.xpShare, run.nPlayers)
	for _, pl in run.plist do
		if pl.state ~= "left" then
			K.gainXp(run, pl, v * share)
		end
	end
end

-- team gold from coins/bags
local function teamGold(run, base: number, collector)
	local share = if run.solo then 1 else Coop.f(Coop.goldShare, run.nPlayers)
	for _, pl in run.plist do
		if pl.state ~= "left" then
			local v = Util.round(base * share * pl.stats.greed * run.heatDef.gold)
			pl.gold += v
			K.text(run, pl.x, pl.y - 26, "+{0} Gold", "#ffd23f", 1, pl.slot, { v })
		end
	end
	K.sfx(run, "coin", collector.x, collector.y)
end

function K.collect(run, it, p)
	if it.kind == "coin" or it.kind == "bag" then
		local base = if it.kind == "bag" then (if it.v > 0 then it.v else 15) else (if it.v > 0 then it.v else 1)
		teamGold(run, base, p)
	elseif it.kind == "heart" then
		local h = math.min(30, p.stats.maxHp - p.hp)
		p.hp += h
		K.text(run, p.x, p.y - 26, "+" .. Util.round(h), "#5dff8f", 1.1, p.slot)
		K.ev(run, { k = "burst", x = p.x, y = p.y, color = "#5dff8f", n = 14 })
		K.sfx(run, "heal", p.x, p.y)
	elseif it.kind == "magnet" then
		for _, g in run.gems do
			if not g.mag then
				g.mag = p
				g.sp = -60
				K.ev(run, { k = "gemPull", id = g.id, slot = p.slot })
			end
		end
		for _, c in run.pickups do
			if c.kind == "coin" then
				c.mag = p
				K.ev(run, { k = "pick~", id = c.id, slot = p.slot })
			end
		end
		K.sfx(run, "magnet", p.x, p.y)
	elseif it.kind == "bomb" then
		local list = {}
		for _, e in run.enemies do
			if not e.dead and math.abs(e.x - p.x) <= VIEW_HW + 40 and math.abs(e.y - p.y) <= VIEW_HH + 40 then
				list[#list + 1] = e
			end
		end
		for _, e in list do
			K.damage(run, e, if e.boss then 300 else 99999, "bomb", 300, nil, nil, nil, p.slot)
		end
		K.ev(run, { k = "flash", x = p.x, y = p.y, slot = p.slot })
		K.shake(run, 16, p.x, p.y)
		K.sfx(run, "bomb", p.x, p.y)
	elseif it.kind == "chest" then
		K.sfx(run, "chestpick", p.x, p.y)
		K.gotChest(run, p)
	end
end

function K.updatePickups(run, dt: number)
	local act = run.act
	if #act == 0 then
		return
	end
	local gems = run.gems
	for i = #gems, 1, -1 do
		local g = gems[i]
		local p = g.mag
		if p and p.state ~= "active" then
			p = nil
			g.mag = nil
		end
		if not p then
			-- the first active player (slot order) whose magnet radius covers the gem attracts it
			for _, q in act do
				local dx, dy = q.x - g.x, q.y - g.y
				local m = q.stats.magnet
				if dx * dx + dy * dy < m * m then
					p = q
					g.mag = q
					g.sp = -120
					K.ev(run, { k = "gemPull", id = g.id, slot = q.slot })
					break
				end
			end
		end
		if p then
			local dx, dy = p.x - g.x, p.y - g.y
			local d = sqrt(dx * dx + dy * dy)
			if d == 0 then
				d = 1
			end
			g.sp += 1100 * dt
			local step = g.sp * dt
			if step >= d then
				g.x, g.y = p.x, p.y
			else
				g.x += dx / d * step
				g.y += dy / d * step
			end
			if d < p.r + 8 or step >= d then
				K.teamXp(run, g.v)
				K.ev(run, { k = "gemGot", id = g.id, slot = p.slot })
				K.sfx(run, "gem", p.x, p.y)
				gems[i] = gems[#gems]
				gems[#gems] = nil
			end
		end
	end
	local pk = run.pickups
	for i = #pk, 1, -1 do
		local it = pk[i]
		local p = it.mag
		if p and p.state ~= "active" then
			p = nil
			it.mag = nil
		end
		if it.kind == "coin" and not p then
			for _, q in act do
				local dx, dy = q.x - it.x, q.y - it.y
				local m = q.stats.magnet
				if dx * dx + dy * dy < m * m then
					p = q
					it.mag = q
					it.sp = -100
					K.ev(run, { k = "pick~", id = it.id, slot = q.slot })
					break
				end
			end
		end
		local reached = nil
		if p then
			local dx, dy = p.x - it.x, p.y - it.y
			local d = sqrt(dx * dx + dy * dy)
			if d == 0 then
				d = 1
			end
			it.sp += 1000 * dt
			local step = it.sp * dt
			if step >= d then
				it.x, it.y = p.x, p.y
				reached = p
			else
				it.x += dx / d * step
				it.y += dy / d * step
			end
		end
		if not reached then
			for _, q in act do
				if it.kind ~= "chest" or it.owner == q.slot then
					local reach = q.r + (if it.kind == "chest" then 22 else 14)
					local dx, dy = q.x - it.x, q.y - it.y
					if dx * dx + dy * dy < reach * reach then
						reached = q
						break
					end
				end
			end
		end
		if reached then
			pk[i] = pk[#pk]
			pk[#pk] = nil
			K.ev(run, { k = "pick-", id = it.id, slot = reached.slot })
			K.collect(run, it, reached)
		end
	end
end

return Pickups
