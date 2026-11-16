-- Endless ground per land (docs/DESIGN.md §4.2): 3 x 3 tiles of 256 studs re-centred on the camera target, a few
-- deterministic speckles per tile, braziers at the positions the sim uses (Props.position), broken ones hidden.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Props = require(Shared.Sim.Props)
local Util = require(Shared.Sim.Util)
local Pool = require(script.Parent.Pool)
local Coords = require(script.Parent.Coords)

local Ground = {}

local TILE = 256
local tiles: { BasePart } = {}
local speckles: { BasePart } = {}
local center = Vector2.new(1e9, 1e9)
local stage: any = nil
local braziers: { [number]: BasePart } = {}
local broken: { [number]: boolean } = {}
local SPECKLES_PER_TILE = 24

function Ground.setStage(s)
	stage = s
	Ground.clear()
	local base = Coords.color(s.ground.base)
	for i = 1, 9 do
		local p = Pool.get("Block", Vector3.new(TILE, 1, TILE), base, Enum.Material.SmoothPlastic, 0)
		tiles[i] = p
	end
	for _ = 1, 9 * SPECKLES_PER_TILE do
		table.insert(speckles, Pool.get("Block", Vector3.new(3, 0.2, 3), base, Enum.Material.SmoothPlastic, 0))
	end
	center = Vector2.new(1e9, 1e9)
end

function Ground.breakProp(cx: number, cy: number)
	local key = Props.key(cx, cy)
	broken[key] = true
	local p = braziers[key]
	if p then
		Pool.put(p)
		braziers[key] = nil
	end
end

local function layout(tx: number, ty: number)
	local i = 0
	local cols = stage.ground.speckle
	for gx = -1, 1 do
		for gy = -1, 1 do
			i += 1
			local x, y = (tx + gx) * TILE, (ty + gy) * TILE
			tiles[i].CFrame = CFrame.new(x, -0.5, y)
			for k = 1, SPECKLES_PER_TILE do
				local sp = speckles[(i - 1) * SPECKLES_PER_TILE + k]
				local h1 = Util.hash2(tx + gx, ty + gy, k)
				local h2 = Util.hash2(tx + gx, ty + gy, k + 100)
				local h3 = Util.hash2(tx + gx, ty + gy, k + 200)
				local size = 2 + h3 * 4
				sp.Size = Vector3.new(size, 0.1, size * (0.6 + h1 * 0.6))
				sp.Color = Coords.color(cols[math.floor(h3 * #cols) + 1])
				sp.CFrame = CFrame.new(x + (h1 - 0.5) * TILE, 0.02, y + (h2 - 0.5) * TILE) * CFrame.Angles(0, h3 * 6, 0)
			end
		end
	end
end

local function updateBraziers(x: number, y: number)
	local C = Props.CHUNK
	local cx0, cx1 = math.floor((x - 1100) / C), math.floor((x + 1100) / C)
	local cy0, cy1 = math.floor((y - 800) / C), math.floor((y + 800) / C)
	local want = {}
	for cx = cx0, cx1 do
		for cy = cy0, cy1 do
			local key = Props.key(cx, cy)
			if not broken[key] then
				local px, py = Props.position(cx, cy)
				if px then
					want[key] = true
					if not braziers[key] then
						local p = Pool.get(
							"Cylinder",
							Vector3.new(1.6, 2.8, 2.8),
							Color3.fromRGB(255, 150, 60),
							Enum.Material.Neon,
							0
						)
						p.CFrame = Coords.cf(px, py, 0.8) * CFrame.Angles(0, 0, math.rad(90))
						local l = Instance.new("PointLight")
						l.Range = 8
						l.Brightness = 1.2
						l.Color = Color3.fromRGB(255, 160, 70)
						l.Parent = p
						braziers[key] = p
					end
				end
			end
		end
	end
	for key, p in braziers do
		if not want[key] then
			Pool.put(p)
			braziers[key] = nil
		end
	end
end

-- x, y in sim px (the camera target)
function Ground.update(x: number, y: number)
	if not stage then
		return
	end
	local sx, sy = x * Coords.S, y * Coords.S
	local tx, ty = math.floor(sx / TILE + 0.5), math.floor(sy / TILE + 0.5)
	if tx ~= center.X or ty ~= center.Y then
		center = Vector2.new(tx, ty)
		layout(tx, ty)
		updateBraziers(x, y)
	elseif math.random() < 0.05 then
		updateBraziers(x, y)
	end
end

function Ground.clear()
	for _, p in tiles do
		Pool.put(p)
	end
	for _, p in speckles do
		Pool.put(p)
	end
	for key, p in braziers do
		Pool.put(p)
		braziers[key] = nil
	end
	table.clear(tiles)
	table.clear(speckles)
	table.clear(broken)
end

return Ground
