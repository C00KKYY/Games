-- Part pools for the arena (no Instance creation per frame in steady state, docs/DESIGN.md §3.4). Parts are anchored,
-- non-colliding, non-queryable, without shadows; unused parts wait far below the arena. Roblox keeps Ball parts
-- round (all axes equal), so stretched balls are "Ellipsoid": a Block with a SpecialMesh sphere that follows the size.
local Pool = {}

local FAR = CFrame.new(0, -300, 0) -- under the ground plates, above FallenPartsDestroyHeight (-500)
local folder: Folder? = nil
local free: { [string]: { BasePart } } = { Ball = {}, Block = {}, Cylinder = {}, Wedge = {}, Ellipsoid = {} }
local MESH = "EN_Mesh"
local ellipsoids: { [BasePart]: boolean } = {}

function Pool.folder(): Folder
	if not folder then
		local f = Instance.new("Folder")
		f.Name = "Arena"
		f.Parent = workspace
		folder = f
	end
	return folder :: Folder
end

local function make(shape: string): BasePart
	local p: BasePart
	if shape == "Wedge" then
		p = Instance.new("WedgePart")
	elseif shape == "Ellipsoid" then
		local q = Instance.new("Part")
		q.Shape = Enum.PartType.Block
		local m = Instance.new("SpecialMesh")
		m.Name = MESH
		m.MeshType = Enum.MeshType.Sphere
		m.Parent = q
		ellipsoids[q] = true
		p = q
	else
		local q = Instance.new("Part")
		q.Shape = (Enum.PartType :: any)[shape]
		p = q
	end
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Material = Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.CFrame = FAR
	p.Parent = Pool.folder()
	return p
end

function Pool.prewarm(shape: string, n: number)
	local list = free[shape]
	for _ = 1, n do
		table.insert(list, make(shape))
	end
end

function Pool.get(
	shape: string,
	size: Vector3?,
	color: Color3?,
	material: Enum.Material?,
	transparency: number?
): BasePart
	local list = free[shape]
	local p = table.remove(list) or make(shape)
	if size then
		p.Size = size
	end
	if color then
		p.Color = color
	end
	p.Material = material or Enum.Material.SmoothPlastic
	p.Transparency = transparency or 0
	return p
end

function Pool.put(p: BasePart)
	p.CFrame = FAR
	for _, c in p:GetChildren() do
		if c.Name ~= MESH then
			c:Destroy()
		end
	end
	local shape = if p:IsA("WedgePart") then "Wedge" elseif ellipsoids[p] then "Ellipsoid" else (p :: Part).Shape.Name
	table.insert(free[shape], p)
end

Pool.FAR = FAR
return Pool
