-- Telegraphs (docs/DESIGN.md §4.4), the most important visuals: flat red (#ff3d5a) neon shapes just above the
-- ground with a darker outline and a fill that grows with the wind-up (same timing as the sim): circles (outline
-- disk + growing fill), lanes and dash lines (outline + fill growing along the lane), aim lines (thin, pulsing once
-- locked), fan wedges (rays growing outwards) and charge rings (exit points pulsing). They follow their enemy
-- (rendered position) and update their aim from tele~ events. On touch screens the outlines are stronger.
local Pool = require(script.Parent.Pool)
local Coords = require(script.Parent.Coords)
local EnemyView = require(script.Parent.EnemyView)
local Device = require(script.Parent.Parent.Device)

local TeleView = {}

local S = Coords.S
local RED = Color3.fromHex("#ff3d5a")
local HOT = Color3.fromHex("#ffb0bc")
local DARK = Color3.fromRGB(40, 8, 16)
local FLAT = CFrame.Angles(0, 0, math.rad(90))
local H = 0.12

type Tele = { e: any, parts: { BasePart }, fill: BasePart?, edge: BasePart?, t0: number }
local live: { [number]: Tele } = {}
local outlineTr = 0.55

local function flat(shape: string, size: Vector3, tr: number, color: Color3?, neon: boolean?): BasePart
	return Pool.get(
		shape,
		size,
		color or RED,
		if neon == false then Enum.Material.SmoothPlastic else Enum.Material.Neon,
		tr
	)
end

function TeleView.add(e, now: number)
	outlineTr = if Device.touch() then 0.4 else 0.55
	local tl: Tele = { e = e, parts = {}, fill = nil, edge = nil, t0 = now }
	local k = e.kind
	if k == "circle" then
		local d = e.rad * 2 * S
		-- dark base, red edge disk slightly larger, growing fill
		tl.edge = flat("Cylinder", Vector3.new(0.04, d + 0.5, d + 0.5), outlineTr, RED)
		table.insert(tl.parts, flat("Cylinder", Vector3.new(0.05, d, d), 0.45, DARK, false))
		tl.fill = flat("Cylinder", Vector3.new(0.07, 0.1, 0.1), 0.35)
	elseif k == "lane" or k == "line" then
		local w = math.max(0.6, e.w * S)
		tl.edge = flat("Block", Vector3.new(e.len * S + 0.4, 0.04, w + 0.4), outlineTr, RED)
		table.insert(tl.parts, flat("Block", Vector3.new(e.len * S, 0.05, w), 0.5, DARK, false))
		tl.fill = flat("Block", Vector3.new(0.1, 0.07, w), 0.35)
	elseif k == "aim" then
		table.insert(tl.parts, flat("Block", Vector3.new(e.len * S, 0.05, math.max(0.3, e.hr * S)), 0.5))
	elseif k == "wedge" then
		for _ = 1, math.max(1, e.n) do
			table.insert(tl.parts, flat("Block", Vector3.new(e.wedge * S, 0.05, 0.35), 0.45))
		end
	else -- ring: exit points
		for _ = 1, math.max(1, e.n * e.rings) do
			table.insert(tl.parts, flat("Ball", Vector3.one * 0.8, 0.2))
		end
	end
	live[e.id] = tl
end

function TeleView.update(id: number, a: number, x: number, y: number)
	local tl = live[id]
	if tl then
		tl.e.a = a
		if tl.e.follow == 0 then
			tl.e.x, tl.e.y = x, y
		end
	end
end

function TeleView.remove(id: number)
	local tl = live[id]
	if tl then
		for _, p in tl.parts do
			Pool.put(p)
		end
		if tl.fill then
			Pool.put(tl.fill)
		end
		if tl.edge then
			Pool.put(tl.edge)
		end
		live[id] = nil
	end
end

function TeleView.count(): number
	local n = 0
	for _ in live do
		n += 1
	end
	return n
end

function TeleView.render(now: number)
	for id, tl in live do
		local e = tl.e
		local age = now - tl.t0
		if age > e.life + 3 then
			TeleView.remove(id)
			continue
		end
		local x, y = e.x, e.y
		if e.follow ~= 0 then
			local fx, fy = EnemyView.position(e.follow)
			if fx then
				x, y = fx, fy
			end
		end
		local prog = math.clamp(age / math.max(e.life, 0.05), 0, 1)
		-- the last fifth flashes brighter so the moment of impact reads
		local hot = prog > 0.8 and math.floor(now * 16) % 2 == 0
		local k = e.kind
		if k == "circle" then
			local base = Coords.cf(x, y, H) * FLAT
			tl.parts[1].CFrame = base;
			(tl.edge :: BasePart).CFrame = base * CFrame.new(-0.02, 0, 0)
			local d = e.rad * 2 * S * prog
			local fill = tl.fill :: BasePart
			fill.Size = Vector3.new(0.07, math.max(0.1, d), math.max(0.1, d))
			fill.CFrame = base * CFrame.new(0.02, 0, 0)
			fill.Color = if hot then HOT else RED
		elseif k == "lane" or k == "line" then
			local len = e.len * S
			local base = Coords.cf(x, y, H) * Coords.yaw(e.a)
			tl.parts[1].CFrame = base * CFrame.new(len / 2, 0, 0);
			(tl.edge :: BasePart).CFrame = base * CFrame.new(len / 2, -0.02, 0)
			local fl = math.max(0.1, len * prog)
			local fill = tl.fill :: BasePart
			fill.Size = Vector3.new(fl, 0.07, fill.Size.Z)
			fill.CFrame = base * CFrame.new(fl / 2, 0.02, 0)
			fill.Color = if hot then HOT else RED
		elseif k == "aim" then
			local len = e.len * S
			local locked = age >= (e.lockAt or 0)
			tl.parts[1].CFrame = Coords.cf(x, y, H) * Coords.yaw(e.a) * CFrame.new(len / 2, 0, 0)
			tl.parts[1].Transparency = if locked then 0.15 + 0.25 * (0.5 + 0.5 * math.sin(now * 40)) else 0.6
		elseif k == "wedge" then
			local n = #tl.parts
			local len = e.wedge * S
			for i, p in tl.parts do
				local o = if n > 1 then ((i - 1) / (n - 1) - 0.5) * e.spread else 0
				p.CFrame = Coords.cf(x, y, H) * Coords.yaw(e.a + o) * CFrame.new(e.sr * S + len / 2, 0, 0)
				p.Transparency = 0.7 - 0.45 * prog
			end
		else
			local n = math.max(1, e.n)
			local adds = { 0, 0.5, 0.25 }
			local i = 0
			for ring = 1, e.rings do
				for j = 0, n - 1 do
					i += 1
					local p = tl.parts[i]
					if p then
						local a = e.off + (j + adds[ring]) * (math.pi * 2 / n)
						p.CFrame = Coords.cf(x + math.cos(a) * e.sr, y + math.sin(a) * e.sr, 1)
						p.Transparency = 0.6 - 0.5 * prog
					end
				end
			end
		end
	end
end

function TeleView.clear()
	for id in live do
		TeleView.remove(id)
	end
end

return TeleView
