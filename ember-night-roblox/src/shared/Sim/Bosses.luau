-- Boss AI and the five ranged attack primitives (web bossAI, castParams, castShots, canCast, startCast, rainPlan,
-- rainPlace, castStep, castRelease). Co-op: every skill picks a target (nearest active player with p = 0.6, else a
-- random active player); all telegraphs of that skill refer to him (docs/DESIGN.md §2.7).
local K = if script then require(script.Parent.K) else require("./K")
local Enemies = if script then require(script.Parent.Data.Enemies) else require("./Data/Enemies")
local Util = if script then require(script.Parent.Util) else require("./Util")
local Coop = if script then require(script.Parent.Coop) else require("./Coop")

local Bosses = {}

local TAU, DEG = Util.TAU, Util.DEG
local cos, sin, atan2 = math.cos, math.sin, math.atan2
local WIND = { nova = 0.6, fan = 0.6, lances = 0.85, spiral = 0.6, rain = 0, lanes = 0 }

local function skillTarget(run, e)
	local act = run.act
	if #act <= 1 then
		return act[1]
	end
	if run.rng:next() < 0.6 then
		return (K.nearestActive(run, e.x, e.y))
	end
	return run.rng:pick(act)
end

function K.castParams(e, sk: string)
	if sk == "nova" then
		return { prim = "nova", n = if e.boss.final then 22 else 16 }
	end
	local c = e.boss.cast and e.boss.cast[sk]
	return c
end

function K.castShots(cp): number
	if cp.prim == "nova" or cp.prim == "fan" then
		return cp.n
	end
	if cp.prim == "lances" then
		return 3
	end
	if cp.prim == "spiral" then
		return cp.arms * math.ceil(2.4 / 0.14)
	end
	return 0
end

function K.canCast(run, e, p, d: number, cp): boolean
	if not K.inViewRect(p, e.x, e.y, 30, e.r * 0.6) or d <= 140 then
		return false
	end
	local nt = if cp.prim == "rain" then (cp.k or 1) elseif cp.prim == "lanes" or cp.prim == "lances" then 3 else 1
	return #run.eshots + K.castShots(cp) <= K.eshotCapBoss(run) and #run.tele + nt <= K.teleCap(run)
end

function K.startCast(run, e, p, sk: string, cp)
	local rng = run.rng
	local prim = cp.prim
	local wind = WIND[prim]
	local c = {
		k = sk,
		prim = prim,
		p = cp,
		t = 0,
		wind = wind,
		dur = 0,
		q = nil,
		fired = 0,
		tgt = p,
		off = 0,
		spd = 0,
		next = 0,
	}
	e.cast = c
	e.mode = "cast"
	e.windT = wind
	e.windMax = wind
	e.windStart = run.t
	e.teles = {}
	local function base(tl)
		tl.follow = e
		tl.own = e
		tl.ws = run.t
		tl.x = e.x
		tl.y = e.y
		tl.t = 0
		tl.life = wind
		tl.target = p
		return tl
	end
	if wind > 0 then
		K.sfx(run, "ewind", e.x, e.y)
	end
	if prim == "nova" then
		local off = rng:range(0, TAU)
		local spd = K.eSpeed(run, 165, 210)
		local shots = {}
		for i = 0, cp.n - 1 do
			shots[#shots + 1] = { a = off + i / cp.n * TAU, spd = spd, r = 9, dmg = e.dmg * 0.6, life = 3.5 }
		end
		table.insert(e.teles, base({ kind = "charge", ring = true, boss = true, sr = e.r + 10, shots = shots }))
	elseif prim == "fan" then
		local spd = math.min(math.max(210, cp.spd), cp.spd * run.heatDef.speed)
		local shots = {}
		for i = 0, cp.n - 1 do
			local o = (if cp.n > 1 then i / (cp.n - 1) - 0.5 else 0) * cp.spread * DEG
			shots[#shots + 1] = { a = 0, o = o, spd = spd, r = 8, dmg = e.dmg * 0.6, life = 3.5 }
		end
		local tl = base({
			kind = "charge",
			wedge = 140,
			boss = true,
			a = K.leadAim(p, e.x, e.y, 0, spd),
			lockAt = wind - 0.15,
			lead = 0,
			spd = spd,
			sr = e.r * 0.7,
			shots = shots,
		})
		K.aimShots(tl)
		table.insert(e.teles, tl)
	elseif prim == "lances" then
		local spd = K.eSpeed(run, 520, 560)
		for _, o in { -22 * DEG, 0, 22 * DEG } do
			table.insert(
				e.teles,
				base({
					kind = "aim",
					len = 900,
					lockAt = 0.5,
					lead = 0.5,
					spd = spd,
					o = o,
					a = K.leadAim(p, e.x, e.y, 0.5, spd) + o,
					hr = 9,
					dmg = e.dmg * 0.8,
					boss = true,
				})
			)
		end
	elseif prim == "spiral" then
		local off = rng:range(0, TAU)
		local spd = K.eSpeed(run, 135, 210)
		local shots = {}
		for i = 0, cp.arms - 1 do
			shots[#shots + 1] = { a = off + i / cp.arms * TAU, spd = spd, r = 8, dmg = e.dmg * 0.5, life = 3.5 }
		end
		c.off = off
		c.spd = spd
		c.dur = 2.4
		c.next = 0
		table.insert(
			e.teles,
			base({ kind = "charge", ring = true, boss = true, arms = true, sr = e.r + 10, shots = shots })
		)
	elseif prim == "rain" then
		c.q = K.rainPlan(cp)
		local m = 0
		for _, q in c.q do
			m = math.max(m, q.at)
		end
		c.dur = m + 0.05
	elseif prim == "lanes" then
		local L = {}
		if cp.pat == "x" then
			local a0 = rng:range(0, math.pi)
			for _, a in { a0, a0 + math.pi / 2 } do
				table.insert(L, {
					x = p.x - cos(a) * 500,
					y = p.y - sin(a) * 500,
					a = a,
					len = 1000,
					w = 44,
					life = 1.1,
					dmg = e.dmg * 1.0,
				})
			end
		else
			local a0 = atan2(p.y - e.y, p.x - e.x)
			for _, o in { -30, 0, 30 } do
				table.insert(
					L,
					{ x = e.x, y = e.y, a = a0 + o * DEG, len = 800, w = 50, life = 1.0, dmg = e.dmg * 1.1 }
				)
			end
		end
		for _, l in L do
			l.kind = "lane"
			l.t = 0
			K.addTele(run, l)
		end
		K.sfx(run, "ewind", e.x, e.y)
		c.dur = 1.1
	end
	for _, tl in e.teles do
		K.addTele(run, tl)
	end
end

function K.rainPlan(cp)
	local q = {}
	local v = cp.v
	if v == "scatter" then
		for i = 0, cp.k - 1 do
			table.insert(q, { at = i * 0.15, i = i })
		end
	elseif v == "flank" or v == "walk" or v == "track" then
		table.insert(q, { at = 0, i = 0 })
	elseif v == "stars" then
		for i = 0, 8 do
			table.insert(q, { at = i * 0.2, i = i })
		end
	end
	return q
end

function K.rainPlace(run, e, p, cp, i: number)
	local rng = run.rng
	local v = cp.v
	local out = {}
	local function mk(x, y, rad, life, dmg, onImpact, track)
		local cx, cy = K.clampView(p, x, y, 20)
		table.insert(out, {
			kind = "circle",
			x = cx,
			y = cy,
			rad = rad,
			t = 0,
			life = life,
			dmg = dmg,
			src = "area",
			small = rad < 70 and not track,
			onImpact = onImpact,
			track = track,
			target = p,
		})
	end
	if v == "scatter" then
		if i == 0 then
			mk(p.x, p.y, cp.rad, 1.0, e.dmg)
		else
			local a, dd = rng:range(0, TAU), rng:range(90, 240)
			mk(p.x + cos(a) * dd, p.y + sin(a) * dd, cp.rad, 1.0, e.dmg)
		end
	elseif v == "flank" then
		local a = if p.moving then atan2(p.vy, p.vx) + math.pi / 2 else rng:range(0, TAU)
		for _, k in { 0, 1, -1 } do
			mk(p.x + cos(a) * 70 * k, p.y + sin(a) * 70 * k, 48, 1.0, e.dmg * 0.8, "slow")
		end
	elseif v == "walk" then
		local a = atan2(p.y - e.y, p.x - e.x)
		for k = 0, 6 do
			local dd = 120 + k * 70
			mk(e.x + cos(a) * dd, e.y + sin(a) * dd, 36, 0.75 + 0.12 * k, e.dmg * 0.9)
		end
	elseif v == "stars" then
		if i % 2 == 0 then
			mk(p.x + p.vx * 0.8 + rng:range(-20, 20), p.y + p.vy * 0.8 + rng:range(-20, 20), 32, 0.8, e.dmg * 0.7)
		else
			local a, dd = rng:range(0, TAU), rng:range(0, 260)
			mk(p.x + cos(a) * dd, p.y + sin(a) * dd, 32, 0.8, e.dmg * 0.7)
		end
	elseif v == "track" then
		mk(p.x, p.y, 80, 1.6, e.dmg * 1.4, nil, { spd = p.stats.speed * 0.85, ["until"] = 0.9 })
	end
	return out
end

function K.castRelease(run, e)
	local c = e.cast
	local teles = e.teles or {}
	if c.prim == "nova" or c.prim == "fan" then
		local tl = teles[1]
		if tl then
			for _, sh in tl.shots do
				K.enemyShot(
					run,
					e.x + cos(sh.a) * tl.sr,
					e.y + sin(sh.a) * tl.sr,
					cos(sh.a),
					sin(sh.a),
					sh.spd,
					sh.dmg,
					sh.r,
					nil,
					nil,
					"bossShot"
				)
			end
		end
		K.sfx(run, if c.prim == "nova" then "summon" else "efire", e.x, e.y)
	elseif c.prim == "lances" then
		for _, tl in teles do
			K.enemyShot(
				run,
				e.x + cos(tl.a) * e.r * 0.8,
				e.y + sin(tl.a) * e.r * 0.8,
				cos(tl.a),
				sin(tl.a),
				tl.spd,
				tl.dmg,
				tl.hr,
				1.6,
				"lance",
				"bossShot"
			)
		end
		K.sfx(run, "efire", e.x, e.y)
	end
	K.endWind(run, e)
	e.windT = 0
end

local function castStep(run, e, dx, dy, d, dt): (number, number)
	local c = e.cast
	local cp = c.p
	local ox, oy = 0, 0
	if c.prim ~= "spiral" then
		local sp = e.speed * 0.3 * (if e.slowF < 1 then 0.8 else 1)
		ox, oy = dx / d * sp, dy / d * sp
	end
	local k = if c.t < c.wind then (e.slowF or 1) else 1
	c.t += dt * k
	if c.wind > 0 and e.windT > 0 then
		e.windT = math.max(0, c.wind - c.t)
		if e.windT <= 0 then
			K.castRelease(run, e)
		end
	end
	local tt = c.t - c.wind
	local p = c.tgt
	if p.state ~= "active" then
		p = e.tgt
	end
	if c.prim == "rain" then
		for _, q in c.q do
			if not q.done and tt >= q.at then
				q.done = true
				if p then
					for _, m in K.rainPlace(run, e, p, cp, q.i) do
						if #run.tele < K.teleCap(run) then
							K.addTele(run, m)
						end
					end
				end
				K.sfx(run, "ewind", e.x, e.y)
			end
		end
	elseif c.prim == "spiral" and tt >= 0 then
		while c.next <= tt and c.next < c.dur do
			local rot = c.off + 120 * DEG * c.next
			for i = 0, cp.arms - 1 do
				if #run.eshots < K.eshotCapBoss(run) then
					local a = rot + i / cp.arms * TAU
					K.enemyShot(
						run,
						e.x + cos(a) * (e.r + 10),
						e.y + sin(a) * (e.r + 10),
						cos(a),
						sin(a),
						c.spd,
						e.dmg * 0.5,
						8,
						nil,
						nil,
						"bossShot"
					)
				end
			end
			if c.next == 0 then
				K.sfx(run, "efire", e.x, e.y)
			end
			c.next += 0.14
		end
	end
	if c.t >= c.wind + c.dur then
		e.mode = "chase"
		e.skillT = if e.boss.final then 2.6 else 3.6
		e.cast = nil
		K.endWind(run, e)
	end
	return ox, oy
end

-- returns the boss's movement vector
function K.bossAI(run, e, p, dx, dy, d, dt): (number, number)
	local rng = run.rng
	local ox, oy = 0, 0
	if e.mode == "chase" then
		local sp = e.speed * (if e.slowF < 1 then 0.8 else 1)
		ox, oy = dx / d * sp, dy / d * sp
		e.skillT -= dt
		if e.skillT <= 0 then
			local sk = e.boss.skills[e.skillIdx % #e.boss.skills + 1]
			-- co-op: compared with the scaled cap (the plain wave cap would turn nearly every summon into a dash)
			if sk == "summon" and #run.enemies > K.wave(run).cap * Coop.f(Coop.spawnCap, run.nPlayers) then
				sk = "dash"
			end
			e.skillIdx += 1
			e.skillT = if e.boss.final then 2.6 else 3.6
			-- every skill picks its target
			local tp = skillTarget(run, e) or p
			e.tgt = tp
			local tdx, tdy = tp.x - e.x, tp.y - e.y
			local td = math.max(1e-6, Util.hypot(tdx, tdy))
			local cp = K.castParams(e, sk)
			if cp then
				if K.canCast(run, e, tp, td, cp) then
					K.startCast(run, e, tp, sk, cp)
					return ox, oy
				end
				sk = "dash"
			end
			if sk == "dash" then
				e.mode = "windup"
				e.modeT = 0.75
				e.dashA = atan2(tdy, tdx)
				K.addTele(run, {
					kind = "line",
					x = e.x,
					y = e.y,
					a = e.dashA,
					len = 520,
					w = e.r * 1.6,
					t = 0,
					life = 0.75,
					follow = e,
				})
			elseif sk == "summon" then
				local etype = e.boss.summon
				if not etype then
					if e.type == "skel" or e.type == "night" then
						etype = "skel"
					else
						etype = rng:weighted(K.wave(run).pool)
					end
				end
				local n = if e.boss.final then 12 else 9
				for i = 0, n - 1 do
					local a = i / n * TAU
					if run.nonBoss < 450 then
						local s = K.spawnEnemy(run, etype, e.x + cos(a) * (e.r + 40), e.y + sin(a) * (e.r + 40))
						s.tgt = tp
					end
				end
				K.ev(run, { k = "burst", x = e.x, y = e.y, color = "#c9b8ff", n = 26 })
				K.sfx(run, "summon", e.x, e.y)
			elseif sk == "slam" then
				K.addTele(run, {
					kind = "circle",
					x = tp.x,
					y = tp.y,
					rad = 100,
					t = 0,
					life = 1.05,
					dmg = e.dmg * 1.2,
					src = "area",
				})
			end
		end
	elseif e.mode == "cast" then
		ox, oy = castStep(run, e, dx, dy, d, dt)
	elseif e.mode == "windup" then
		e.modeT -= dt
		if e.modeT <= 0 then
			e.mode = "dash"
			e.modeT = 0.6
			K.sfx(run, "dash", e.x, e.y)
		end
	elseif e.mode == "dash" then
		e.modeT -= dt
		ox, oy = cos(e.dashA) * 560, sin(e.dashA) * 560
		if e.modeT <= 0 then
			e.mode = "chase"
		end
	end
	return ox, oy
end

Bosses.COLORS = Enemies.COLORS
return Bosses
