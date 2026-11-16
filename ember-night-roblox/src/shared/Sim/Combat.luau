--!native
-- Damage, kills, explosions, hurting heroes (web inCircle, damage, kill, blast, hurtPlayer, playerDies).
local K = if script then require(script.Parent.K) else require("./K")
local Util = if script then require(script.Parent.Util) else require("./Util")

local Combat = {}

local sqrt = math.sqrt
local DMG_EVENTS_PER_STEP = 40

-- enemies whose circle overlaps (x, y, rad); returns a reusable buffer (rotating over 5, nested calls are safe)
function K.circle(run, x: number, y: number, rad: number): { any }
	run.qd = run.qd % 5 + 1
	local buf = run.qbufs[1 + run.qd]
	run.grid:query(x, y, rad + 70, buf)
	local n = 0
	for i = 1, #buf do
		local e = buf[i]
		if not e.dead then
			local rr = rad + e.r
			local dx, dy = x - e.x, y - e.y
			if dx * dx + dy * dy <= rr * rr then
				n += 1
				buf[n] = e
			end
		end
	end
	for i = #buf, n + 1, -1 do
		buf[i] = nil
	end
	K.hitProps(run, x, y, rad)
	return buf
end

-- enemies within distance r of the segment (x0,y0)-(x1,y1) (swept projectile)
function K.sweep(run, x0: number, y0: number, x1: number, y1: number, rad: number): { any }
	run.qd = run.qd % 5 + 1
	local buf = run.qbufs[1 + run.qd]
	local mx, my = (x0 + x1) * 0.5, (y0 + y1) * 0.5
	local sx, sy = x1 - x0, y1 - y0
	local len2 = sx * sx + sy * sy
	local half = sqrt(len2) * 0.5
	run.grid:query(mx, my, rad + half + 70, buf)
	local n = 0
	for i = 1, #buf do
		local e = buf[i]
		if not e.dead then
			local t = 0
			if len2 > 1e-9 then
				t = math.clamp(((e.x - x0) * sx + (e.y - y0) * sy) / len2, 0, 1)
			end
			local px, py = x0 + sx * t - e.x, y0 + sy * t - e.y
			local rr = rad + e.r
			if px * px + py * py <= rr * rr then
				n += 1
				buf[n] = e
			end
		end
	end
	for i = #buf, n + 1, -1 do
		buf[i] = nil
	end
	K.hitProps(run, x1, y1, rad)
	return buf
end

function K.damage(
	run,
	e,
	amount: number,
	wid: string,
	kbForce: number,
	crit: number?,
	fromX: number?,
	fromY: number?,
	slot: number
)
	if e.dead then
		return 0
	end
	local rng = run.rng
	local pl = run.players[slot]
	local dmg = amount * rng:range(0.9, 1.1)
	local cc = if crit and crit > 0 then crit else 0.05
	local isCrit = rng:next() < cc
	if isCrit then
		dmg *= 2
	end
	if pl then
		pl.dmgBy[wid] = (pl.dmgBy[wid] or 0) + math.min(dmg, math.max(0, e.hp))
	end
	e.hp -= dmg
	e.flash = 0.06
	if kbForce > 0 and e.kb > 0 then
		local fx = fromX or (if pl then pl.x else e.x)
		local fy = fromY or (if pl then pl.y else e.y)
		local dx, dy = e.x - fx, e.y - fy
		local d = sqrt(dx * dx + dy * dy)
		if d == 0 then
			d = 1
		end
		e.kx += dx / d * kbForce * e.kb
		e.ky += dy / d * kbForce * e.kb
	end
	if run.dmgEvN < DMG_EVENTS_PER_STEP or e.boss then
		run.dmgEvN += 1
		K.ev(
			run,
			{ k = "dmg", x = e.x, y = e.y - e.r - 4, amount = dmg, crit = isCrit, boss = e.boss ~= nil, slot = slot }
		)
	end
	K.sfx(run, "hit", e.x, e.y)
	e.lastHit = slot
	if e.hp <= 0 then
		K.kill(run, e, slot)
	end
	return dmg
end

function K.kill(run, e, slot: number)
	local rng = run.rng
	e.dead = true
	if e.windT > 0 or e.teles then
		K.endWind(run, e)
	end
	run.kills += 1
	local killer = run.players[slot]
	if killer then
		killer.kills += 1
		killer.bank.kills += 1
	end
	K.ev(run, { k = "kill", id = e.id, x = e.x, y = e.y, type = e.type, elite = e.elite, boss = e.boss ~= nil })
	if e.swarm and rng:next() < 0.5 then
		return
	end
	if e.boss then
		run.bossKills += 1
		for _, pl in run.plist do
			if pl.state ~= "left" then
				pl.bank.bosses[e.boss.id] = true
				pl.bank.bossKills += 1
			end
		end
		for _ = 1, 26 do
			K.dropGem(run, e.x + rng:range(-60, 60), e.y + rng:range(-60, 60), math.ceil(e.xp / 26))
		end
		for _ = 1, 8 do
			K.drop(run, e.x + rng:range(-50, 50), e.y + rng:range(-50, 50), "coin", 3)
		end
		K.dropChests(run, e.x, e.y)
		K.shake(run, 14)
		K.sfx(run, "bossdown")
		K.banner(run, "{0} besiegt!", "win", nil, nil, nil, { e.boss.name })
		if e.boss.final and not run.won and run.state ~= "over" then
			run.won = true
			K.enterVictory(run)
		end
		return
	end
	K.sfx(run, "kill", e.x, e.y)
	K.dropGem(run, e.x, e.y, e.xp)
	if e.elite then
		K.dropChests(run, e.x, e.y)
		for _ = 1, 4 do
			K.drop(run, e.x + rng:range(-30, 30), e.y + rng:range(-30, 30), "coin", 2)
		end
		return
	end
	local luck = if killer then killer.stats.luck else 1
	local roll = rng:next()
	if roll < 0.022 * luck then
		K.drop(run, e.x, e.y, "coin", 1)
	elseif roll < 0.022 * luck + 0.0025 * luck then
		K.drop(run, e.x, e.y, "heart")
	elseif roll < 0.022 * luck + 0.0035 * luck then
		K.drop(run, e.x, e.y, "magnet")
	elseif roll < 0.022 * luck + 0.0042 * luck then
		K.drop(run, e.x, e.y, "bomb")
	end
end

-- explosion (bomb pickup, revival)
function K.blast(run, x: number, y: number, rad: number, dmg: number, wid: string, slot: number)
	local list = table.clone(K.circle(run, x, y, rad))
	for _, e in list do
		K.damage(run, e, if e.boss then math.min(dmg, 400) else dmg, wid, 400, 0, x, y, slot)
	end
	K.ev(run, { k = "boom", x = x, y = y, rad = rad, color = "#fff3c4" })
end

-- src: what hit (contact, shot, needle, mortar, puddle, ring, bossShot, area, lane ...), remembered for stats
function K.hurtPlayer(run, pl, dmg: number, src: string)
	if pl.iframe > 0 or pl.wardT > 0 or pl.state ~= "active" or run.state ~= "play" then
		return
	end
	pl.lastHitSrc = src
	local taken = math.max(1, dmg - pl.stats.armor)
	pl.hp -= taken
	pl.iframe = 0.5
	pl.flash = 0.25
	if pl.firstHit == nil then
		pl.firstHit = run.t
	end
	pl.surgeHits += 1
	K.ev(run, { k = "hurt", slot = pl.slot, amount = taken, src = src })
	K.ev(run, { k = "shake", amount = math.min(9, 3 + taken * 0.3), slot = pl.slot })
	if pl.hp <= 0 then
		K.playerDies(run, pl)
	end
end

function K.playerDies(run, pl)
	if pl.revivals > 0 then
		pl.revivals -= 1
		K.reviveBlast(run, pl, "revive")
		K.banner(run, "Wiedergeboren!", "event", nil, nil, pl.slot)
		return
	end
	pl.hp = 0
	K.ev(run, { k = "burst", x = pl.x, y = pl.y, color = "#ff5a6e", n = 60 })
	K.sfx(run, "death", pl.x, pl.y)
	K.downPlayer(run, pl)
end

-- revival effect shared by forge revival and the Robux revive: 50 % HP, 3 s i-frames, blast 320 px
function K.reviveBlast(run, pl, wid: string)
	pl.hp = pl.stats.maxHp * 0.5
	pl.iframe = 3
	K.blast(run, pl.x, pl.y, 320, 99999, wid, pl.slot)
	K.ev(run, { k = "burst", x = pl.x, y = pl.y, color = "#ffe27a", n = 80 })
	K.sfx(run, "revive", pl.x, pl.y)
end

Combat.round = Util.round
return Combat
