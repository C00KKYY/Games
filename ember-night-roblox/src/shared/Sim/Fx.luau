--!native
-- Player area effects (fire pools, frost novas), telegraphs and hazards (web updateFx, circleImpact, laneImpact,
-- addHaz). Telegraph and hazard changes are replicated as events.
local K = if script then require(script.Parent.K) else require("./K")
local Util = if script then require(script.Parent.Util) else require("./Util")

local Fx = {}

local HAZ_CAP = 8
local sqrt = math.sqrt

local function hitRadius(run, pl): number
	return pl.r - run.hitShrink
end

function K.addHaz(run, h)
	local hz = run.haz
	if #hz >= HAZ_CAP then
		local old = nil
		for _, o in hz do
			if o.life - o.t > 0.3 and (not old or o.t > old.t) then
				old = o
			end
		end
		if old then
			old.life = old.t + 0.3
			K.ev(run, { k = "haz~", id = old.id, life = 0.3 })
		end
	end
	h.t = 0
	h.id = K.oid(run)
	hz[#hz + 1] = h
	K.ev(run, { k = "haz+", h = h })
end

function K.circleImpact(run, t)
	for _, p in run.act do
		local rr = t.rad + hitRadius(run, p)
		if Util.dist2(p.x, p.y, t.x, t.y) < rr * rr then
			K.hurtPlayer(run, p, t.dmg, t.src or "area")
		end
	end
	if t.small then
		K.ev(run, { k = "boom", x = t.x, y = t.y, rad = t.rad, color = "#ff3d5a" })
		K.shake(run, 3, t.x, t.y)
		K.sfx(run, "eimpact", t.x, t.y)
	else
		K.ev(run, { k = "boom", x = t.x, y = t.y, rad = t.rad, color = "#ff8a5c" })
		K.shake(run, 8, t.x, t.y)
		K.sfx(run, "slam", t.x, t.y)
	end
	if t.onImpact == "ember" then
		K.addHaz(run, { kind = "ember", x = t.x, y = t.y, rad = 32, life = 2.6, dmg = t.pdmg or t.dmg * 0.4 })
	elseif t.onImpact == "slow" then
		K.addHaz(run, { kind = "slow", x = t.x, y = t.y, rad = t.rad, life = 3.0, dmg = 0 })
	end
end

function K.laneImpact(run, t)
	local ca, sa = math.cos(t.a), math.sin(t.a)
	for _, p in run.act do
		local pr = hitRadius(run, p)
		local rx, ry = p.x - t.x, p.y - t.y
		local along = rx * ca + ry * sa
		local perp = math.abs(-rx * sa + ry * ca)
		if along > -pr and along < t.len + pr and perp < t.w / 2 + pr then
			K.hurtPlayer(run, p, t.dmg, "lane")
		end
	end
	K.shake(run, 5, t.x + ca * t.len / 2, t.y + sa * t.len / 2)
	K.sfx(run, "eimpact", t.x + ca * t.len / 2, t.y + sa * t.len / 2)
end

function K.updateFx(run, dt: number)
	local fx = run.fx
	for i = #fx, 1, -1 do
		local f = fx[i]
		f.t += dt
		local pl = run.players[f.slot]
		if f.kind == "pool" then
			f.tick -= dt
			if f.tick <= 0 then
				f.tick = 0.35
				local list = table.clone(K.circle(run, f.x, f.y, f.rad))
				for _, e in list do
					K.damage(run, e, f.dmg, f.wid, 0, if pl then pl.stats.crit else 0.05, nil, nil, f.slot)
				end
			end
		elseif f.kind == "nova" then
			local k = math.min(1, f.t / 0.5)
			local rad = f.maxRad * (1 - (1 - k) * (1 - k))
			f.rad = rad
			local list = table.clone(K.circle(run, f.x, f.y, rad))
			for _, e in list do
				if not f.hit[e] then
					f.hit[e] = true
					if f.freeze and not e.boss then
						e.freezeT = math.max(e.freezeT, f.slowDur * 0.6)
					end
					e.slowT = math.max(e.slowT, f.slowDur)
					e.slowF = 0.45
					K.damage(run, e, f.dmg, f.wid, 140, if pl then pl.stats.crit else 0.05, f.x, f.y, f.slot)
				end
			end
		end
		if f.t >= f.life then
			fx[i] = fx[#fx]
			fx[#fx] = nil
		end
	end

	-- telegraphs (bosses and ranged); those attached to a wind-up live exactly as long as the wind-up
	local tele = run.tele
	for i = #tele, 1, -1 do
		local t = tele[i]
		local gone = t.dead == true
		if t.own then
			local o = t.own
			if o.dead or o.windStart ~= t.ws or not (o.windT > 0) then
				gone = true
			else
				t.life = o.windMax
				t.t = o.windMax - o.windT
			end
		else
			t.t += dt
		end
		if t.follow then
			t.x = t.follow.x
			t.y = t.follow.y
		end
		if not gone and t.lockAt ~= nil and t.t < t.lockAt and t.follow then
			local p = t.target
			if p and p.state == "active" then
				t.a = K.leadAim(p, t.x, t.y, t.lead, t.spd) + (t.o or 0)
				K.aimShots(t)
				t.aimDirty = true
			end
		end
		if t.track and t.t < t.track["until"] then
			local p = t.target
			if p and p.state == "active" then
				local dx, dy = p.x - t.x, p.y - t.y
				local d = sqrt(dx * dx + dy * dy)
				local st = math.min(d, t.track.spd * dt)
				if d > 0.01 then
					t.x += dx / d * st
					t.y += dy / d * st
				end
				t.x, t.y = K.clampView(p, t.x, t.y, 20)
				t.aimDirty = true
			end
		end
		if not gone and not t.own and t.t >= t.life then
			gone = true
			if t.kind == "circle" then
				K.circleImpact(run, t)
			elseif t.kind == "lane" then
				K.laneImpact(run, t)
			end
		end
		if gone then
			tele[i] = tele[#tele]
			tele[#tele] = nil
			K.ev(run, { k = "tele-", id = t.id })
		elseif t.aimDirty then
			t.aimDirty = false
			K.ev(run, { k = "tele~", tl = t })
		end
	end

	-- hazards: embers hurt, slime slows
	local hz = run.haz
	for i = #hz, 1, -1 do
		local h = hz[i]
		h.t += dt
		if h.t >= h.life then
			hz[i] = hz[#hz]
			hz[#hz] = nil
			K.ev(run, { k = "haz-", id = h.id })
		else
			for _, p in run.act do
				local rr = h.rad + p.r - 4
				if Util.dist2(p.x, p.y, h.x, h.y) < rr * rr then
					if h.kind == "ember" then
						K.hurtPlayer(run, p, h.dmg, "puddle")
					else
						p.slowT = 0.15
					end
				end
			end
		end
	end
end

return Fx
