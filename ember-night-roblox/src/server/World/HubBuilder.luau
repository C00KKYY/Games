-- The hub (docs/DESIGN.md §2.2), built in code far above the arena: a round stone plaza with a campfire and the
-- spawn point. Players walk around with their own avatars. R1: simple version.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Tuning = require(ReplicatedStorage:WaitForChild("Shared").Config.Tuning)

local HubBuilder = {}

local function part(props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in props do
		(p :: any)[k] = v
	end
	return p
end

function HubBuilder.build(): Model
	local o = Tuning.HUB_ORIGIN
	local origin = Vector3.new(o[1], o[2], o[3])
	local hub = Instance.new("Model")
	hub.Name = "Hub"

	local plaza = part({
		Name = "Plaza",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(2, 120, 120),
		CFrame = CFrame.new(origin) * CFrame.Angles(0, 0, math.rad(90)),
		Color = Color3.fromRGB(58, 52, 70),
		Material = Enum.Material.Slate,
	})
	plaza.Parent = hub

	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "HubSpawn"
	spawn.Anchored = true
	spawn.Size = Vector3.new(6, 1, 6)
	spawn.CFrame = CFrame.new(origin + Vector3.new(0, 1.5, 22))
	spawn.Color = Color3.fromRGB(90, 70, 110)
	spawn.Material = Enum.Material.SmoothPlastic
	spawn.Duration = 0
	spawn.Neutral = true
	spawn.Parent = hub

	-- campfire: logs + neon embers + light
	for i = 0, 3 do
		local log = part({
			Name = "Log",
			Size = Vector3.new(6, 1, 1),
			CFrame = CFrame.new(origin + Vector3.new(0, 1.5, 0)) * CFrame.Angles(0, i * math.pi / 4, 0),
			Color = Color3.fromRGB(80, 50, 30),
			Material = Enum.Material.Wood,
			CanCollide = false,
		})
		log.Parent = hub
	end
	local ember = part({
		Name = "Ember",
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(3, 3, 3),
		CFrame = CFrame.new(origin + Vector3.new(0, 2.6, 0)),
		Color = Color3.fromRGB(255, 140, 50),
		Material = Enum.Material.Neon,
		CanCollide = false,
	})
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(255, 160, 80)
	light.Range = 40
	light.Brightness = 2
	light.Parent = ember
	local fire = Instance.new("Fire")
	fire.Heat = 6
	fire.Size = 5
	fire.Parent = ember
	ember.Parent = hub

	-- low wall so nobody falls off
	local n = 24
	for i = 0, n - 1 do
		local a = i / n * math.pi * 2
		local wall = part({
			Name = "Wall",
			Size = Vector3.new(16, 4, 2),
			CFrame = CFrame.new(origin + Vector3.new(math.cos(a) * 59, 2, math.sin(a) * 59))
				* CFrame.Angles(0, -a + math.pi / 2, 0),
			Color = Color3.fromRGB(46, 40, 58),
			Material = Enum.Material.Slate,
		})
		wall.Parent = hub
	end

	hub.Parent = workspace
	return hub
end

return HubBuilder
