-- Endless ground per land (docs/DESIGN.md §4.2): one plate re-centred on the camera target, world-anchored detail
-- grids (speckles and grass tufts every 8 studs, large soft patches every 32 studs, all by Util.hash2); decor models per 150 px chunk exactly where the web game draws
-- them (20 % of the chunks, kind/position by Util.hash2, land decorTint); braziers at the positions the sim uses
-- (Props.position) with an ember light on the nearest ones, broken ones hidden. Everything is pooled.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Props = require(Shared.Sim.Props)
local Util = require(Shared.Sim.Util)
local Pool = require(script.Parent.Pool)
local Coords = require(script.Parent.Coords)
local ModelKit = require(script.Parent.ModelKit)

local Ground = {}

local PLATE = 1024 -- one ground plate, re-centred every SNAP studs
local SNAP = 256
local DECOR_CHUNK = 150 -- px (web drawDecor C)
local DECOR_MAX = 120
local BRAZIER_LIGHTS = 4
-- the view: wider at the far (top) edge because of the camera pitch
local VX, VUP, VDOWN = 1050, 1050, 700

-- detail grids (studs): world-anchored cells mapped onto a fixed ring of pooled parts, so a camera move only
-- re-places the cells that scrolled in. Fine grid: speckles and grass tufts; coarse grid: large soft patches.
type Grid = {
	cell: number,
	nx: number,
	ny: number,
	slots: { { key: number, parts: { BasePart } } },
	place: (g: any, slot: any, cx: number, cy: number) -> (),
}
local fine: Grid? = nil
local coarse: Grid? = nil
local plate: BasePart? = nil
local plateAt = Vector2.new(1e9, 1e9)
local stage: any = nil
local braziers: { [number]: { rig: ModelKit.Rig, light: PointLight?, x: number, y: number } } = {}
local broken: { [number]: boolean } = {}
local decor: { [number]: ModelKit.Rig } = {}
local decorCount = 0
local lastChunk = Vector2.new(1e9, 1e9)
local hash2 = Util.hash2
local FAR = Pool.FAR
local FLAT = CFrame.Angles(0, 0, math.rad(90))

local BRAZIER: ModelKit.Spec = {
	parts = {
		{
			shape = "Cylinder",
			size = Vector3.new(1.4, 0.25, 0.25),
			pos = Vector3.new(0.5, 0.7, 0),
			rot = Vector3.new(0, 0, 70),
			role = "dark",
		},
		{
			shape = "Cylinder",
			size = Vector3.new(1.4, 0.25, 0.25),
			pos = Vector3.new(-0.5, 0.7, 0),
			rot = Vector3.new(0, 0, 110),
			role = "dark",
		},
		{
			shape = "Cylinder",
			size = Vector3.new(0.7, 2.0, 2.0),
			pos = Vector3.new(0, 1.45, 0),
			rot = Vector3.new(0, 0, 90),
			role = "body",
		},
		{
			shape = "Ball",
			size = Vector3.new(1.6, 0.8, 1.6),
			pos = Vector3.new(0, 1.85, 0),
			role = "glow",
			mat = Enum.Material.Neon,
		},
	},
}

local function newGrid(cell: number, nx: number, ny: number, perSlot: { { string } }, place): Grid
	local g: Grid = { cell = cell, nx = nx, ny = ny, slots = {}, place = place }
	for i = 1, nx * ny do
		local parts = {}
		for _, sh in perSlot do
			table.insert(parts, Pool.get(sh[1], Vector3.one, nil, Enum.Material.SmoothPlastic, 0))
		end
		g.slots[i] = { key = -1, parts = parts }
	end
	return g
end

local function updateGrid(g: Grid, sx: number, sy: number)
	local c = g.cell
	local cx0 = math.floor(sx / c) - math.floor(g.nx / 2)
	local cy0 = math.floor(sy / c) - math.floor(g.ny * 0.55)
	for cx = cx0, cx0 + g.nx - 1 do
		for cy = cy0, cy0 + g.ny - 1 do
			local i = (cx % g.nx) * g.ny + (cy % g.ny) + 1
			local slot = g.slots[i]
			local key = Props.key(cx, cy)
			if slot.key ~= key then
				slot.key = key
				g.place(g, slot, cx, cy)
			end
		end
	end
end

local function placeFine(g: Grid, slot, cx: number, cy: number)
	local sp, tuft = slot.parts[1], slot.parts[2]
	local c = g.cell
	local h1, h2, h3, h4 = hash2(cx, cy, 21), hash2(cx, cy, 22), hash2(cx, cy, 23), hash2(cx, cy, 24)
	if h1 < 0.4 then
		local cols = stage.ground.speckle
		local size = 0.9 + h2 * 2.4
		sp.Size = Vector3.new(0.05 + h4 * 0.03, size, size * (0.7 + h2 * 0.5))
		sp.Color = Coords.color(stage.ground.base):Lerp(Coords.color(cols[math.floor(h3 * #cols) + 1]), 0.5)
		sp.CFrame = CFrame.new((cx + h2) * c, 0.02 + h4 * 0.02, (cy + h3) * c) * CFrame.Angles(0, h1 * 9, 0) * FLAT
	else
		sp.CFrame = FAR
	end
	if h4 < 0.3 then
		tuft.Size = Vector3.new(0.22, 0.7 + h1 * 0.6, 0.5 + h2 * 0.5)
		tuft.CFrame = CFrame.new((cx + h3) * c, 0.3, (cy + h1) * c) * CFrame.Angles(0, h2 * 6.28, (h4 - 0.2) * 0.8)
	else
		tuft.CFrame = FAR
	end
end

local function placeCoarse(g: Grid, slot, cx: number, cy: number)
	local p = slot.parts[1]
	local c = g.cell
	local h1, h2, h3 = hash2(cx, cy, 31), hash2(cx, cy, 32), hash2(cx, cy, 33)
	if h1 < 0.55 then
		local cols = stage.ground.speckle
		local base = Coords.color(stage.ground.base)
		local size = 12 + h3 * 18
		p.Size = Vector3.new(0.04, size, size * (0.6 + h2 * 0.5))
		p.Color = base:Lerp(Coords.color(cols[math.floor(h2 * #cols) + 1]), 0.28)
		p.CFrame = CFrame.new((cx + h2) * c, 0.01, (cy + h3) * c) * CFrame.Angles(0, h1 * 7, 0) * FLAT
	else
		p.CFrame = FAR
	end
end

function Ground.setStage(s)
	Ground.clear()
	stage = s
	local base = Coords.color(s.ground.base)
	plate = Pool.get("Block", Vector3.new(PLATE, 1, PLATE), base, Enum.Material.SmoothPlastic, 0)
	plateAt = Vector2.new(1e9, 1e9)
	coarse = newGrid(32, 8, 7, { { "Cylinder" } }, placeCoarse)
	fine = newGrid(8, 22, 20, { { "Cylinder" }, { "Block" } }, placeFine)
	for _, slot in (fine :: Grid).slots do
		slot.parts[2].Color = Coords.color(s.ground.grass)
	end
	lastChunk = Vector2.new(1e9, 1e9)
end

function Ground.breakProp(cx: number, cy: number)
	local key = Props.key(cx, cy)
	broken[key] = true
	local b = braziers[key]
	if b then
		ModelKit.release(b.rig)
		braziers[key] = nil
	end
end

-- decor per chunk like the web game's drawDecor: 20 % of the chunks, kind and position by hash
local function updateDecor(x: number, y: number)
	local C = DECOR_CHUNK
	local cx0, cx1 = math.floor((x - VX) / C), math.floor((x + VX) / C)
	local cy0, cy1 = math.floor((y - VUP) / C), math.floor((y + VDOWN) / C)
	local want = {}
	local kinds = stage.decor or {}
	if #kinds == 0 then
		return
	end
	for cx = cx0, cx1 do
		for cy = cy0, cy1 do
			if hash2(cx, cy, 3) <= 0.2 then
				local key = Props.key(cx, cy)
				want[key] = true
				if not decor[key] and decorCount < DECOR_MAX then
					local kind = kinds[math.floor(hash2(cx, cy, 4) * #kinds) + 1]
					local scale = 1.1 + hash2(cx, cy, 10) * 0.6
					local rig = ModelKit.decor(kind, scale, stage.decorTint)
					local px = (cx + 0.1 + hash2(cx, cy, 5) * 0.8) * C
					local py = (cy + 0.1 + hash2(cx, cy, 6) * 0.8) * C
					local base = Coords.cf(px, py) * CFrame.Angles(0, (hash2(cx, cy, 11) - 0.5) * 1.2, 0)
					for j, part in rig.parts do
						part.CFrame = base * rig.offs[j]
					end
					decor[key] = rig
					decorCount += 1
				end
			end
		end
	end
	for key, rig in decor do
		if not want[key] then
			ModelKit.release(rig)
			decor[key] = nil
			decorCount -= 1
		end
	end
end

local function updateBraziers(x: number, y: number)
	local C = Props.CHUNK
	local cx0, cx1 = math.floor((x - 1100) / C), math.floor((x + 1100) / C)
	local cy0, cy1 = math.floor((y - 1100) / C), math.floor((y + 800) / C)
	local want = {}
	for cx = cx0, cx1 do
		for cy = cy0, cy1 do
			local key = Props.key(cx, cy)
			if not broken[key] then
				local px, py = Props.position(cx, cy)
				if px then
					want[key] = true
					if not braziers[key] then
						local rig = ModelKit.build(
							BRAZIER,
							1,
							{ body = Color3.fromRGB(70, 66, 76), glow = Color3.fromRGB(255, 150, 60) }
						)
						local base = Coords.cf(px, py)
						for j, part in rig.parts do
							part.CFrame = base * rig.offs[j]
						end
						braziers[key] = { rig = rig, light = nil, x = px, y = py }
					end
				end
			end
		end
	end
	for key, b in braziers do
		if not want[key] then
			ModelKit.release(b.rig)
			braziers[key] = nil
		end
	end
	-- ember lights on the nearest braziers only (light budget, docs/DESIGN.md §4.4)
	local list = {}
	for _, b in braziers do
		table.insert(list, b)
	end
	table.sort(list, function(a, b)
		return (a.x - x) ^ 2 + (a.y - y) ^ 2 < (b.x - x) ^ 2 + (b.y - y) ^ 2
	end)
	for i, b in list do
		local on = i <= BRAZIER_LIGHTS
		if on and not b.light then
			local l = Instance.new("PointLight")
			l.Range = 12
			l.Brightness = 1.3
			l.Color = Color3.fromRGB(255, 160, 70)
			l.Shadows = false
			l.Parent = b.rig.parts[4]
			b.light = l
		elseif not on and b.light then
			(b.light :: PointLight):Destroy()
			b.light = nil
		end
	end
end

-- x, y in sim px (the camera target)
function Ground.update(x: number, y: number)
	if not stage then
		return
	end
	local sx, sy = x * Coords.S, y * Coords.S
	local px, py = math.floor(sx / SNAP + 0.5) * SNAP, math.floor(sy / SNAP + 0.5) * SNAP
	if px ~= plateAt.X or py ~= plateAt.Y then
		plateAt = Vector2.new(px, py);
		(plate :: BasePart).CFrame = CFrame.new(px, -0.5, py)
	end
	updateGrid(fine :: Grid, sx, sy)
	updateGrid(coarse :: Grid, sx, sy)
	local cx, cy = math.floor(x / DECOR_CHUNK), math.floor(y / DECOR_CHUNK)
	if cx ~= lastChunk.X or cy ~= lastChunk.Y then
		lastChunk = Vector2.new(cx, cy)
		updateDecor(x, y)
		updateBraziers(x, y)
	end
end

local function freeGrid(g: Grid?)
	if g then
		for _, slot in g.slots do
			for _, p in slot.parts do
				Pool.put(p)
			end
		end
	end
end

function Ground.clear()
	if plate then
		Pool.put(plate)
		plate = nil
	end
	freeGrid(fine)
	freeGrid(coarse)
	fine, coarse = nil, nil
	for key, b in braziers do
		ModelKit.release(b.rig)
		braziers[key] = nil
	end
	for key, rig in decor do
		ModelKit.release(rig)
		decor[key] = nil
	end
	decorCount = 0
	table.clear(broken)
	stage = nil
end

return Ground
