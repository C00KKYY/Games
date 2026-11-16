-- Short effects (docs/DESIGN.md §4.4): death bursts (particles in the enemy colour, bosses with a shock ring),
-- explosions (expanding ring + sparks), coloured bursts, ember and slime puddles (hazards), the bomb flash. Pooled
-- parts and shared particle emitters only. Damage numbers and texts are in DamageNumbers.luau.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Enemies = require(Shared.Sim.Data.Enemies)
local Pool = require(script.Parent.Pool)
local Coords = require(script.Parent.Coords)
local Particles = require(script.Parent.Particles)
local DamageNumbers = require(script.Parent.DamageNumbers)

local FxView = {}

local S = Coords.S
local FLAT = CFrame.Angles(0, 0, math.rad(90))
local list: { any } = {}
local hazards: { [number]: any } = {}
local EMBER = Color3.fromRGB(255, 110, 40)
local EMBER_HOT = Color3.fromRGB(255, 200, 90)
local SLIME = Color3.fromRGB(110, 210, 90)
local SLIME_DARK = Color3.fromRGB(40, 90, 40)
local WHITE = Color3.new(1, 1, 1)
local tints: { [string]: string } = {}

function FxView.setStage(stage)
	tints = stage and stage.tints or {}
end

local function add(part: BasePart, life: number, update)
	table.insert(list, { part = part, t = 0, life = life, update = update })
end

-- an expanding flat ring on the ground
local function ring(x: number, y: number, d: number, col: Color3, life: number, h: number?, tr0: number?)
	local p = Pool.get("Cylinder", Vector3.new(0.12, 0.2, 0.2), col, Enum.Material.Neon, tr0 or 0.3)
	local base = Coords.cf(x, y, h or 0.25) * FLAT
	add(p, life, function(part, k)
		local s = math.max(0.2, d * (0.25 + 0.75 * (1 - (1 - k) * (1 - k))))
		part.Size = Vector3.new(0.12, s, s)
		part.CFrame = base
		part.Transparency = (tr0 or 0.3) + (1 - (tr0 or 0.3)) * k
	end)
end

function FxView.boom(e)
	local col = Coords.color(e.color)
	ring(e.x, e.y, e.rad * 2 * S, col, 0.4)
	Particles.burst("spark", e.x, e.y, 0.8, col, 14)
end

function FxView.burst(e)
	local col = Coords.color(e.color)
	Particles.burst(if (e.n or 0) >= 40 then "big" else "spark", e.x, e.y, 1.2, col, math.min(40, e.n or 10))
end

-- e = kill event { x, y, type, elite, boss }
function FxView.kill(e)
	local hex = tints[e.type] or Enemies.COLORS[e.type] or "#ffffff"
	local col = Coords.color(hex)
	if e.boss then
		ring(e.x, e.y, 22, Color3.fromRGB(255, 220, 140), 0.7, 0.3, 0.1)
		Particles.burst("big", e.x, e.y, 2, col, 40)
		Particles.burst("big", e.x, e.y, 2, Color3.fromRGB(255, 220, 140), 30)
	else
		Particles.burst("puff", e.x, e.y, 1, col:Lerp(WHITE, 0.3), if e.elite then 10 else 4)
		Particles.burst("spark", e.x, e.y, 1, col, if e.elite then 12 else 5)
	end
end

-- bomb pickup: white shock ring around the collector
function FxView.flash(e)
	ring(e.x, e.y, 80, WHITE, 0.5, 0.4, 0.1)
end

function FxView.hazard(e)
	local d = e.rad * 2 * S
	local ember = e.kind == "ember"
	local col = if ember then EMBER else SLIME
	local p = Pool.get("Cylinder", Vector3.new(0.1, d, d), col, Enum.Material.Neon, if ember then 0.35 else 0.4)
	p.CFrame = Coords.cf(e.x, e.y, 0.1) * FLAT
	local rim = Pool.get(
		"Cylinder",
		Vector3.new(0.08, d * 1.08, d * 1.08),
		if ember then EMBER_HOT else SLIME_DARK,
		if ember then Enum.Material.Neon else Enum.Material.SmoothPlastic,
		if ember then 0.6 else 0.35
	)
	rim.CFrame = Coords.cf(e.x, e.y, 0.07) * FLAT
	hazards[e.id] = { part = p, rim = rim, kind = e.kind, x = e.x, y = e.y, rad = e.rad, t = 0, life = e.life, d = d }
end

function FxView.hazardLife(id: number, life: number)
	local h = hazards[id]
	if h then
		h.life = h.t + life
	end
end

function FxView.hazardGone(id: number)
	local h = hazards[id]
	if h then
		Pool.put(h.part)
		Pool.put(h.rim)
		hazards[id] = nil
	end
end

-- is (x, y) inside a slime puddle? (own-hero prediction uses the sim's 0.55 slow)
function FxView.inSlow(x: number, y: number, r: number): boolean
	for _, h in hazards do
		if h.kind == "slow" then
			local rr = h.rad + r - 4
			if (x - h.x) ^ 2 + (y - h.y) ^ 2 < rr * rr then
				return true
			end
		end
	end
	return false
end

-- kept for App: numbers and texts live in DamageNumbers
FxView.number = DamageNumbers.number
FxView.text = DamageNumbers.text

function FxView.render(dt: number)
	for i = #list, 1, -1 do
		local f = list[i]
		f.t += dt
		if f.t >= f.life then
			Pool.put(f.part)
			table.remove(list, i)
		else
			f.update(f.part, f.t / f.life)
		end
	end
	for id, h in hazards do
		h.t += dt
		if h.t >= h.life + 0.5 then
			FxView.hazardGone(id)
		elseif h.kind == "ember" then
			-- flicker and the odd rising spark
			local fl = 0.3 + 0.12 * math.sin(h.t * 13 + id) + 0.05 * math.sin(h.t * 7.3)
			h.part.Transparency = if h.t > h.life then 0.3 + 0.7 * (h.t - h.life) / 0.5 else fl
			if math.random() < dt * 3 then
				local a, r = math.random() * 6.28, math.random() * h.rad
				Particles.burst("rise", h.x + math.cos(a) * r, h.y + math.sin(a) * r, 0.3, EMBER_HOT, 1)
			end
		elseif h.t > h.life then
			h.part.Transparency = 0.4 + 0.6 * (h.t - h.life) / 0.5
		end
	end
	DamageNumbers.render(dt)
end

function FxView.clear()
	for _, f in list do
		Pool.put(f.part)
	end
	table.clear(list)
	for id in hazards do
		FxView.hazardGone(id)
	end
	DamageNumbers.clear()
	Particles.clear()
end

return FxView
