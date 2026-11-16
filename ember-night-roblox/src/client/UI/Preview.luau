-- 3D previews in the hub (docs/DESIGN.md §5.1): a ViewportFrame with a WorldModel holding a standalone copy of the
-- hero model (ModelKit.heroPreview) and its own camera; used by the hero cards and the cosmetics screen.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Cosmetics = require(Shared.Config.Cosmetics)
local ModelKit = require(script.Parent.Parent.World.ModelKit)

local Preview = {}

local function color(hex: string?): Color3?
	local r, g, b = Cosmetics.parseHex(hex)
	return if r then Color3.new(r, g :: number, b :: number) else nil
end

-- a hero preview; skinId = an equipped/previewed skin cosmetic (nil = hero colours)
function Preview.hero(parent: Instance, heroId: string, skinId: string?, props: { [string]: any }?): ViewportFrame
	local vf = Instance.new("ViewportFrame")
	vf.BackgroundTransparency = 1
	vf.Size = UDim2.fromOffset(80, 80)
	vf.Ambient = Color3.fromRGB(170, 160, 190)
	vf.LightColor = Color3.fromRGB(255, 236, 214)
	vf.LightDirection = Vector3.new(-1, -1.4, -0.6)
	local skin = skinId and Cosmetics.byId[skinId]
	local pal: ModelKit.Palette = {
		body = (skin and color(skin.body)) or ModelKit.heroColor(heroId),
		accent = skin and color(skin.accent) or nil,
	}
	local wm = Instance.new("WorldModel")
	ModelKit.heroPreview(heroId, 1, pal, wm)
	wm.Parent = vf
	local cam = Instance.new("Camera")
	cam.FieldOfView = 32
	cam.CFrame = CFrame.lookAt(Vector3.new(5.2, 3.4, 4.2), Vector3.new(0, 1.65, 0))
	cam.Parent = vf
	vf.CurrentCamera = cam
	for k, v in props or {} do
		(vf :: any)[k] = v
	end
	vf.Parent = parent
	return vf
end

return Preview
