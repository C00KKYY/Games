-- Particle bursts on a budget (docs/DESIGN.md §4.4): one shared ParticleEmitter per colour and style on an invisible
-- anchor part; a burst moves the anchor and calls Emit(n), so no Instance is created per effect. A leaky bucket caps
-- the particles per second (PC 600, phone 300, reduced effects 120); bursts over the budget are thinned, never queued.
local Pool = require(script.Parent.Pool)
local Coords = require(script.Parent.Coords)
local Device = require(script.Parent.Parent.Device)

local Particles = {}

type Style = {
	size: number,
	speed: number,
	life: number,
	drag: number,
	gravity: number,
	light: number,
	spread: number,
	up: boolean?,
}
-- burst styles
local STYLES: { [string]: Style } = {
	spark = { size = 0.35, speed = 14, life = 0.35, drag = 4, gravity = -8, light = 1, spread = 180 },
	puff = { size = 1.1, speed = 5, life = 0.5, drag = 3, gravity = 2, light = 0.3, spread = 180 },
	big = { size = 0.6, speed = 26, life = 0.8, drag = 2.5, gravity = -6, light = 1, spread = 180 },
	rise = { size = 0.4, speed = 8, life = 0.9, drag = 1, gravity = 6, light = 1, spread = 35, up = true },
}
local MAX_EMITTERS = 24

local emitters: { [string]: { part: BasePart, em: ParticleEmitter } } = {}
local count = 0
local budget = 600
local tokens = 600
local lastT = os.clock()
local lowFx = false
Particles.emitted = 0
Particles.dropped = 0

local function make(style: string, color: Color3)
	local key = string.format("%s%02x%02x%02x", style, color.R * 255, color.G * 255, color.B * 255)
	local e = emitters[key]
	if e then
		return e
	end
	if count >= MAX_EMITTERS then
		-- reuse any emitter of the same style (colour stays as it was)
		for k, v in emitters do
			if string.sub(k, 1, #style) == style then
				return v
			end
		end
	end
	local st = STYLES[style] or STYLES.spark
	local p = Pool.get("Block", Vector3.one * 0.2, nil, Enum.Material.SmoothPlastic, 1)
	local em = Instance.new("ParticleEmitter")
	em.Rate = 0
	em.Enabled = true
	em.LockedToPart = false
	em.Color = ColorSequence.new(color)
	em.LightEmission = st.light
	em.LightInfluence = 0
	em.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, st.size),
		NumberSequenceKeypoint.new(1, st.size * 0.2),
	})
	em.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.05),
		NumberSequenceKeypoint.new(0.7, 0.3),
		NumberSequenceKeypoint.new(1, 1),
	})
	em.Lifetime = NumberRange.new(st.life * 0.6, st.life)
	em.Speed = NumberRange.new(st.speed * 0.4, st.speed)
	em.SpreadAngle = Vector2.new(st.spread, st.spread)
	em.Drag = st.drag
	em.Acceleration = Vector3.new(0, st.gravity, 0)
	em.EmissionDirection = Enum.NormalId.Top
	em.Shape = Enum.ParticleEmitterShape.Sphere
	em.Parent = p
	e = { part = p, em = em }
	emitters[key] = e
	count += 1
	return e
end

function Particles.setLowFx(on: boolean)
	lowFx = on
end

local function refill()
	local now = os.clock()
	budget = if lowFx then 120 elseif Device.phone() then 300 else 600
	tokens = math.min(budget * 0.5, tokens + (now - lastT) * budget)
	lastT = now
end

-- a burst of n particles at sim (x, y), height h (studs)
function Particles.burst(style: string, x: number, y: number, h: number, color: Color3, n: number)
	refill()
	local k = math.min(n, math.floor(tokens))
	if k <= 0 then
		Particles.dropped += n
		return
	end
	tokens -= k
	Particles.dropped += n - k
	Particles.emitted += k
	local e = make(style, color)
	e.part.CFrame = Coords.cf(x, y, h)
	e.em:Emit(k)
end

function Particles.clear()
	for _, e in emitters do
		e.em:Clear()
		e.part.CFrame = Pool.FAR
	end
end

return Particles
