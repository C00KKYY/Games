-- Telegraphs (docs/DESIGN.md §4.4): flat red neon shapes 0.1 stud above the ground with a growing fill; they follow
-- their enemy (rendered position) and update their aim from tele~ events.
local Pool = require(script.Parent.Pool)
local Coords = require(script.Parent.Coords)
local EnemyView = require(script.Parent.EnemyView)

local TeleView = {}

local S = Coords.S
local RED = Color3.fromHex("#ff3d5a")
local DARK = Color3.fromRGB(40, 8, 16)
local H = 0.1

type Tele = { e: any, parts: { BasePart }, fill: BasePart?, t0: number }
local live: { [number]: Tele } = {}

local function flat(shape: string, size: Vector3, tr: number, color: Color3?): BasePart
	return Pool.get(shape, size, color or RED, Enum.Material.Neon, tr)
end

function TeleView.add(e, now: number)
	local tl: Tele = { e = e, parts = {}, fill = nil, t0 = now }
	local k = e.kind
	if k == "circle" then
		local d = e.rad * 2 * S
		table.insert(tl.parts, flat("Cylinder", Vector3.new(0.05, d, d), 0.65, DARK))
		tl.fill = flat("Cylinder", Vector3.new(0.08, 0.1, 0.1), 0.45)
	elseif k == "lane" or k == "line" then
		table.insert(tl.parts, flat("Block", Vector3.new(e.len * S, 0.05, e.w * S), 0.6))
	elseif k == "aim" then
		table.insert(tl.parts, flat("Block", Vector3.new(e.len * S, 0.05, math.max(0.25, e.hr * S)), 0.5))
	elseif k == "wedge" then
		for _ = 1, math.max(1, e.n) do
			table.insert(tl.parts, flat("Block", Vector3.new(e.wedge * S, 0.05, 0.3), 0.45))
		end
	else -- ring: exit points
		for _ = 1, math.max(1, e.n * e.rings) do
			table.insert(tl.parts, flat("Ball", Vector3.one * 0.7, 0.2))
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
		live[id] = nil
	end
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
		local k = e.kind
		if k == "circle" then
			local base = Coords.cf(x, y, H) * CFrame.Angles(0, 0, math.rad(90))
			tl.parts[1].CFrame = base
			local d = e.rad * 2 * S * prog
			tl.fill.Size = Vector3.new(0.08, math.max(0.1, d), math.max(0.1, d))
			tl.fill.CFrame = base * CFrame.new(0.02, 0, 0)
		elseif k == "lane" or k == "line" then
			local len = e.len * S
			tl.parts[1].CFrame = Coords.cf(x, y, H) * Coords.yaw(e.a) * CFrame.new(len / 2, 0, 0)
			tl.parts[1].Transparency = 0.75 - 0.35 * prog
		elseif k == "aim" then
			local len = e.len * S
			local locked = age >= (e.lockAt or 0)
			tl.parts[1].CFrame = Coords.cf(x, y, H) * Coords.yaw(e.a) * CFrame.new(len / 2, 0, 0)
			tl.parts[1].Transparency = if locked then 0.2 + 0.2 * math.sin(now * 40) else 0.6
		elseif k == "wedge" then
			local n = #tl.parts
			for i, p in tl.parts do
				local o = if n > 1 then ((i - 1) / (n - 1) - 0.5) * e.spread else 0
				local len = e.wedge * S
				p.CFrame = Coords.cf(x, y, H) * Coords.yaw(e.a + o) * CFrame.new(e.sr * S + len / 2, 0, 0)
				p.Transparency = 0.7 - 0.4 * prog
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
