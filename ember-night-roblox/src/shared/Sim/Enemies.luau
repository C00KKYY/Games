--!native
-- Enemy movement and ranged AI (web updateEnemies, rangedAI, capOK, leadAim, startWind, endWind, releaseWind,
-- pendStep, enemyShot). Co-op: every enemy chases its target player (nearest active, re-evaluated every 0.5 s with
-- hysteresis), touches any active player, relocates when far from all active players (docs/DESIGN.md §2.7).
local K = if script then require(script.Parent.K) else require("./K")
local Enemies = if script then require(script.Parent.Data.Enemies) else require("./Data/Enemies")
local Coop = if script then require(script.Parent.Coop) else require("./Coop")
local Util = if script then require(script.Parent.Util) else require("./Util")
local Tuning = if script then require(script.Parent.Parent.Config.Tuning) else require("../Config/Tuning")

local EnemiesMod = {}

local EDEF = Enemies.byId
local TAU, DEG = Util.TAU, Util.DEG
local sqrt, exp, atan2, cos, sin = math.sqrt, math.exp, math.atan2, math.cos, math.sin
local WARD_RADIUS = Tuning.WARD_RADIUS

function K.eshotCap(run): number
	return Coop.f(Coop.eshotCap, run.nPlayers)
end
function K.eshotCapBoss(run): number
	return Coop.f(Coop.eshotCapBoss, run.nPlayers)
end
function K.teleCap(run): number
	return Coop.f(Coop.teleCap, run.nPlayers)
end

-- ---------- telegraphs and enemy shots (with ids and replication events) ----------
function K.addTele(run, tl)
	tl.id = K.oid(run)
	local tele = run.tele
	tele[#tele + 1] = tl
	K.ev(run, { k = "tele+", tl = tl })
end

function K.enemyShot(run, x, y, dx, dy, speed, dmg, rad, life, kind, src)
	local s = {
		id = K.oid(run),
		x = x,
		y = y,
		vx = dx * speed,
		vy = dy * speed,
		dmg = dmg,
		r = rad,
		life = life or 3.5,
		kind = kind or "orb",
		src = src or "shot",
	}
	local es = run.eshots
	es[#es + 1] = s
	K.ev(run, { k = "eshot+", s = s })
	return s
end

-- aim with lead: target position + velocity x lead x flight time
function K.leadAim(p, x: number, y: number, lead: number, spd: number): number
	if lead == 0 then
		return atan2(p.y - y, p.x - x)
	end
	local tt = Util.hypot(p.x - x, p.y - y) / spd
	return atan2(p.y + p.vy * lead * tt - y, p.x + p.vx * lead * tt - x)
end

function K.aimShots(tl)
	if tl.shots then
		for _, sh in tl.shots do
			sh.a = tl.a + sh.o
		end
	end
end

-- does the whole volley still fit under the caps?
function K.capOK(run, e): boolean
	local el = e.elite
	local rk = e.rk
	local n, nt
	if rk == "spit" then
		n = if el then 5 elseif run.t >= 240 then 3 else 1
		nt = 1
	elseif rk == "needle" then
		n = if el then 3 else 1
		nt = if el then 3 else 1
	elseif rk == "ring" then
		n = if el then 36 else 20
		nt = 1
	else
		n = 0
		nt = if el then 3 else 1
	end
	return #run.eshots + n <= K.eshotCap(run) and #run.tele + nt <= K.teleCap(run)
end

function K.startWind(run, e, p)
	local def = EDEF[e.type]
	local rng = run.rng
	e.windT = def.wind
	e.windMax = def.wind
	e.windStart = run.t
	local v = run.vol
	v.active += 1
	v.lastStart = run.t
	if e.rk == "ring" then
		v.bells += 1
	end
	K.sfx(run, "ewind", e.x, e.y)
	local el = e.elite
	local function base(tl)
		tl.follow = e
		tl.own = e
		tl.ws = run.t
		tl.x = e.x
		tl.y = e.y
		tl.t = 0
		tl.life = def.wind
		tl.target = p
		return tl
	end
	e.teles = {}
	if e.rk == "spit" then
		local n = if el then 5 elseif run.t >= 240 then 3 else 1
		local step = (if el then 14 else 16) * DEG
		local spd = K.eSpeed(run, 170, 210)
		local offs = {}
		for i = 0, n - 1 do
			offs[#offs + 1] = (i - (n - 1) / 2) * step
		end
		local dmg = e.dmg * (if n > 1 and not el then 0.8 elseif el then 0.8 else 1)
		local shots = {}
		for _, o in offs do
			shots[#shots + 1] = { a = 0, o = o, spd = spd, r = 7, dmg = dmg, life = 3.5 }
		end
		local tl = base({
			kind = "charge",
			wedge = 90,
			a = K.leadAim(p, e.x, e.y, 0, spd),
			lockAt = def.wind - 0.15,
			lead = 0,
			spd = spd,
			offs = offs,
			sr = e.r * 0.6,
			shots = shots,
		})
		K.aimShots(tl)
		table.insert(e.teles, tl)
	elseif e.rk == "needle" then
		local spd = K.eSpeed(run, 460, 520)
		local os = if el then { -10 * DEG, 0, 10 * DEG } else { 0 }
		for _, o in os do
			table.insert(
				e.teles,
				base({
					kind = "aim",
					len = 700,
					lockAt = 0.6,
					lead = 0.5,
					spd = spd,
					o = o,
					a = K.leadAim(p, e.x, e.y, 0.5, spd) + o,
					hr = 6,
					dmg = e.dmg * 0.8,
				})
			)
		end
	elseif e.rk == "ring" then
		local n = if el then 12 else 10
		local rings = if el then 3 else 2
		local off = rng:range(0, TAU)
		local step = TAU / n
		local spd = K.eSpeed(run, 110, 210)
		local shots = {}
		for k = 0, rings - 1 do
			local add = if k == 1 then 0.5 elseif k == 2 then 0.25 else 0
			for i = 0, n - 1 do
				shots[#shots + 1] =
					{ a = off + (i + add) * step, spd = spd, r = 8, dmg = e.dmg * 0.6, life = 4.0, d = k * 0.3 }
			end
		end
		table.insert(e.teles, base({ kind = "charge", ring = true, sr = e.r + 18, shots = shots }))
	end
	for _, tl in e.teles do
		K.addTele(run, tl)
	end
end

function K.endWind(_run, e)
	e.windT = 0
	e.windStart = -1
	if e.teles then
		for _, tl in e.teles do
			tl.dead = true
		end
		e.teles = nil
	end
end

function K.releaseWind(run, e)
	local rng = run.rng
	local teles = e.teles or {}
	local def = EDEF[e.type]
	K.sfx(run, "efire", e.x, e.y)
	e.shootT = rng:range(def.cd[1], def.cd[2]) * K.cdMul(run)
	if e.rk == "spit" or e.rk == "ring" then
		local tl = teles[1]
		if tl then
			local later = nil
			for _, sh in tl.shots do
				local sx, sy = e.x + cos(sh.a) * tl.sr, e.y + sin(sh.a) * tl.sr
				if sh.d and sh.d > 0 then
					later = later or {}
					table.insert(later, { t = sh.d, sh = sh })
				else
					K.enemyShot(
						run,
						sx,
						sy,
						cos(sh.a),
						sin(sh.a),
						sh.spd,
						sh.dmg,
						sh.r,
						sh.life,
						nil,
						if e.rk == "ring" then "ring" else "shot"
					)
				end
			end
			if later then
				e.pend = later
			end
		end
	elseif e.rk == "needle" then
		for _, tl in teles do
			K.enemyShot(
				run,
				e.x + cos(tl.a) * e.r,
				e.y + sin(tl.a) * e.r,
				cos(tl.a),
				sin(tl.a),
				tl.spd,
				tl.dmg,
				tl.hr,
				1.6,
				"needle",
				"needle"
			)
		end
	elseif e.rk == "mortar" then
		local p = e.tgt
		if p then
			local fl = 1.1
			local sa, sc = rng:range(0, TAU), rng:range(0, 30)
			local tx, ty =
				K.clampView(p, p.x + p.vx * 0.6 * fl + cos(sa) * sc, p.y + p.vy * 0.6 * fl + sin(sa) * sc, 20)
			local pts = { { tx, ty } }
			if e.elite then
				pts = {}
				for i = 0, 2 do
					local a = -math.pi / 2 + i * TAU / 3
					local qx, qy = K.clampView(p, tx + cos(a) * 40.4, ty + sin(a) * 40.4, 20)
					table.insert(pts, { qx, qy })
				end
			end
			for _, q in pts do
				K.addTele(run, {
					kind = "circle",
					x = q[1],
					y = q[2],
					rad = 40,
					t = 0,
					life = fl,
					dmg = e.dmg,
					src = "mortar",
					onImpact = "ember",
					pdmg = e.dmg * 0.45,
					coalX = e.x,
					coalY = e.y - e.r * 0.7,
					small = true,
				})
			end
		end
	end
	K.endWind(run, e)
end

-- delayed second/third bell rings
function K.pendStep(run, e, dt: number)
	local pd = e.pend
	for i = #pd, 1, -1 do
		local q = pd[i]
		q.t -= dt
		if q.t <= 0 then
			local sh = q.sh
			local sr = e.r + 18
			if #run.eshots < K.eshotCapBoss(run) then
				K.enemyShot(
					run,
					e.x + cos(sh.a) * sr,
					e.y + sin(sh.a) * sr,
					cos(sh.a),
					sin(sh.a),
					sh.spd,
					sh.dmg,
					sh.r,
					sh.life,
					nil,
					"ring"
				)
			end
			table.remove(pd, i)
		end
	end
	if #pd == 0 then
		e.pend = nil
	end
end

-- ranged movement: keep distance D (band, but inside the view), retreat below, approach above, strafe between.
local function rangedAI(run, e, p, dx, dy, d, dt): (number, number)
	local def = EDEF[e.type]
	local rng = run.rng
	local sp = e.speed * e.slowF
	local ux, uy = dx / d, dy / d
	if e.pend then
		K.pendStep(run, e, dt)
	end
	if e.windT > 0 then
		if not (e.freezeT > 0) then
			e.windT -= dt * e.slowF
			if e.windT <= 0 then
				K.releaseWind(run, e)
			end
		end
		return 0, 0
	end
	local kEdge = if e.rk == "needle" then 0.85 else 0.8
	local D = math.min(def.band[2] - 30, kEdge * K.edgeDist(atan2(-dy, -dx)))
	local retreat = if e.elite then 0 else def.retreat
	local dir = 0
	if d < D - 40 then
		dir = -retreat
	elseif d > D + 40 then
		dir = 1
	end
	if rng:next() < dt * 0.25 then
		e.side = -e.side
	end
	local st = def.strafe * e.side
	if e.rk == "needle" then
		e.flitT -= dt
		if e.flitT <= 0 then
			e.flitT = 1.2
			e.flitD = 0.25
			e.side = if rng:next() < 0.5 then -1 else 1
		end
		if e.flitD > 0 then
			e.flitD -= dt
			st = 1.4 * e.side
		end
	end
	local ox, oy = ux * sp * dir - uy * sp * st, uy * sp * dir + ux * sp * st
	if e.freezeT > 0 then
		return ox, oy
	end
	e.shootT -= dt * e.slowF
	if e.shootT <= 0 then
		if d < def.band[2] + 120 and K.inViewRect(p, e.x, e.y, 24, 12) and K.canWind(run, e) and K.capOK(run, e) then
			K.startWind(run, e, p)
		else
			e.shootT = 0.3
		end
	end
	return ox, oy
end

-- choose / refresh the target of a non-boss enemy (nearest active player, 15 % hysteresis, every 0.5 s staggered)
local function retarget(run, e)
	local cur = e.tgt
	if cur and cur.state == "active" and (run.tick + e.id) % run.retargetPeriod ~= 0 then
		return cur
	end
	local best, bd = K.nearestActive(run, e.x, e.y)
	if cur and cur.state == "active" and best ~= cur then
		local cx, cy = cur.x - e.x, cur.y - e.y
		local cd2 = cx * cx + cy * cy
		-- new target must be 15 % closer (distance), i.e. 0.7225 in squared distance
		if bd > cd2 * 0.7225 then
			best = cur
		end
	end
	e.tgt = best
	return best
end

function K.updateEnemies(run, dt: number)
	local act = run.act
	if #act == 0 then
		return
	end
	local g = run.grid
	local near = run.qbufs[1]
	local reloc = K.viewRadius() * 1.5 + 100
	local reloc2 = reloc * reloc
	local decay = exp(-9 * dt)
	local nact, bells, ra, nonBoss = 0, 0, 0, 0
	for _, e in run.enemies do
		if not e.dead then
			if e.windT > 0 or (e.boss and e.mode == "cast") then
				nact += 1
				if e.rk == "ring" then
					bells += 1
				end
			end
			if e.ranged and not e.boss then
				ra += 1
			end
			if not e.boss then
				nonBoss += 1
			end
		end
	end
	run.vol.active = nact
	run.vol.bells = bells
	run.rangedAlive = ra
	run.nonBoss = nonBoss
	local wards = run.wardList
	local enemies = run.enemies
	-- like the web game's for-of loop, enemies spawned during the loop (boss summons) are updated in this step too
	local ei = 0
	while ei < #enemies do
		ei += 1
		local e = enemies[ei]
		if #act == 0 then
			break -- the last active player went down during this loop
		end
		if e.dead then
			continue
		end
		e.anim += dt
		if e.fadeT > 0 then
			e.fadeT -= dt
		end
		if e.flash > 0 then
			e.flash -= dt
		end
		if e.slowT > 0 then
			e.slowT -= dt
			if e.slowT <= 0 then
				e.slowF = 1
			end
		end
		local p
		if e.boss then
			p = e.tgt
			if not p or p.state ~= "active" then
				p = K.nearestActive(run, e.x, e.y)
				e.tgt = p
			end
		else
			p = retarget(run, e)
		end
		local mx, my = 0, 0
		local dx, dy = p.x - e.x, p.y - e.y
		local d = sqrt(dx * dx + dy * dy)
		if d == 0 then
			d = 1
		end
		if e.swarm then
			e.life -= dt * e.slowF
			if e.life <= 0 then
				e.dead = true
				K.ev(run, { k = "despawn", id = e.id })
				continue
			end
			mx, my = e.sdx * e.speed * e.slowF, e.sdy * e.speed * e.slowF
		elseif e.boss then
			mx, my = K.bossAI(run, e, p, dx, dy, d, dt)
		else
			local sp = e.speed * e.slowF
			if e.rk then
				mx, my = rangedAI(run, e, p, dx, dy, d, dt)
			else
				mx, my = dx / d * sp, dy / d * sp
			end
		end
		if dx < -1 then
			e.face = -1
		elseif dx > 1 then
			e.face = 1
		end
		if e.freezeT > 0 then
			e.freezeT -= dt
			mx, my = 0, 0
			if e.windT > 0 and not e.boss then
				K.endWind(run, e)
				e.shootT = 1.0
			end
		end
		-- co-op ember ward: slow within 200 px, push outward within WARD_RADIUS
		if #wards > 0 and not e.boss then
			for _, w in wards do
				local wx, wy = e.x - w.x, e.y - w.y
				local wd2 = wx * wx + wy * wy
				if wd2 < 40000 then
					mx *= 0.5
					my *= 0.5
					if wd2 < WARD_RADIUS * WARD_RADIUS then
						local wd = sqrt(wd2)
						if wd < 0.01 then
							wx, wy, wd = 1, 0, 1
						end
						mx += wx / wd * 300
						my += wy / wd * 300
					end
				end
			end
		end
		-- separation
		if not e.swarm then
			g:query(e.x, e.y, e.r + 30, near)
			local sx, sy = 0, 0
			for i = 1, #near do
				local o = near[i]
				if o ~= e and not o.dead and not o.swarm then
					local ox, oy = e.x - o.x, e.y - o.y
					local rr = e.r + o.r
					local d2 = ox * ox + oy * oy
					if d2 < rr * rr and d2 > 0.01 then
						local dd = sqrt(d2)
						local push = (rr - dd) / rr
						local w = if e.boss then 0.1 elseif o.boss then 3 else 1
						sx += ox / dd * push * w
						sy += oy / dd * push * w
					end
				end
			end
			mx += sx * 90
			my += sy * 90
		end
		local ex0, ey0 = e.x, e.y
		e.x += (mx + e.kx) * dt
		e.y += (my + e.ky) * dt
		e.kx *= decay
		e.ky *= decay

		-- too far from every active player: relocate
		if not e.swarm and d > reloc then
			local far = true
			if #act > 1 then
				for _, q in act do
					local qx, qy = q.x - e.x, q.y - e.y
					if qx * qx + qy * qy <= reloc2 then
						far = false
						break
					end
				end
			end
			if far then
				if e.boss then
					local a = atan2(dy, dx)
					e.x = p.x - cos(a) * K.viewRadius()
					e.y = p.y - sin(a) * K.viewRadius()
				else
					local anchor = K.anchor(run)
					e.x, e.y = K.spawnPos(run, anchor)
					e.tgt = anchor
					if e.windT > 0 then
						K.endWind(run, e)
					end
				end
				K.ev(run, { k = "warp", id = e.id })
			end
		end

		-- contact with any active player (pre-move distance, like the web game)
		for _, q in act do
			local rr = e.r + q.r - 3
			local qx, qy = q.x - ex0, q.y - ey0
			if qx * qx + qy * qy < rr * rr then
				K.hurtPlayer(
					run,
					q,
					e.dmg,
					if e.boss then "boss" elseif e.elite then "elite" elseif e.swarm then "swarm" else "contact"
				)
			end
		end
	end
end

return EnemiesMod
