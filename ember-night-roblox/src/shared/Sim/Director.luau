--!native
-- Spawning: waves, elites, bosses, events, endless mode (web director, spawnPos, spawnEnemy, spawnBoss, runEvent).
-- Co-op: spawns around an anchor player chosen round-robin among the active players (docs/DESIGN.md §2.6, §2.7).
local K = if script then require(script.Parent.K) else require("./K")
local Enemies = if script then require(script.Parent.Data.Enemies) else require("./Data/Enemies")
local Heat = if script then require(script.Parent.Data.Heat) else require("./Data/Heat")
local Curves = if script then require(script.Parent.Curves) else require("./Curves")
local Coop = if script then require(script.Parent.Coop) else require("./Coop")
local Util = if script then require(script.Parent.Util) else require("./Util")
local Tuning = if script then require(script.Parent.Parent.Config.Tuning) else require("../Config/Tuning")

local Director = {}

local TAU, DEG = Util.TAU, Util.DEG
local EDEF = Enemies.byId
local EARLY_SPEED = 0.2
local round = Util.round
local VIEW_HW, VIEW_HH = Tuning.VIEW_HW, Tuning.VIEW_HH

function K.wave(run)
	local m = math.floor(run.t / 60)
	local w = run.stage.waves
	return w[math.min(m + 1, #w)]
end

function K.hpMul(run, t: number): number
	local st = run.stage
	local m = t / 60
	local c = if st.hpBridge and run.heat < 3 then Curves.hpCurveBridged(m) else Curves.hpCurve(m)
	return run.heatDef.hp * st.mult.hp * c
end

-- ranged enemies appear from rangedFrom and at most rangedCap at once
function K.pickType(run, wv): string
	local ent = wv.pool
	if run.t < (run.stage.rangedFrom or 0) then
		local f = {}
		for _, e in ent do
			if not EDEF[e.k].ranged then
				f[#f + 1] = e
			end
		end
		ent = f
	end
	local k = run.rng:weighted(ent)
	if EDEF[k].ranged and run.rangedAlive >= K.rangedCap(run) then
		local melee = {}
		for _, e in ent do
			if not EDEF[e.k].ranged then
				melee[#melee + 1] = e
			end
		end
		if #melee > 0 then
			k = run.rng:weighted(melee)
		end
	end
	return k
end

function K.rangedCap(run): number
	return round(
		math.min(3 + math.floor(run.t / 60), 14) * run.heatDef.rate * Coop.f(Coop.rangedCap, run.nPlayers)
	)
end

function K.cdMul(run): number
	return math.max(0.75, 1 - 0.025 * math.floor(run.t / 60)) * (1 - 0.04 * run.heat) * (run.stage.rangedCd or 1)
end

function K.eSpeed(run, base: number, cap: number): number
	return math.min(cap, base * run.heatDef.speed)
end

-- volley director: how many enemies may wind up at the same time and how close after each other
function K.canWind(run, e): boolean
	local v = run.vol
	local m = math.floor(run.t / 60)
	local max = if m < 2 then 3 elseif m < 6 then 5 else 7
	local gap = if m < 2 then 0.3 elseif m < 6 then 0.2 else 0.14
	if run.heat >= 3 then
		max += 1
	end
	max += Coop.f(Coop.windMax, run.nPlayers)
	if v.active >= max or run.t - v.lastStart < gap then
		return false
	end
	if e.rk == "ring" and v.bells >= 2 then
		return false
	end
	return true
end

-- next anchor player (round robin over active players)
function K.anchor(run)
	local act = run.act
	if #act == 0 then
		return run.plist[1]
	end
	run.anchorI = run.anchorI % #act + 1
	return act[run.anchorI]
end

-- random point on the edge of the anchor's view + 50 px, preferring his walking direction; retries when the point
-- is inside another active player's view
function K.spawnPos(run, p): (number, number)
	local rng = run.rng
	local hw, hh = VIEW_HW + 50, VIEW_HH + 50
	local x, y = 0, 0
	for try = 1, 5 do
		local side
		if p.moving and rng:next() < 0.45 then
			if math.abs(p.dirX) > math.abs(p.dirY) then
				side = if p.dirX > 0 then 1 else 3
			else
				side = if p.dirY > 0 then 2 else 0
			end
		else
			side = rng:int(0, 3)
		end
		if side == 0 then
			x, y = rng:range(-hw, hw), -hh
		elseif side == 1 then
			x, y = hw, rng:range(-hh, hh)
		elseif side == 2 then
			x, y = rng:range(-hw, hw), hh
		else
			x, y = -hw, rng:range(-hh, hh)
		end
		x += p.x
		y += p.y
		if #run.act <= 1 or try == 5 or not K.inAnyView(run, x, y, p) then
			break
		end
	end
	return x, y
end

function K.spawnEnemy(run, etype: string, x: number, y: number)
	local d = EDEF[etype]
	local heat = run.heatDef
	local rng = run.rng
	local mods = run.stage.mods or {}
	local ma, mt = mods.all or {}, mods[etype] or {}
	local hp = d.hp * K.hpMul(run, run.t) * (ma.hp or 1) * (mt.hp or 1) * Coop.f(Coop.enemyHp, run.nPlayers)
	local early = if d.speed < 90 then 1 + EARLY_SPEED * math.max(0, 1 - run.t / 180) else 1
	local id = run.nextId
	run.nextId = if id >= 65535 then 1 else id + 1
	local e = {
		id = id,
		type = etype,
		x = x,
		y = y,
		r = d.r,
		hp = hp,
		maxHp = hp,
		speed = d.speed * heat.speed * (ma.speed or 1) * (mt.speed or 1) * rng:range(0.92, 1.08) * early,
		dmg = d.dmg * heat.dmg * run.stage.mult.dmg * (1 + run.t / 60 * 0.07),
		tint = run.stage.tints and run.stage.tints[etype] or nil,
		xp = d.xp * (ma.xp or 1) * (mt.xp or 1),
		kb = d.kb,
		kx = 0,
		ky = 0,
		flash = 0,
		slowT = 0,
		slowF = 1,
		freezeT = 0,
		elite = false,
		boss = nil,
		swarm = false,
		dead = false,
		hitOrbit = {},
		anim = rng:next() * 10,
		shootT = rng:range(1.5, 3),
		ranged = d.ranged ~= nil,
		rk = d.ranged,
		windT = 0,
		windMax = 0,
		windStart = -1,
		side = if rng:next() < 0.5 then -1 else 1,
		flitT = rng:range(0, 1.2),
		flitD = 0,
		fadeT = 0,
		teles = nil,
		pend = nil,
		life = 0,
		sdx = 0,
		sdy = 0,
		skillT = 0,
		skillIdx = 0,
		mode = "chase",
		modeT = 0,
		cast = nil,
		dashA = 0,
		tgt = nil,
		lastHit = 0,
		face = 1,
	}
	local en = run.enemies
	en[#en + 1] = e
	run.nonBoss += 1
	return e
end

function K.spawnBoss(run, def, mult: number)
	local anchor = K.anchor(run)
	local x, y = K.spawnPos(run, anchor)
	local sprite = if EDEF[def.sprite] then def.sprite else "golem"
	local e = K.spawnEnemy(run, sprite, x, y)
	run.nonBoss -= 1
	local heat = run.heatDef
	e.boss = def
	e.type = def.sprite
	e.tint = def.tint
	e.hp = def.hp * (1 + (heat.hp - 1) * 0.6) * mult * Coop.f(Coop.bossHp, run.nPlayers)
	e.maxHp = e.hp
	e.r = def.r
	e.speed = def.speed * heat.speed
	e.dmg = def.dmg * heat.dmg * run.stage.mult.dmg * (if mult > 1 then 1 + mult * 0.15 else 1)
	e.xp = def.xp
	e.kb = 0.05
	e.skillT = 3
	e.skillIdx = 0
	e.mode = "chase"
	e.modeT = 0
	e.tgt = anchor
	table.insert(run.bosses, e)
	K.banner(run, "{0} erscheint!", "boss", nil, nil, nil, { def.name })
	K.ev(run, { k = "boss", id = e.id, name = def.name, final = def.final == true })
	K.sfx(run, "boss")
	K.shake(run, 10)
	return e
end

-- enemy types of an event: type x n or mix (evenly interleaved: always the type with the largest remaining share)
function K.evTypes(run, ev): { string }
	local f = Coop.f(Coop.eventCount, run.nPlayers)
	if not ev.mix then
		local n = if ev.kind == "arc" then ev.n else round(ev.n * f)
		local out = table.create(n, ev.type)
		return out
	end
	local left, want = {}, {}
	local total = 0
	for _, e in ev.mix do
		local c = round(e.w * f)
		left[e.k] = c
		want[e.k] = c
		total += c
	end
	local out = {}
	for _ = 1, total do
		local best, bs = nil, -1
		for _, e in ev.mix do
			local k = e.k
			if left[k] > 0 then
				local sc = left[k] / want[k]
				if sc > bs then
					bs = sc
					best = k
				end
			end
		end
		out[#out + 1] = best
		left[best] -= 1
	end
	return out
end

local function capOk(run): boolean
	return run.nonBoss < Tuning.ENEMY_CAP_TOTAL
end

function K.runEvent(run, ev)
	local p = K.randomActive(run)
	if not p then
		return
	end
	local rng = run.rng
	K.banner(run, ev.text, "event")
	if not ev.quiet then
		K.sfx(run, "alarm")
	end
	local vr = K.viewRadius()
	local sg = ev.surge or (if ev.xp and run.heat < 3 then { xp = ev.xp, speed = 1 } else nil)
	if ev.kind == "swarm" then
		local a = rng:range(0, TAU)
		local ca, sa = math.cos(a), math.sin(a)
		local cx, cy = p.x - ca * (vr + 60), p.y - sa * (vr + 60)
		local n = round(ev.n * Coop.f(Coop.eventCount, run.nPlayers))
		for _ = 1, n do
			local off, back = rng:range(-260, 260), rng:range(0, 200)
			if not capOk(run) then
				break
			end
			local e = K.spawnEnemy(run, ev.type, cx - sa * off - ca * back, cy + ca * off - sa * back)
			if sg then
				e.xp *= sg.xp
				e.speed *= sg.speed
			end
			e.swarm = true
			e.sdx = ca
			e.sdy = sa
			e.speed *= 1.35
			e.life = (vr * 2 + 500) / e.speed
		end
	elseif ev.kind == "arc" then
		local types = K.evTypes(run, ev)
		local n = #types
		local mv = if p.moving then math.atan2(p.dirY, p.dirX) else rng:range(0, TAU)
		for i = 1, n do
			if not capOk(run) then
				break
			end
			local a = mv + (if n > 1 then (i - 1) / (n - 1) - 0.5 else 0) * 120 * DEG
			local R = 0.8 * K.edgeDist(a)
			local e = K.spawnEnemy(run, types[i], p.x + math.cos(a) * R, p.y + math.sin(a) * R)
			if sg then
				e.xp *= sg.xp
				e.speed *= sg.speed
			end
			e.shootT = rng:range(1.6, 2.4)
			e.fadeT = 0.4
			e.tgt = p
			K.ev(run, { k = "burst", x = e.x, y = e.y, color = "#ff3d5a", n = 6 })
		end
	else
		local types = K.evTypes(run, ev)
		local n = #types
		for i = 1, n do
			if not capOk(run) then
				break
			end
			local a = (i - 1) / n * TAU
			local R = if ev.mix then 0.95 * K.edgeDist(a) else vr * 0.85
			local e = K.spawnEnemy(run, types[i], p.x + math.cos(a) * R, p.y + math.sin(a) * R)
			if sg then
				e.xp *= sg.xp
				e.speed *= sg.speed
			end
			e.tgt = p
			if e.ranged then
				e.shootT = rng:range(1.6, 2.6)
			end
		end
	end
end

-- a small group in view right at the start (melee only), around the first player
function K.openingGroup(run)
	local p = run.plist[1]
	local wv = K.wave(run)
	local rng = run.rng
	local n = 6
	local melee = {}
	for _, e in wv.pool do
		if not EDEF[e.k].ranged then
			melee[#melee + 1] = e
		end
	end
	local a0 = rng:range(0, TAU)
	for i = 0, n - 1 do
		local a, k = a0 + i / n * TAU, rng:range(0.62, 0.82)
		local j = 0
		while j < 12 and Util.hypot(math.cos(a) * VIEW_HW, math.sin(a) * VIEW_HH) * k < 230 do
			a = rng:range(0, TAU)
			j += 1
		end
		K.spawnEnemy(run, rng:weighted(melee), p.x + math.cos(a) * VIEW_HW * k, p.y + math.sin(a) * VIEW_HH * k)
	end
end

function K.director(run, dt: number)
	local rng = run.rng
	K.countdownTick(run)
	local heat = run.heatDef
	local wv = K.wave(run)
	local N = run.nPlayers
	local extra = if run.t > run.length then 1 + (run.t - run.length) / 120 else 1
	local rate = wv.rate * heat.rate * run.stage.mult.rate * extra * Coop.f(Coop.spawnRate, N)
	local cap = round(wv.cap * math.min(1.6, heat.rate) * math.min(extra, 1.5))
	cap = round(cap * Coop.f(Coop.spawnCap, N))
	local sc = K.surgeNow(run)
	local surge = sc and sc.s
	local wvUse = wv
	if surge then
		local k = if run.heat >= 3 then 0.7 else 1
		rate *= 1 + (surge.rate - 1) * k
		cap = round(cap * (1 + (surge.cap - 1) * k))
		wvUse = run.surgeWave or wv
	end
	local alive = 0
	for _, e in run.enemies do
		if not e.swarm and not e.boss and not e.dead then
			alive += 1
		end
	end
	if alive < cap * 0.35 then
		rate *= 2.2
	end
	for _, b in run.bosses do
		if b.boss.final and not b.dead then
			rate *= 0.6
			break
		end
	end
	run.spawnAcc += rate * dt
	while run.spawnAcc >= 1 do
		run.spawnAcc -= 1
		if alive >= cap or not capOk(run) then
			run.spawnAcc = 0
			break
		end
		local anchor = K.anchor(run)
		local x, y = K.spawnPos(run, anchor)
		local e = K.spawnEnemy(run, K.pickType(run, wvUse), x, y)
		e.tgt = anchor
		if surge then
			e.xp *= run.surgeK.xp
			e.speed *= run.surgeK.speed
		elseif wv.xp and run.heat < 3 then
			e.xp *= wv.xp
		end
		alive += 1
	end

	-- elite
	run.eliteT -= dt
	if run.eliteT <= 0 and #run.act > 0 then
		run.eliteT = 60
		local first = run.t < 60
		run.eliteN += 1
		local pool
		if first then
			local best, bs = nil, -1
			for _, e in wv.pool do
				local d = EDEF[e.k]
				if not d.ranged and d.speed > bs then
					bs = d.speed
					best = e.k
				end
			end
			pool = { { k = best, w = 1 } }
		else
			local rk = {}
			if run.t >= 180 and run.eliteN % 2 == 0 then
				for _, e in wv.pool do
					if EDEF[e.k].ranged then
						rk[#rk + 1] = { k = e.k, w = e.w }
					end
				end
			end
			if #rk > 0 then
				pool = rk
			else
				pool = {}
				for _, e in wv.pool do
					pool[#pool + 1] = { k = e.k, w = e.w * EDEF[e.k].hp }
				end
			end
		end
		local ref = K.randomActive(run)
		local a = rng:range(-math.pi / 6, math.pi * 7 / 6)
		local x, y
		if first then
			x, y = ref.x + math.cos(a) * VIEW_HW * 0.6, ref.y + math.sin(a) * VIEW_HH * 0.6
		else
			ref = K.anchor(run)
			x, y = K.spawnPos(run, ref)
		end
		local e = K.spawnEnemy(run, rng:weighted(pool), x, y)
		e.tgt = ref
		e.elite = true
		local raw = e.maxHp / Coop.f(Coop.enemyHp, N)
		e.hp = (if first then math.max(90, raw * 3) else math.max(160, raw * 14)) * Coop.f(Coop.eliteHp, N)
		e.maxHp = e.hp
		e.r *= 1.55
		e.xp *= 8
		e.kb *= 0.3
		e.dmg *= 1.4
		e.speed = if first then math.max(e.speed, ref.stats.speed * 0.9) else e.speed * 0.95
		local cd = run.cdList[run.cdIdx]
		if cd and cd.kind == "surge" and math.abs(run.t - cd.start) < 2 then
			run.eliteBanT = cd.start + 3.2
		else
			K.banner(run, "Ein Elitegegner taucht auf – er trägt eine Truhe!", "elite")
		end
	end
	if run.eliteBanT > 0 and run.t >= run.eliteBanT then
		run.eliteBanT = 0
		K.banner(run, "Ein Elitegegner taucht auf – er trägt eine Truhe!", "elite")
	end

	-- bosses
	local bl = run.bossList
	if run.bossIdx <= #bl and run.t >= bl[run.bossIdx].t then
		K.spawnBoss(run, bl[run.bossIdx], 1)
		run.bossIdx += 1
	end
	if run.endless then
		run.endlessBossT -= dt
		if run.endlessBossT <= 0 then
			run.endlessBossT = 120
			local k = 1 + (run.t - run.length) / 120
			local pool = {}
			for _, b in bl do
				if not b.final then
					pool[#pool + 1] = b
				end
			end
			local src = rng:pick(if #pool > 0 then pool else bl)
			local def = table.clone(src)
			def.final = false
			K.spawnBoss(run, def, 1.5 + k)
		end
	end

	-- events
	local ev = run.stage.events
	while run.eventIdx <= #ev and run.t >= ev[run.eventIdx].t do
		K.runEvent(run, ev[run.eventIdx])
		run.eventIdx += 1
	end
end

Director.Heat = Heat
return Director
