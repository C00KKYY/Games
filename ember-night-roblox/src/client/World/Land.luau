-- Per-land lighting and atmosphere (docs/DESIGN.md §4.2): night (ClockTime 0), ambient light and an Atmosphere
-- tinted from the land's ground colours and mood, a soft ColorCorrection tint, Bloom so Neon parts glow, and one
-- area ParticleEmitter above the camera target for the land's weather (grave mist, falling ash, snow, dust, star
-- motes). The hub's lighting is restored when the run ends. "Reduced effects" turns the weather off.
local Lighting = game:GetService("Lighting")
local Pool = require(script.Parent.Pool)
local Coords = require(script.Parent.Coords)

local Land = {}

-- mood per land: ambient tint, atmosphere colour/decay, colour correction, weather particles
local MOOD = {
	graveyard = {
		ambient = "#5c8a86",
		atmo = "#7fa8a0",
		decay = "#1c2a2e",
		tint = "#e6fff6",
		density = 0.3,
		weather = { color = "#b8e8d8", size = 2.4, rate = 10, speed = 1.5, life = 6, alpha = 0.85, up = false },
	},
	ashwood = {
		ambient = "#9a6a58",
		atmo = "#c08060",
		decay = "#3a1a10",
		tint = "#fff0e0",
		density = 0.32,
		weather = {
			color = "#ff8a3c",
			size = 0.25,
			rate = 26,
			speed = 3,
			life = 5,
			alpha = 0.1,
			up = true,
			neon = true,
		},
	},
	frostlake = {
		ambient = "#7090c0",
		atmo = "#a8c8f0",
		decay = "#1a2a48",
		tint = "#eef6ff",
		density = 0.28,
		weather = { color = "#ffffff", size = 0.3, rate = 40, speed = 5, life = 5, alpha = 0.15, up = false },
	},
	ruins = {
		ambient = "#8a8068",
		atmo = "#b0a080",
		decay = "#2e2818",
		tint = "#fff8e6",
		density = 0.3,
		weather = { color = "#e8d8b0", size = 0.22, rate = 18, speed = 1.2, life = 6, alpha = 0.35, up = true },
	},
	nightheart = {
		ambient = "#6e5cb0",
		atmo = "#8a70d8",
		decay = "#160e30",
		tint = "#f2ecff",
		density = 0.34,
		weather = {
			color = "#b8a8ff",
			size = 0.3,
			rate = 22,
			speed = 1.8,
			life = 5,
			alpha = 0.1,
			up = true,
			neon = true,
		},
	},
}
Land.MOOD = MOOD

local saved: { [string]: any }? = nil
local atmo: Atmosphere? = nil
local cc: ColorCorrectionEffect? = nil
local bloom: BloomEffect? = nil
local emitterPart: BasePart? = nil
local emitter: ParticleEmitter? = nil
local lowFx = false

local function save()
	if saved then
		return
	end
	saved = {
		ClockTime = Lighting.ClockTime,
		Ambient = Lighting.Ambient,
		OutdoorAmbient = Lighting.OutdoorAmbient,
		Brightness = Lighting.Brightness,
		EnvironmentDiffuseScale = Lighting.EnvironmentDiffuseScale,
		EnvironmentSpecularScale = Lighting.EnvironmentSpecularScale,
	}
end

local function effects()
	if not atmo then
		local a = Instance.new("Atmosphere")
		a.Name = "EN_Atmosphere"
		a.Parent = Lighting
		atmo = a
		local c = Instance.new("ColorCorrectionEffect")
		c.Name = "EN_Color"
		c.Parent = Lighting
		cc = c
		local b = Instance.new("BloomEffect")
		b.Name = "EN_Bloom"
		b.Intensity = 0.6
		b.Threshold = 1.2
		b.Size = 24
		b.Parent = Lighting
		bloom = b
	end
end

local function weather(w)
	if not emitterPart then
		local p = Pool.get("Block", Vector3.new(150, 1, 110), nil, Enum.Material.SmoothPlastic, 1)
		local e = Instance.new("ParticleEmitter")
		e.Name = "EN_Weather"
		e.Shape = Enum.ParticleEmitterShape.Box
		e.ShapeStyle = Enum.ParticleEmitterShapeStyle.Volume
		e.EmissionDirection = Enum.NormalId.Bottom
		e.LockedToPart = false
		e.Parent = p
		emitterPart = p
		emitter = e
	end
	local e = emitter :: ParticleEmitter
	local col = Coords.color(w.color)
	e.Color = ColorSequence.new(col)
	e.LightEmission = if w.neon then 1 else 0.2
	e.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, w.size),
		NumberSequenceKeypoint.new(1, w.size * 0.6),
	})
	e.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 1),
		NumberSequenceKeypoint.new(0.2, w.alpha),
		NumberSequenceKeypoint.new(0.8, w.alpha),
		NumberSequenceKeypoint.new(1, 1),
	})
	e.Lifetime = NumberRange.new(w.life * 0.7, w.life)
	e.Speed = NumberRange.new(w.speed * 0.6, w.speed)
	e.SpreadAngle = Vector2.new(25, 25)
	e.Acceleration = if w.up then Vector3.new(0.4, 1.2, 0) else Vector3.new(0.3, -0.6, 0)
	e.EmissionDirection = if w.up then Enum.NormalId.Top else Enum.NormalId.Bottom
	e.Rate = if lowFx then 0 else w.rate
	e.Enabled = not lowFx
end

-- apply a land's lighting (stage = Stages entry)
function Land.enter(stage)
	save()
	effects()
	local m = MOOD[stage.id] or MOOD.graveyard
	local base = Coords.color(stage.ground.base)
	local amb = Coords.color(m.ambient)
	Lighting.ClockTime = 0
	Lighting.Brightness = 1
	Lighting.Ambient = base:Lerp(amb, 0.6):Lerp(Color3.new(1, 1, 1), 0.15)
	Lighting.OutdoorAmbient = amb
	Lighting.EnvironmentDiffuseScale = 0
	Lighting.EnvironmentSpecularScale = 0
	local a = atmo :: Atmosphere
	a.Density = m.density
	a.Offset = 0.15
	a.Color = Coords.color(m.atmo)
	a.Decay = Coords.color(m.decay)
	a.Glare = 0
	a.Haze = 1.2
	local c = cc :: ColorCorrectionEffect
	c.TintColor = Coords.color(m.tint)
	c.Saturation = 0.12
	c.Contrast = 0.08
	c.Brightness = 0.02
	c.Enabled = true
	(bloom :: BloomEffect).Enabled = true
	weather(m.weather)
end

-- the hub's lighting back
function Land.leave()
	if saved then
		for k, v in saved do
			(Lighting :: any)[k] = v
		end
	end
	if atmo then
		(atmo :: Atmosphere).Density = 0
	end
	if cc then
		(cc :: ColorCorrectionEffect).Enabled = false
	end
	if bloom then
		(bloom :: BloomEffect).Enabled = false
	end
	if emitterPart then
		(emitter :: ParticleEmitter).Enabled = false
		(emitterPart :: BasePart).CFrame = Pool.FAR
	end
end

function Land.setLowFx(on: boolean)
	lowFx = on
	if emitter then
		(emitter :: ParticleEmitter).Enabled = not on
	end
end

-- the weather follows the camera target (sim px)
function Land.update(x: number, y: number)
	if emitterPart and not lowFx then
		(emitterPart :: BasePart).CFrame = CFrame.new(x * Coords.S, 26, y * Coords.S - 12)
	end
end

return Land
