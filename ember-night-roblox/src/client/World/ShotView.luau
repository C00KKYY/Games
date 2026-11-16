--!native
-- Projectiles and weapon visuals (docs/DESIGN.md §3.5, §4.4). Enemy shots are spawned once and moved here
-- (straight lines); player weapons come from `fire` events and are simulated visually (bolts, knives, sickles,
-- flasks, slashes, zaps, novas), orbit balls and auras follow their hero. Placeholder looks for R1.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Weapons = require(Shared.Sim.Data.Weapons)
local Pool = require(script.Parent.Pool)
local Coords = require(script.Parent.Coords)

local ShotView = {}

local S = Coords.S
local ESHOT = Color3.fromHex("#ff3d5a")
local COL = {
	wand = Color3.fromHex("#b48cff"),
	wandEvo = Color3.fromHex("#ff7cf5"),
	knives = Color3.fromHex("#d8f3ff"),
	sickle = Color3.fromHex("#e8e0c8"),
	fire = Color3.fromHex("#ff7a2f"),
	whip = Color3.fromHex("#ffffff"),
	whipEvo = Color3.fromHex("#ff4b6b"),
	lightning = Color3.fromHex("#9fe8ff"),
	nova = Color3.fromHex("#a8e4ff"),
	orbit = Color3.fromHex("#ffe27a"),
	aura = Color3.fromHex("#ff9a3c"),
}

type Shot = { part: BasePart, x: number, y: number, vx: number, vy: number, t: number, life: number }
local eshots: { [number]: Shot } = {}
local pshots: { [number]: any } = {}
local fx: { any } = {}
local orbits: { [number]: any } = {}
local auras: { [number]: any } = {}
local bulkP: { BasePart } = {}
local bulkC: { CFrame } = {}
local heroPos: (number) -> (number?, number?) = function(_)
	return nil, nil
end

function ShotView.setHeroPosition(fn)
	heroPos = fn
end

function ShotView.eshot(e)
	local d = math.max(0.9, e.r * 2 * S)
	local p = Pool.get("Ball", Vector3.one * d, ESHOT, Enum.Material.Neon, 0)
	eshots[e.id] = { part = p, x = e.x, y = e.y, vx = e.vx, vy = e.vy, t = 0, life = e.life }
end

function ShotView.eshotGone(id: number)
	local s = eshots[id]
	if s then
		Pool.put(s.part)
		eshots[id] = nil
	end
end

local function transient(shape, size, color, life, update, tr)
	local p = Pool.get(shape, size, color, Enum.Material.Neon, tr or 0.2)
	table.insert(fx, { part = p, t = 0, life = life, update = update })
	return p
end

function ShotView.fire(e)
	local w = e.weapon
	if w == "wand" or w == "knives" or w == "sickle" then
		local size = if w == "sickle" then 3.4 * e.area elseif w == "wand" then 1.4 * e.area else 1.2 * e.area
		local col = if w == "wand" then (if e.evo then COL.wandEvo else COL.wand) else COL[w]
		local shape = if w == "knives" then "Block" else "Ball"
		local sz = if w == "knives" then Vector3.new(1.6, 0.3, 0.4) else Vector3.one * size
		local p = Pool.get(shape, sz, col, Enum.Material.Neon, 0)
		local vx, vy = math.cos(e.a) * e.speed, math.sin(e.a) * e.speed
		pshots[e.extra] = {
			part = p,
			kind = w,
			x = e.x,
			y = e.y,
			vx = vx,
			vy = vy,
			vx0 = vx,
			vy0 = vy,
			back = false,
			slot = e.slot,
			t = 0,
			life = if w == "sickle" then 3.2 elseif w == "knives" then 0.9 else 3,
			a = e.a,
			speed = e.speed,
		}
	elseif w == "fire" then
		local tx, ty = e.x + math.cos(e.a) * e.speed * 0.45, e.y + math.sin(e.a) * e.speed * 0.45
		local sx, sy = e.x, e.y
		transient("Ball", Vector3.one * 1.2, COL.fire, 0.45, function(p, k)
			local x, y = sx + (tx - sx) * k, sy + (ty - sy) * k
			p.CFrame = Coords.cf(x, y, 1 + math.sin(k * math.pi) * 7)
		end)
	elseif w == "whip" then
		local R = 112 * e.area * S
		local hx, hy = e.x, e.y
		transient(
			"Block",
			Vector3.new(R, 0.2, R * 0.9),
			if e.evo then COL.whipEvo else COL.whip,
			0.22,
			function(p, k)
				local x, y = heroPos(e.slot)
				x = x or hx
				y = y or hy
				p.CFrame = Coords.cf(x, y, 1.2) * Coords.yaw(e.a) * CFrame.new(R * 0.55, 0, 0)
				p.Transparency = 0.3 + 0.7 * k
			end
		)
	elseif w == "lightning" then
		local R = 36 * e.area * S * 2
		local x, y = e.x, e.y
		transient("Cylinder", Vector3.new(0.2, R, R), COL.lightning, 0.25, function(p, k)
			p.CFrame = Coords.cf(x, y, 0.3) * CFrame.Angles(0, 0, math.rad(90))
			p.Transparency = 0.2 + 0.8 * k
		end)
		transient("Block", Vector3.new(0.4, 14, 0.4), COL.lightning, 0.12, function(p, k)
			p.CFrame = Coords.cf(x, y, 7)
			p.Transparency = k
		end)
	elseif w == "nova" then
		local maxD = 150 * e.area * S * 2
		local sx, sy = e.x, e.y
		transient("Cylinder", Vector3.new(0.3, 1, 1), COL.nova, 0.55, function(p, k)
			local x, y = heroPos(e.slot)
			local kk = math.min(1, k / 0.9)
			local d = maxD * (1 - (1 - kk) * (1 - kk))
			p.Size = Vector3.new(0.3, math.max(0.2, d), math.max(0.2, d))
			p.CFrame = Coords.cf(x or sx, y or sy, 0.4) * CFrame.Angles(0, 0, math.rad(90))
			p.Transparency = 0.4 + 0.6 * k
		end)
	end
end

function ShotView.shotGone(id: number)
	local s = pshots[id]
	if s then
		Pool.put(s.part)
		pshots[id] = nil
	end
end

function ShotView.pool(e)
	local d = e.rad * 2 * S
	local x, y = e.x, e.y
	transient("Cylinder", Vector3.new(0.15, d, d), COL.fire, e.life, function(p, k)
		p.CFrame = Coords.cf(x, y, 0.15) * CFrame.Angles(0, 0, math.rad(90))
		p.Transparency = 0.35 + 0.5 * k
	end, 0.35)
end

function ShotView.arc(e)
	local x1, y1, x2, y2 = e.x, e.y, e.x2, e.y2
	local len = math.sqrt((x2 - x1) ^ 2 + (y2 - y1) ^ 2) * S
	transient("Block", Vector3.new(len, 0.25, 0.25), COL.lightning, 0.22, function(p, k)
		local mid = Coords.v3((x1 + x2) / 2, (y1 + y2) / 2, 1.5)
		p.CFrame = CFrame.lookAt(mid, Coords.v3(x2, y2, 1.5)) * CFrame.Angles(0, math.rad(90), 0)
		p.Transparency = k
	end)
end

function ShotView.orbit(e)
	local o = orbits[e.slot]
	if not o then
		o = { parts = {}, ang = 0 }
		orbits[e.slot] = o
	end
	for _, p in o.parts do
		Pool.put(p)
	end
	table.clear(o.parts)
	o.active = e.active
	o.radius = e.radius
	o.speed = e.speed
	o.ang = e.ang
	if e.active then
		for _ = 1, e.amount do
			table.insert(o.parts, Pool.get("Ball", Vector3.one * e.orb * 2 * S, COL.orbit, Enum.Material.Neon, 0))
		end
	end
end

function ShotView.aura(e)
	local a = auras[e.slot]
	if not a then
		a = { part = Pool.get("Cylinder", Vector3.one, COL.aura, Enum.Material.Neon, 0.8) }
		auras[e.slot] = a
	end
	local d = e.rad * 2 * S
	a.part.Size = Vector3.new(0.1, d, d)
end

function ShotView.render(dt: number, now: number)
	local n = 0
	table.clear(bulkP)
	table.clear(bulkC)
	for id, s in eshots do
		s.t += dt
		if s.t >= s.life then
			Pool.put(s.part)
			eshots[id] = nil
		else
			s.x += s.vx * dt
			s.y += s.vy * dt
			n += 1
			bulkP[n] = s.part
			bulkC[n] = CFrame.new(s.x * S, 1.2, s.y * S)
		end
	end
	for id, s in pshots do
		s.t += dt
		if s.kind == "sickle" then
			if not s.back then
				s.vx -= s.vx0 * 1.7 * dt
				s.vy -= s.vy0 * 1.7 * dt
				if s.vx * s.vx0 + s.vy * s.vy0 <= 0 then
					s.back = true
				end
			else
				local hx, hy = heroPos(s.slot)
				if hx then
					local dx, dy = hx - s.x, hy - s.y
					local d = math.max(1, math.sqrt(dx * dx + dy * dy))
					s.ret = math.min(s.speed * 1.4, (s.ret or 60) + 900 * dt)
					s.vx, s.vy = dx / d * s.ret, dy / d * s.ret
					if d < 20 then
						s.t = 1e9
					end
				end
			end
		end
		s.x += s.vx * dt
		s.y += s.vy * dt
		if s.t > s.life then
			Pool.put(s.part)
			pshots[id] = nil
		else
			n += 1
			bulkP[n] = s.part
			local spin = if s.kind == "sickle" then CFrame.Angles(0, now * 14, 0) else Coords.yaw(math.atan2(s.vy, s.vx))
			bulkC[n] = CFrame.new(s.x * S, 1.4, s.y * S) * spin
		end
	end
	for slot, o in orbits do
		if o.active and #o.parts > 0 then
			o.ang += dt * o.speed
			local hx, hy = heroPos(slot)
			if hx then
				for i, p in o.parts do
					local a = o.ang + (i - 1) / #o.parts * math.pi * 2
					n += 1
					bulkP[n] = p
					bulkC[n] = CFrame.new((hx + math.cos(a) * o.radius) * S, 1.4, (hy + math.sin(a) * o.radius) * S)
				end
			end
		end
	end
	for slot, a in auras do
		local hx, hy = heroPos(slot)
		if hx then
			n += 1
			bulkP[n] = a.part
			bulkC[n] = CFrame.new(hx * S, 0.1, hy * S) * CFrame.Angles(0, 0, math.rad(90))
		end
	end
	if n > 0 then
		workspace:BulkMoveTo(bulkP, bulkC, Enum.BulkMoveMode.FireCFrameChanged)
	end
	for i = #fx, 1, -1 do
		local f = fx[i]
		f.t += dt
		if f.t >= f.life then
			Pool.put(f.part)
			table.remove(fx, i)
		else
			f.update(f.part, f.t / f.life)
		end
	end
end

function ShotView.clear()
	for id, s in eshots do
		Pool.put(s.part)
		eshots[id] = nil
	end
	for id, s in pshots do
		Pool.put(s.part)
		pshots[id] = nil
	end
	for _, f in fx do
		Pool.put(f.part)
	end
	table.clear(fx)
	for slot, o in orbits do
		for _, p in o.parts do
			Pool.put(p)
		end
		orbits[slot] = nil
	end
	for slot, a in auras do
		Pool.put(a.part)
		auras[slot] = nil
	end
end

ShotView.WEAPONS = Weapons
return ShotView
