-- Headless balance bot: port of the web game's strong bot (glutnacht/tools/balancebot.js strongBot, perceiveThreats,
-- chooseStrong) for one player of a Roblox sim run. Drives Run.setMove / Run.command. Deterministic: own RNG.
-- Perception (reaction time, lapses, estimation errors) is ported with the web defaults (LAPSE 0.15,0.01,0.45,0.35;
-- REACT 0.20-0.35 s).
local Rng = require("../../src/shared/Sim/Rng")
local Run = require("../../src/shared/Sim/Run")
local Weapons = require("../../src/shared/Sim/Data/Weapons")
local Tuning = require("../../src/shared/Config/Tuning")

local Bot = {}
Bot.__index = Bot

local TAU, DEG = math.pi * 2, math.pi / 180
local NDIR = 24
local DIRS = {}
for i = 0, NDIR - 1 do
	DIRS[#DIRS + 1] = { math.cos(i / NDIR * TAU), math.sin(i / NDIR * TAU) }
end
DIRS[#DIRS + 1] = { 0, 0 }
local TAUS = { 0.1, 0.22, 0.38, 0.58, 0.85, 1.2 }
local TW = { 1, 0.7, 0.4, 0.15, 0.05, 0.02 }
local LAPSE = { 0.15, 0.01, 0.45, 0.35 }
local REACT = { 0.20, 0.35 }
local HW, HH = Tuning.VIEW_HW, Tuning.VIEW_HH
local hypot = function(x, y)
	return math.sqrt(x * x + y * y)
end

function Bot.new(run, slot: number, seed: number, opts)
	opts = opts or {}
	return setmetatable({
		run = run,
		slot = slot,
		rng = Rng.new(seed),
		omni = opts.omni == true,
		lastDir = 1,
		tgt = nil,
		per = setmetatable({}, { __mode = "k" }),
		wind = setmetatable({}, { __mode = "k" }),
		expect = {},
	}, Bot)
end

function Bot:U(a, b)
	return a + self.rng:next() * (b - a)
end

function Bot:gauss()
	local u, v = 0, 0
	while u == 0 do
		u = self.rng:next()
	end
	while v == 0 do
		v = self.rng:next()
	end
	return math.sqrt(-2 * math.log(u)) * math.cos(TAU * v)
end

function Bot:newPercept(t, onScreen)
	if self.omni then
		return { seen = t, react = 0, miss = false, ang = 0, spd = 1, ox = 0, oy = 0, la = 0, life = 0 }
	end
	local pLate = math.min(LAPSE[3], LAPSE[1] + LAPSE[2] * onScreen)
	local u = self.rng:next()
	local miss = u < pLate * LAPSE[4]
	local late = not miss and u < pLate
	local oa, od = self:U(0, TAU), self:U(0, 8)
	return {
		seen = t,
		react = self:U(REACT[1], REACT[2]) + (if late then self:U(0.30, 0.40) else 0),
		miss = miss,
		ang = math.clamp(self:gauss() * 4, -8, 8) * DEG,
		spd = self:U(0.92, 1.08),
		ox = math.cos(oa) * od,
		oy = math.sin(oa) * od,
		la = self:U(-2, 2) * DEG,
		life = self:U(-0.05, 0.05),
	}
end

function Bot:perceive(o, x, y, t, P)
	local q = self.per[o]
	if not q then
		if math.abs(x - P.px) > P.hw or math.abs(y - P.py) > P.hh then
			return nil
		end
		q = self:newPercept(t, P.onScreen)
		self.per[o] = q
	end
	if q.miss or t - q.seen < q.react then
		return nil
	end
	return q
end

function Bot:perceiveWind(e, t, P)
	local w = self.wind[e]
	if not w or w.ws ~= e.windStart then
		if math.abs(e.x - P.px) > P.hw or math.abs(e.y - P.py) > P.hh then
			return nil
		end
		w = { ws = e.windStart, q = self:newPercept(t, P.onScreen) }
		self.wind[e] = w
	end
	local q = w.q
	if q.miss or t - q.seen < q.react then
		return nil
	end
	return q
end

local function rot(x, y, a)
	return x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)
end

function Bot:threats(p)
	local r = self.run
	local t = r.t
	local onScreen = 0
	for _, e in r.enemies do
		if not e.dead and math.abs(e.x - p.x) < HW and math.abs(e.y - p.y) < HH then
			onScreen += 1
		end
	end
	local P = { px = p.x, py = p.y, hw = HW, hh = HH, onScreen = onScreen }
	for i = #self.expect, 1, -1 do
		if self.expect[i].untilT < t then
			table.remove(self.expect, i)
		end
	end
	local shots, areas = {}, {}
	for _, s in r.eshots do
		local q = self:perceive(s, s.x, s.y, t, P)
		if q then
			local vx, vy = rot(s.vx * q.spd, s.vy * q.spd, q.ang)
			table.insert(shots, { x = s.x, y = s.y, vx = vx, vy = vy, r = s.r, dmg = s.dmg, life = s.life, d0 = 0 })
		end
	end
	for _, tl in r.tele do
		local f = tl.follow
		local cx, cy = if f then f.x else tl.x, if f then f.y else tl.y
		local fixed = tl.kind == "circle" or tl.kind == "lane"
		local q = self:perceive(tl, if fixed then tl.x else cx, if fixed then tl.y else cy, t, P)
		if q then
			local rem = math.max(0, tl.life - tl.t + q.life)
			if tl.kind == "circle" then
				if tl.onImpact and not tl._exp then
					tl._exp = true
					table.insert(self.expect, { x = tl.x, y = tl.y, untilT = t + rem + 1 })
				end
				table.insert(areas, {
					k = if tl.track and tl.t < tl.track["until"] then "track" else "circle",
					x = tl.x + q.ox,
					y = tl.y + q.oy,
					rad = tl.rad,
					rem = rem,
					dmg = tl.dmg or 10,
					spd = if tl.track then tl.track.spd else 0,
					trem = if tl.track then math.max(0, tl.track["until"] - tl.t) else 0,
					w = if tl.onImpact == "slow" and not (tl.dmg and tl.dmg > 0) then 0.4 else 1,
				})
			elseif tl.kind == "line" then
				table.insert(areas, {
					k = "line",
					x = cx,
					y = cy,
					a = tl.a + q.la,
					rem = rem,
					wd = (if f then f.r else 40) + p.r + 22,
					dmg = 20,
				})
			elseif tl.kind == "lane" then
				table.insert(areas, {
					k = "lane",
					x = tl.x,
					y = tl.y,
					a = tl.a + q.la,
					len = tl.len,
					rem = rem,
					wd = tl.w / 2 + p.r + 8,
					dmg = tl.dmg or 10,
				})
			elseif tl.kind == "aim" then
				local locked = tl.t >= tl.lockAt
				table.insert(areas, {
					k = "aim",
					x = cx,
					y = cy,
					a = tl.a + q.la,
					len = tl.len or 700,
					rem = rem,
					spd = tl.spd or 460,
					wd = (tl.hr or 6) + p.r + 10,
					w = if locked then 1 else 0.3,
					dmg = tl.dmg or 10,
				})
			elseif tl.kind == "charge" and tl.shots then
				local sr = tl.sr or 0
				for _, sh in tl.shots do
					local a, sp = sh.a + q.la, sh.spd * q.spd
					table.insert(shots, {
						x = cx + math.cos(a) * sr,
						y = cy + math.sin(a) * sr,
						vx = math.cos(a) * sp,
						vy = math.sin(a) * sp,
						r = sh.r or 8,
						dmg = sh.dmg or 8,
						life = sh.life or 3.5,
						d0 = rem + (sh.d or 0),
					})
				end
			end
		end
	end
	for _, h in r.haz do
		if not self.per[h] then
			for _, x in self.expect do
				if x.untilT > t and math.abs(x.x - h.x) < 2 and math.abs(x.y - h.y) < 2 then
					local q0 = self:newPercept(t, 0)
					q0.react = 0
					q0.miss = false
					self.per[h] = q0
					break
				end
			end
		end
		local q = self:perceive(h, h.x, h.y, t, P)
		if q then
			table.insert(areas, {
				k = "puddle",
				x = h.x + q.ox,
				y = h.y + q.oy,
				rad = h.rad,
				rem = 0,
				dmg = if h.dmg > 0 then h.dmg else 6,
				w = if h.kind == "slow" then 0.4 else 1,
				life = h.life - h.t,
			})
		end
	end
	local winders = {}
	for _, e in r.enemies do
		if not e.dead and e.windT > 0 and not e.boss then
			if self:perceiveWind(e, t, P) then
				table.insert(winders, e)
			end
		end
	end
	for _, s in shots do
		local rx, ry = p.x - s.x, p.y - s.y
		local v2 = s.vx * s.vx + s.vy * s.vy
		if v2 == 0 then
			v2 = 1
		end
		local tc = (rx * s.vx + ry * s.vy) / v2
		local cx, cy = s.x + s.vx * math.max(0, tc) - p.x, s.y + s.vy * math.max(0, tc) - p.y
		s.imm = if tc > 0 and hypot(cx, cy) < 200 then tc + s.d0 else math.huge
	end
	table.sort(shots, function(a, b)
		return a.imm < b.imm
	end)
	while #shots > 10 do
		table.remove(shots)
	end
	while #shots > 0 and shots[#shots].imm == math.huge do
		table.remove(shots)
	end
	for _, a in areas do
		a.imm = if a.k == "puddle" then math.max(0, hypot(a.x - p.x, a.y - p.y) - a.rad) / 150 else a.rem
	end
	table.sort(areas, function(a, b)
		return a.imm < b.imm
	end)
	while #areas > 6 do
		table.remove(areas)
	end
	return shots, areas, winders
end

-- decide the move vector for this tick
function Bot:move()
	local r = self.run
	local p = r.players[self.slot]
	if not p or p.state ~= "active" then
		Run.setMove(r, self.slot, 0, 0)
		return
	end
	local sp = p.stats.speed
	local pr = p.r
	local hpFrac = p.hp / p.stats.maxHp
	local shots, areas, winders = self:threats(p)
	local near = {}
	local cxs, cys, cw = 0, 0, 0
	for _, e in r.enemies do
		if not e.dead then
			local dx, dy = e.x - p.x, e.y - p.y
			local d2 = dx * dx + dy * dy
			if d2 < 460 * 460 then
				e._d2 = d2
				near[#near + 1] = e
			end
			if d2 < 700 * 700 then
				local w = if e.boss then 6 else 1
				cxs += dx * w
				cys += dy * w
				cw += w
			end
		end
	end
	if #near > 70 then
		table.sort(near, function(a, b)
			return a._d2 < b._d2
		end)
		for i = #near, 71, -1 do
			near[i] = nil
		end
	end
	local goals = {}
	-- gem clusters (160 px cells, in order of first appearance for determinism)
	local cells, order = {}, {}
	for _, gm in r.gems do
		if not gm.mag then
			local k = math.floor(gm.x / 160) * 100000 + math.floor(gm.y / 160)
			local c = cells[k]
			if not c then
				c = { v = 0, x = 0, y = 0 }
				cells[k] = c
				order[#order + 1] = c
			end
			c.v += gm.v
			c.x += gm.x * gm.v
			c.y += gm.y * gm.v
		end
	end
	local tgt, tbest = nil, 0
	for _, c in order do
		local x, y = c.x / c.v, c.y / c.v
		local d = hypot(x - p.x, y - p.y)
		local sc = c.v / (d + 150)
		if self.tgt and hypot(x - self.tgt[1], y - self.tgt[2]) < 160 then
			sc *= 1.5
		end
		if sc > tbest then
			tbest = sc
			tgt = { x, y, d }
		end
	end
	self.tgt = tgt
	if tgt then
		local d = if tgt[3] > 0 then tgt[3] else 1
		table.insert(goals, { (tgt[1] - p.x) / d, (tgt[2] - p.y) / d, 0.6 + 2.0 * hpFrac * hpFrac })
	end
	for _, it in r.pickups do
		if it.kind ~= "chest" or it.owner == p.slot then
			local dx, dy = it.x - p.x, it.y - p.y
			local d = hypot(dx, dy)
			if d == 0 then
				d = 1
			end
			if d <= 1400 then
				local v
				if it.kind == "chest" then
					v = 3
				elseif it.kind == "magnet" then
					v = 1.5
				elseif it.kind == "heart" then
					v = if hpFrac < 0.75 then 2.5 * (1 - hpFrac) + 0.3 else 0.05
				elseif it.kind == "bomb" then
					v = 0.8
				else
					v = 0.25
				end
				table.insert(goals, { dx / d, dy / d, v * 200 / (d + 200) })
			end
		end
	end
	for _, pr2 in r.propList do
		local dx, dy = pr2.x - p.x, pr2.y - p.y
		local d = hypot(dx, dy)
		if d == 0 then
			d = 1
		end
		if d <= 600 then
			table.insert(goals, { dx / d, dy / d, 0.4 * 200 / (d + 200) })
		end
	end
	-- co-op: downed teammates are a goal (revive), and stay near the team
	for _, q in r.plist do
		if q ~= p and q.state == "downed" then
			local dx, dy = q.x - p.x, q.y - p.y
			local d = math.max(1, hypot(dx, dy))
			table.insert(goals, { dx / d, dy / d, if hpFrac > 0.4 then 2.5 else 0.8 })
		end
	end
	if #r.act > 1 then
		local cx, cy = 0, 0
		for _, q in r.act do
			cx += q.x
			cy += q.y
		end
		cx /= #r.act
		cy /= #r.act
		local dx, dy = cx - p.x, cy - p.y
		local d = hypot(dx, dy)
		if d > 500 then
			table.insert(goals, { dx / d, dy / d, math.min(2, (d - 500) / 200) })
		end
	end
	local melee = 0
	for _, w in p.weapons do
		if w.id == "whip" or w.id == "aura" or w.id == "orbit" or w.id == "nova" then
			melee += 1
		end
	end
	if melee >= 1 and hpFrac > 0.5 then
		local best, bd = nil, 320 * 320
		for _, e in near do
			if e.ranged and not e.boss and e._d2 < bd and math.abs(e.x - p.x) < HW and math.abs(e.y - p.y) < HH then
				bd = e._d2
				best = e
			end
		end
		if best then
			local d = math.max(1e-6, math.sqrt(bd))
			table.insert(goals, { (best.x - p.x) / d, (best.y - p.y) / d, 0.4 })
		end
	end
	local burst = 0
	for _, w in p.weapons do
		burst += w.st.dmg * math.max(1, w.st.amount) / math.max(0.3, w.st.cd)
	end
	local close = 0
	for _, e in near do
		if e._d2 < 170 * 170 then
			close += 1
		end
	end
	local caution = 1 - hpFrac
	local bestI, bestS = 1, -math.huge
	for di = 1, #DIRS do
		local ux, uy = DIRS[di][1], DIRS[di][2]
		local danger = 0
		for _, e in near do
			local es = if e.freezeT > 0 then 0 else e.speed * e.slowF
			local rr = e.r + pr + (if e.boss then 26 else 10) + caution * 8
			local kf = if e.boss or e.elite then 1 else math.min(1, math.max(0.2, e.hp / (burst * 0.5 + 1)))
			local dmgW = (0.6 + e.dmg / 12 + (if e.boss then 3 else 0)) * kf
			for k = 1, #TAUS do
				local t = TAUS[k]
				local px, py = p.x + ux * sp * t, p.y + uy * sp * t
				local ex, ey
				if e.swarm then
					ex, ey = e.x + e.sdx * es * t, e.y + e.sdy * es * t
				elseif e.boss and e.mode == "dash" then
					local m = math.min(t, e.modeT)
					ex, ey = e.x + math.cos(e.dashA) * 560 * m, e.y + math.sin(e.dashA) * 560 * m
				elseif e.boss and e.mode == "windup" then
					local td = math.min(math.max(0, t - e.modeT), 0.6)
					ex, ey = e.x + math.cos(e.dashA) * 560 * td, e.y + math.sin(e.dashA) * 560 * td
				else
					local dx, dy = px - e.x, py - e.y
					local d = hypot(dx, dy)
					if d == 0 then
						d = 1
					end
					local step = math.min(d, es * t)
					ex, ey = e.x + dx / d * step, e.y + dy / d * step
				end
				local d = hypot(px - ex, py - ey)
				if d < rr + 20 then
					local pen = if d < rr then 1 + (rr - d) / rr else (rr + 20 - d) / 20 * 0.25
					danger += pen * dmgW * TW[k]
				end
			end
		end
		for _, s in shots do
			local rr = s.r + pr + 8
			for k = 1, #TAUS do
				local t = TAUS[k]
				if t >= s.d0 then
					if t - s.d0 > s.life then
						break
					end
					local px, py = p.x + ux * sp * t, p.y + uy * sp * t
					local sx, sy = s.x + s.vx * (t - s.d0), s.y + s.vy * (t - s.d0)
					local d = hypot(px - sx, py - sy)
					if d < rr + 14 then
						danger += (if d < rr then 2 else 0.4) * (0.6 + s.dmg / 10) / (1 + t)
					end
				end
			end
		end
		for _, tl in areas do
			local rem = tl.rem
			if tl.k == "circle" or tl.k == "track" then
				local t = math.min(rem, 1.0)
				local px, py = p.x + ux * sp * t, p.y + uy * sp * t
				local cx, cy = tl.x, tl.y
				if tl.k == "track" then
					local dx, dy = px - cx, py - cy
					local dd = math.max(1e-6, hypot(dx, dy))
					local st = math.min(dd, tl.spd * math.min(tl.trem, t))
					cx += dx / dd * st
					cy += dy / dd * st
				end
				local d = hypot(px - cx, py - cy)
				local rr = tl.rad + pr + 14
				if d < rr then
					danger += (4 + (rr - d) / 20) * (0.6 + tl.dmg / 12) * tl.w
				end
			elseif tl.k == "puddle" then
				for k = 1, 3 do
					local t = TAUS[k]
					if t > tl.life then
						break
					end
					local px, py = p.x + ux * sp * t, p.y + uy * sp * t
					local d = hypot(px - tl.x, py - tl.y)
					local rr = tl.rad + pr
					if d < rr then
						danger += (2 + (rr - d) / 15) * (0.6 + tl.dmg / 12) * tl.w * TW[k]
					end
				end
			elseif tl.k == "line" then
				local ca, sa = math.cos(tl.a), math.sin(tl.a)
				for _, t in { rem, rem + 0.2, rem + 0.4 } do
					local tt = math.min(t, 1.2)
					local px, py = p.x + ux * sp * tt, p.y + uy * sp * tt
					local rx, ry = px - tl.x, py - tl.y
					local along, perp = rx * ca + ry * sa, math.abs(-rx * sa + ry * ca)
					if along > -60 and along < 420 and perp < tl.wd then
						danger += 3 + (tl.wd - perp) / 15
					end
				end
			elseif tl.k == "lane" then
				local ca, sa = math.cos(tl.a), math.sin(tl.a)
				local tt = math.min(rem, 1.2)
				local px, py = p.x + ux * sp * tt, p.y + uy * sp * tt
				local rx, ry = px - tl.x, py - tl.y
				local along, perp = rx * ca + ry * sa, math.abs(-rx * sa + ry * ca)
				if along > -tl.wd and along < tl.len + tl.wd and perp < tl.wd then
					danger += (4 + (tl.wd - perp) / 15) * (0.6 + tl.dmg / 12)
				end
			elseif tl.k == "aim" then
				local ca, sa = math.cos(tl.a), math.sin(tl.a)
				local d0 = hypot(p.x - tl.x, p.y - tl.y)
				local tt = math.min(1.2, rem + d0 / tl.spd)
				local px, py = p.x + ux * sp * tt, p.y + uy * sp * tt
				local rx, ry = px - tl.x, py - tl.y
				local along, perp = rx * ca + ry * sa, math.abs(-rx * sa + ry * ca)
				if along > 0 and along < tl.len and perp < tl.wd then
					danger += (3 + (tl.wd - perp) / 5) * (0.6 + tl.dmg / 12) * tl.w
				end
			end
		end
		for _, e in winders do
			local dx, dy = p.x - e.x, p.y - e.y
			local dd = math.max(1e-6, hypot(dx, dy))
			local t = 0.38
			local px, py = p.x + ux * sp * t, p.y + uy * sp * t
			local rx, ry = px - e.x, py - e.y
			local perp = math.abs(-rx * dy / dd + ry * dx / dd)
			if perp < pr + 20 then
				danger += 0.3 * (1 + (pr + 20 - perp) / 20)
			end
		end
		local crowd, clear = 0, 600
		if di <= NDIR then
			for _, e in near do
				local dx, dy = e.x - p.x, e.y - p.y
				local d = math.max(1e-6, hypot(dx, dy))
				local along = dx * ux + dy * uy
				local w = (if e.boss then 5 else 1) * (0.5 + e.dmg / 15)
				if along > 0 then
					local perp = math.abs(-dx * uy + dy * ux)
					if perp < e.r + pr + 18 then
						clear = math.min(clear, along)
					end
					if d < 320 then
						crowd += w * (along / d) * (along / d) / math.max(60, d)
					end
				end
			end
		else
			for _, e in near do
				local d = math.max(1e-6, hypot(e.x - p.x, e.y - p.y))
				crowd += 0.5 * (if e.boss then 5 else 1) / math.max(60, d)
			end
			clear = 200
		end
		local sc = -danger * 10 - crowd * 4 + math.min(clear, 400) / 400
		for _, b in r.bosses do
			if not b.dead then
				local dx, dy = b.x - p.x, b.y - p.y
				local d = math.max(1e-6, hypot(dx, dy))
				local busy = b.mode ~= "chase"
				local want = if busy or hpFrac < 0.5 or close > 8 then 260 elseif melee >= 1 then b.r + 75 else 200
				local c = (dx * ux + dy * uy) / d
				if d < want then
					sc -= c * (want - d) / 60
				elseif d < want + 300 then
					sc += c * math.min(1, (d - want) / 120) * 0.8
				end
			end
		end
		if di <= NDIR then
			for _, g in goals do
				local c = g[1] * ux + g[2] * uy
				if c > 0 then
					sc += g[3] * c * c
				end
			end
			if cw > 0 then
				local cl = math.max(1e-6, hypot(cxs, cys))
				local tx, ty = -cys / cl, cxs / cl
				sc += 0.25 * (tx * ux + ty * uy)
			end
			if self.lastDir <= NDIR then
				local l = DIRS[self.lastDir]
				sc += 0.35 * (l[1] * ux + l[2] * uy)
			end
		else
			sc -= 0.3
		end
		if sc > bestS then
			bestS = sc
			bestI = di
		end
	end
	self.lastDir = bestI
	Run.setMove(r, self.slot, DIRS[bestI][1], DIRS[bestI][2])
end

-- ---------- build choices (web scoreOpt / chooseStrong) ----------
local WTIER = { lightning = 10, whip = 9, sickle = 9, aura = 8, nova = 7, fire = 7, orbit = 6, knives = 6, wand = 5 }
local MAXW = 4
local CORE = { might = 74, hourglass = 72, mirror = 76, heart = 70, armor = 62 }
local OTHER = { lens = 52, clover = 45, elixir = 46, magnet = 44, boots = 40, candle = 38, wing = 35 }

local function hasPassive(p, id)
	for _, x in p.passives do
		if x.id == id then
			return true
		end
	end
	return false
end

local function scoreOpt(p, o)
	local partners, plist = {}, {}
	for _, w in p.weapons do
		local id = Weapons.byId[w.id].evo.with
		if not partners[id] then
			partners[id] = true
			table.insert(plist, id)
		end
	end
	if o.kind == "weapon" then
		if not o.isNew then
			local s = 80 + WTIER[o.id] + o.level * 0.5
			if o.level == 8 and hasPassive(p, Weapons.byId[o.id].evo.with) then
				s += 10
			end
			return s
		end
		if #p.weapons < MAXW then
			return 86 + WTIER[o.id]
		end
		return 50 + WTIER[o.id]
	end
	if o.kind == "passive" then
		local id = o.id
		local s
		if partners[id] then
			s = math.max(CORE[id] or 0, 78)
		else
			s = CORE[id] or OTHER[id] or 30
		end
		if o.isNew and not partners[id] and not CORE[id] then
			local free = 6 - #p.passives
			local missing = 0
			for _, x in plist do
				if not hasPassive(p, x) then
					missing += 1
				end
			end
			missing += math.max(0, MAXW - #p.weapons)
			if free - 1 < missing then
				s -= 30
			end
		end
		return s
	end
	return 1
end

local function sorted(p, opts)
	local s = table.clone(opts)
	table.sort(s, function(a, b)
		return scoreOpt(p, a) > scoreOpt(p, b)
	end)
	return s
end

-- answers a pending level-up offer of this bot's player
function Bot:choose()
	local r = self.run
	local p = r.players[self.slot]
	if not p or not p.offer then
		return
	end
	local s = sorted(p, p.offer)
	local tries = 0
	while scoreOpt(p, s[1]) < 40 and tries < 3 do
		tries += 1
		if p.banishes > 0 then
			local bad, bi = nil, nil
			for i, o in p.offer do
				if o.isNew and scoreOpt(p, o) < 40 then
					bad, bi = o, i
					break
				end
			end
			if bad and Run.command(r, self.slot, { op = "banish", i = bi }) then
				s = sorted(p, p.offer)
				continue
			end
		end
		if p.rerolls > 0 then
			Run.command(r, self.slot, { op = "reroll" })
			s = sorted(p, p.offer)
			continue
		end
		if p.skips > 0 and scoreOpt(p, s[1]) < 20 then
			Run.command(r, self.slot, { op = "skip" })
			return
		end
		break
	end
	for i, o in p.offer do
		if o == s[1] then
			Run.command(r, self.slot, { op = "pick", i = i })
			return
		end
	end
end

return Bot
