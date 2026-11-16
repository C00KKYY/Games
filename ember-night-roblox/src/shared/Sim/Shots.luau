--!native
-- Player projectiles (bolt, knife, sickle, flask) and enemy shots (web updateShots, updateEnemyShots).
-- Collision is swept along the travelled segment, so the fixed 1/30 s step cannot tunnel (docs/DESIGN.md §1.2).
local K = if script then require(script.Parent.K) else require("./K")
local Util = if script then require(script.Parent.Util) else require("./Util")
local Tuning = if script then require(script.Parent.Parent.Config.Tuning) else require("../Config/Tuning")

local Shots = {}

local sqrt, sin, pi = math.sqrt, math.sin, math.pi
local lerp = Util.lerp
local WARD_R2 = Tuning.WARD_RADIUS * Tuning.WARD_RADIUS
-- swept (segment) collision only when a step is longer than the web game's ~1/60 s; with SIM_SUBSTEPS = 2 the sim
-- tests the end point of every half step exactly like the web game (verified by tests/parity.spec.luau)
local SWEPT = (Tuning.SIM_DT / (Tuning.SIM_SUBSTEPS or 1)) > 1 / 59

function K.updateShots(run, dt: number)
	local shots = run.shots
	for i = #shots, 1, -1 do
		local s = shots[i]
		s.t += dt
		local alive = true
		if s.kind == "flask" then
			local k = s.t / s.T
			s.x = lerp(s.sx, s.tx, k)
			s.y = lerp(s.sy, s.ty, k) - sin(k * pi) * 70
			if k >= 1 then
				alive = false
				local f = {
					kind = "pool",
					x = s.tx,
					y = s.ty,
					rad = s.rad,
					t = 0,
					life = s.life,
					tick = 0,
					dmg = s.dmg,
					wid = s.wid,
					evo = s.evo,
					slot = s.slot,
				}
				table.insert(run.fx, f)
				K.ev(run, { k = "pool", slot = s.slot, x = s.tx, y = s.ty, rad = s.rad, life = s.life, evo = s.evo })
				K.sfx(run, "flask", s.tx, s.ty)
			end
		else
			if s.kind == "sickle" then
				s.spin += dt * 14
				if not s.back then
					s.vx -= s.vx0 * 1.7 * dt
					s.vy -= s.vy0 * 1.7 * dt
					if s.vx * s.vx0 + s.vy * s.vy0 <= 0 then
						s.back = true
					end
				else
					local o = run.players[s.slot]
					local ox, oy = if o then o.x else s.x, if o then o.y else s.y
					local dx, dy = ox - s.x, oy - s.y
					local d = sqrt(dx * dx + dy * dy)
					if d == 0 then
						d = 1
					end
					s.ret = math.min(s.speed * 1.4, (s.ret or 60) + 900 * dt)
					s.vx = dx / d * s.ret
					s.vy = dy / d * s.ret
					if d < 20 then
						alive = false
					end
				end
			end
			local x0, y0 = s.x, s.y
			s.x += s.vx * dt
			s.y += s.vy * dt
			if s.t > s.life then
				alive = false
			end
			if alive then
				local list = table.clone(
					if SWEPT then K.sweep(run, x0, y0, s.x, s.y, s.r) else K.circle(run, s.x, s.y, s.r)
				)
				for _, e in list do
					if not alive then
						break
					end
					if s.kind == "sickle" then
						local nt = s.hits[e]
						if nt == nil or nt <= run.t then
							s.hits[e] = run.t + 0.45
							K.damage(run, e, s.dmg, s.wid, 90, s.crit, s.x, s.y, s.slot)
						end
					elseif not s.hit[e] then
						s.hit[e] = true
						K.damage(
							run,
							e,
							s.dmg,
							s.wid,
							if s.kind == "knife" then 60 else 120,
							s.crit,
							s.x - s.vx,
							s.y - s.vy,
							s.slot
						)
						s.pierce -= 1
						if s.pierce <= 0 then
							alive = false
						end
					end
				end
			end
		end
		if not alive then
			shots[i] = shots[#shots]
			shots[#shots] = nil
			if s.kind ~= "flask" then
				K.ev(run, { k = "shot-", id = s.id })
			end
		end
	end
end

function K.updateEnemyShots(run, dt: number)
	local es = run.eshots
	local act = run.act
	local wards = run.wardList
	local shrink = run.hitShrink
	for i = #es, 1, -1 do
		local s = es[i]
		local x0, y0 = s.x, s.y
		s.x += s.vx * dt
		s.y += s.vy * dt
		s.life -= dt
		local alive = s.life > 0
		local removed = false
		if alive then
			local sx, sy = s.x - x0, s.y - y0
			local len2 = sx * sx + sy * sy
			for _, p in act do
				local t = 1 -- end point (web game)
				if SWEPT and len2 > 1e-9 then
					t = math.clamp(((p.x - x0) * sx + (p.y - y0) * sy) / len2, 0, 1)
				end
				local px, py = x0 + sx * t - p.x, y0 + sy * t - p.y
				local rr = s.r + p.r - shrink
				if px * px + py * py < rr * rr then
					K.hurtPlayer(run, p, s.dmg, s.src or "shot")
					alive = false
					removed = true
					break
				end
			end
		end
		if alive and #wards > 0 then
			for _, w in wards do
				local dx, dy = s.x - w.x, s.y - w.y
				if dx * dx + dy * dy < WARD_R2 then
					alive = false
					removed = true
					break
				end
			end
		end
		if not alive then
			es[i] = es[#es]
			es[#es] = nil
			if removed then
				K.ev(run, { k = "eshot-", id = s.id })
			end
		end
	end
end

return Shots
