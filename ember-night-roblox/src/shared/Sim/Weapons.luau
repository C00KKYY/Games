--!native
-- The nine weapon behaviours (web weapons.js WEAPON_FN), per player. Visuals are replicated as `fire` events.
local K = if script then require(script.Parent.K) else require("./K")
local Util = if script then require(script.Parent.Util) else require("./Util")
local Tuning = if script then require(script.Parent.Parent.Config.Tuning) else require("../Config/Tuning")

local Weapons = {}

local TAU = Util.TAU
local cos, sin, atan2, ceil, pi = math.cos, math.sin, math.atan2, math.ceil, math.pi
local VIEW_HW, VIEW_HH = Tuning.VIEW_HW, Tuning.VIEW_HH
local SHOT_CAP = Tuning.PLAYER_SHOT_CAP

function K.nearestEnemy(run, x: number, y: number, maxD: number, skip: { [any]: boolean }?)
	local best, bd = nil, maxD * maxD
	for _, e in run.enemies do
		if not e.dead and not (skip and skip[e]) then
			local dx, dy = x - e.x, y - e.y
			local d = dx * dx + dy * dy
			if d < bd then
				bd = d
				best = e
			end
		end
	end
	return best
end

local function onScreenEnemies(run, p)
	local out = {}
	for _, e in run.enemies do
		if not e.dead and math.abs(e.x - p.x) < VIEW_HW and math.abs(e.y - p.y) < VIEW_HH then
			out[#out + 1] = e
		end
	end
	return out
end

-- cooldown + burst: fire(i) is called amount times, gap seconds apart (i is 0-based like the web game)
local function tickBurst(w, dt: number, gap: number, fire: (number) -> ())
	w.cdT -= dt
	if w.burst <= 0 and w.cdT <= 0 then
		w.cdT = w.st.cd
		w.burst = w.st.amount
		w.burstI = 0
		w.burstT = 0
	end
	if w.burst > 0 then
		w.burstT -= dt
		while w.burst > 0 and w.burstT <= 0 do
			local i = w.burstI
			w.burstI += 1
			fire(i)
			w.burst -= 1
			w.burstT += gap
		end
	end
end

local function addShot(run, s)
	if #run.shots >= SHOT_CAP then
		return false
	end
	s.id = K.oid(run)
	table.insert(run.shots, s)
	return true
end

local function fireEv(run, p, w, x, y, a, speed, area, extra)
	K.ev(run, {
		k = "fire",
		slot = p.slot,
		weapon = w.id,
		evo = w.evo,
		x = x,
		y = y,
		a = a,
		speed = speed,
		area = area,
		extra = extra,
	})
end

local FN = {}

FN.wand = function(run, p, w, dt)
	tickBurst(w, dt, if w.evo then 0.04 else 0.08, function()
		local st = w.st
		local t = K.nearestEnemy(run, p.x, p.y, K.viewRadius())
		local a = if t then atan2(t.y - p.y, t.x - p.x) else atan2(p.dirY, p.dirX)
		a += run.rng:range(-0.08, 0.08)
		local s = {
			kind = "bolt",
			x = p.x,
			y = p.y,
			vx = cos(a) * st.speed,
			vy = sin(a) * st.speed,
			r = 7 * st.area,
			dmg = st.dmg,
			pierce = st.pierce,
			life = st.dur,
			t = 0,
			hit = {},
			wid = "wand",
			crit = st.crit,
			evo = w.evo,
			slot = p.slot,
		}
		if addShot(run, s) then
			fireEv(run, p, w, p.x, p.y, a, st.speed, st.area, s.id)
		end
		K.sfx(run, "shoot", p.x, p.y)
	end)
end

local WHIP_OFF = { 0, pi, pi / 2, -pi / 2 }
FN.whip = function(run, p, w, dt)
	tickBurst(w, dt, 0.12, function(i)
		local st = w.st
		local R = 112 * st.area
		if i == 0 then
			local t = K.nearestEnemy(run, p.x, p.y, R * 1.3)
			w.aim = if t then atan2(t.y - p.y, t.x - p.x) else atan2(p.dirY, p.dirX)
		end
		local a = w.aim + WHIP_OFF[i % 4 + 1]
		local cx, cy = p.x + cos(a) * R * 0.5, p.y + sin(a) * R * 0.5
		local heals = 0
		local list = table.clone(K.circle(run, cx, cy, R * 0.6))
		for _, e in list do
			K.damage(run, e, st.dmg, "whip", 110, st.crit, nil, nil, p.slot)
			if w.evo and heals < 5 then
				heals += 1
				p.hp = math.min(p.stats.maxHp, p.hp + 0.5)
			end
		end
		fireEv(run, p, w, p.x, p.y, a, 0, st.area, 0)
		K.sfx(run, "slash", p.x, p.y)
	end)
end

FN.orbit = function(run, p, w, dt)
	local st = w.st
	if w.evo then
		w.active = 1
	elseif w.active > 0 then
		w.active -= dt
		if w.active <= 0 then
			w.cdT = st.cd
		end
	else
		w.cdT -= dt
		if w.cdT <= 0 then
			w.active = st.dur
			K.sfx(run, "orbit", p.x, p.y)
		end
	end
	local on = w.active > 0
	-- replicate orbit state changes (the client animates the orbs itself)
	local sig = if on then st.amount * 1000 + math.floor(st.area * 100) + st.speed else -1
	if sig ~= w.orbitSent then
		w.orbitSent = sig
		K.ev(run, {
			k = "orbit",
			slot = p.slot,
			active = on,
			amount = st.amount,
			radius = 92 * st.area,
			speed = 3.3 * st.speed,
			orb = 14 * st.area,
			ang = w.ang,
			evo = w.evo,
		})
	end
	if not on then
		return
	end
	w.ang += dt * 3.3 * st.speed
	local R, orb = 92 * st.area, 14 * st.area
	local orbs = w.orbs
	table.clear(orbs)
	for i = 0, st.amount - 1 do
		local a = w.ang + i / st.amount * TAU
		local ox, oy = p.x + cos(a) * R, p.y + sin(a) * R
		orbs[#orbs + 1] = ox
		orbs[#orbs + 1] = oy
		local list = table.clone(K.circle(run, ox, oy, orb))
		for _, e in list do
			local nt = e.hitOrbit[p.slot]
			if nt == nil or nt <= run.t then
				e.hitOrbit[p.slot] = run.t + 0.4
				K.damage(run, e, st.dmg, "orbit", 160, st.crit, p.x, p.y, p.slot)
			end
		end
	end
end

FN.aura = function(run, p, w, dt)
	local st = w.st
	w.rad = 82 * st.area
	if w.radSent ~= w.rad then
		w.radSent = w.rad
		K.ev(run, { k = "aura", slot = p.slot, rad = w.rad, evo = w.evo })
	end
	w.cdT -= dt
	if w.cdT > 0 then
		return
	end
	w.cdT = st.cd / st.amount
	local any = false
	local list = table.clone(K.circle(run, p.x, p.y, w.rad))
	for _, e in list do
		any = true
		if w.evo then
			e.slowT = math.max(e.slowT, 0.6)
			e.slowF = math.min(e.slowF, 0.6)
		end
		K.damage(run, e, st.dmg, "aura", 40, st.crit, nil, nil, p.slot)
	end
	if w.evo and any then
		p.hp = math.min(p.stats.maxHp, p.hp + 0.6)
	end
end

FN.lightning = function(run, p, w, dt)
	tickBurst(w, dt, 0.06, function()
		local st = w.st
		local list = onScreenEnemies(run, p)
		if #list == 0 then
			return
		end
		local t = run.rng:pick(list)
		local R = 36 * st.area
		local tx, ty = t.x, t.y
		local hits = table.clone(K.circle(run, tx, ty, R))
		for _, e in hits do
			K.damage(run, e, st.dmg, "lightning", 60, st.crit, tx, ty, p.slot)
		end
		fireEv(run, p, w, tx, ty, 0, 0, st.area, 0)
		if w.evo then
			local from = t
			local done = { [t] = true }
			for _ = 1, 4 do
				local n = K.nearestEnemy(run, from.x, from.y, 190, done)
				if not n then
					break
				end
				done[n] = true
				K.ev(run, { k = "arc", slot = p.slot, x = from.x, y = from.y, x2 = n.x, y2 = n.y })
				K.damage(run, n, st.dmg * 0.7, "lightning", 40, st.crit, from.x, from.y, p.slot)
				from = n
			end
		end
		K.sfx(run, "zap", tx, ty)
	end)
end

FN.sickle = function(run, p, w, dt)
	tickBurst(w, dt, 0.12, function(i)
		local st = w.st
		local t = K.nearestEnemy(run, p.x, p.y, 420)
		local a = if t then atan2(t.y - p.y, t.x - p.x) else atan2(p.dirY, p.dirX)
		a += (if i % 2 == 1 then 1 else -1) * ceil(i / 2) * 0.45
		local sp = st.speed * (if w.evo then 1.25 else 1)
		local s = {
			kind = "sickle",
			x = p.x,
			y = p.y,
			vx = cos(a) * sp,
			vy = sin(a) * sp,
			vx0 = cos(a) * sp,
			vy0 = sin(a) * sp,
			speed = sp,
			r = 17 * st.area,
			dmg = st.dmg,
			life = 3.2,
			t = 0,
			hits = {},
			wid = "sickle",
			crit = st.crit,
			spin = 0,
			back = false,
			evo = w.evo,
			slot = p.slot,
		}
		if addShot(run, s) then
			fireEv(run, p, w, p.x, p.y, a, sp, st.area, s.id)
		end
		K.sfx(run, "throw", p.x, p.y)
	end)
end

FN.fire = function(run, p, w, dt)
	tickBurst(w, dt, 0.12, function()
		local st = w.st
		local rng = run.rng
		local tx, ty
		local list = {}
		for _, e in run.enemies do
			if not e.dead and Util.dist2(e.x, e.y, p.x, p.y) < 260 * 260 then
				list[#list + 1] = e
			end
		end
		if #list > 0 and rng:next() < 0.8 then
			local e = rng:pick(list)
			tx, ty = e.x, e.y
		else
			local a, d = rng:range(0, TAU), rng:range(60, 200)
			tx, ty = p.x + cos(a) * d, p.y + sin(a) * d
		end
		local s = {
			kind = "flask",
			sx = p.x,
			sy = p.y,
			tx = tx,
			ty = ty,
			x = p.x,
			y = p.y,
			t = 0,
			T = 0.45,
			rad = 46 * st.area,
			life = st.dur,
			dmg = st.dmg,
			wid = "fire",
			evo = w.evo,
			slot = p.slot,
		}
		if addShot(run, s) then
			K.ev(run, {
				k = "fire",
				slot = p.slot,
				weapon = "fire",
				evo = w.evo,
				x = p.x,
				y = p.y,
				a = atan2(ty - p.y, tx - p.x),
				speed = Util.hypot(tx - p.x, ty - p.y) / 0.45,
				area = st.area,
				extra = s.id,
			})
		end
		K.sfx(run, "throw", p.x, p.y)
	end)
end

FN.nova = function(run, p, w, dt)
	tickBurst(w, dt, 0.35, function()
		local st = w.st
		table.insert(run.fx, {
			kind = "nova",
			x = p.x,
			y = p.y,
			rad = 0,
			maxRad = 150 * st.area,
			t = 0,
			life = 0.55,
			hit = {},
			dmg = st.dmg,
			slowDur = st.dur,
			freeze = w.evo,
			wid = "nova",
			slot = p.slot,
		})
		fireEv(run, p, w, p.x, p.y, 0, 0, st.area, 0)
		K.sfx(run, "nova", p.x, p.y)
	end)
end

FN.knives = function(run, p, w, dt)
	tickBurst(w, dt, if w.evo then 0.03 else 0.06, function(i)
		local st = w.st
		if i == 0 then
			local t = K.nearestEnemy(run, p.x, p.y, 380)
			w.aim = if t then atan2(t.y - p.y, t.x - p.x) else atan2(p.dirY, p.dirX)
		end
		local a = w.aim + run.rng:range(-0.07, 0.07)
		local side = ((i % 3) - 1) * 9
		local x, y = p.x - sin(a) * side, p.y + cos(a) * side
		local s = {
			kind = "knife",
			x = x,
			y = y,
			vx = cos(a) * st.speed,
			vy = sin(a) * st.speed,
			r = 6 * st.area,
			dmg = st.dmg,
			pierce = st.pierce,
			life = 0.9,
			t = 0,
			hit = {},
			wid = "knives",
			crit = st.crit,
			evo = w.evo,
			slot = p.slot,
		}
		if addShot(run, s) then
			fireEv(run, p, w, x, y, a, st.speed, st.area, s.id)
		end
		K.sfx(run, "knife", x, y)
	end)
end

Weapons.FN = FN

function K.updateWeapons(run, p, dt: number)
	for _, w in p.weapons do
		FN[w.id](run, p, w, dt)
	end
end

return Weapons
