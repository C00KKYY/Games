-- Heroes (docs/DESIGN.md §3.6, §4.3): the own hero is predicted locally every frame with the sim's movement rules
-- (speed, x0.55 in slime, leash) and sent at 20 Hz; teammates come from interpolated snapshots. Placeholder model:
-- block body + ball head in the hero colour, warm PointLight on the own hero.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Tuning = require(Shared.Config.Tuning)
local ModelKit = require(script.Parent.ModelKit)
local Pool = require(script.Parent.Pool)
local Coords = require(script.Parent.Coords)

local HeroView = {}

local S = Coords.S
type Hero = { body: BasePart, head: BasePart, hero: string?, light: PointLight?, dome: BasePart? }
local DOME = Color3.fromRGB(255, 150, 70)

local heroes: { [number]: Hero } = {}
local own = { slot = 0, x = 0, y = 0, speed = 150, state = "active", dirX = 1, dirY = 0, moving = false, face = 1 }
local correction: { x: number, y: number, t: number }? = nil
local heroIds: { [number]: string } = {}
local states: { [number]: string } = {}

function HeroView.own()
	return own
end

function HeroView.start(slot: number, x: number, y: number, heroId: string)
	own.slot = slot
	own.x, own.y = x, y
	own.state = "active"
	heroIds[slot] = heroId
	correction = nil
end

function HeroView.setSpeed(v: number)
	own.speed = v
end

function HeroView.setState(slot: number, state: string)
	states[slot] = state
	if slot == own.slot then
		own.state = state
	end
end

function HeroView.setHero(slot: number, heroId: string)
	heroIds[slot] = heroId
end

-- server correction: glide there over 0.1 s
function HeroView.correct(x: number, y: number)
	correction = { x = x, y = y, t = 0.1 }
end

local function get(slot: number): Hero
	local h = heroes[slot]
	if not h then
		h = {
			body = Pool.get("Block", Vector3.new(1.8, 2.2, 1.4), nil, Enum.Material.SmoothPlastic, 0),
			head = Pool.get("Ball", Vector3.new(1.3, 1.3, 1.3), Color3.fromRGB(255, 224, 196), Enum.Material.SmoothPlastic, 0),
			hero = nil,
		}
		heroes[slot] = h
	end
	local id = heroIds[slot]
	if h.hero ~= id then
		h.hero = id
		h.body.Color = ModelKit.heroColor(id)
	end
	if slot == own.slot and not h.light then
		local l = Instance.new("PointLight")
		l.Range = 22
		l.Brightness = 1.4
		l.Color = Color3.fromRGB(255, 170, 90)
		l.Parent = h.body
		h.light = l
	end
	return h
end

-- ember ward (co-op level-up, docs/DESIGN.md §2.5): translucent dome of WARD_RADIUS
local function ward(h: Hero, x: number, y: number, on: boolean)
	if on then
		if not h.dome then
			local d = Tuning.WARD_RADIUS * 2 * S
			h.dome = Pool.get("Ball", Vector3.one * d, DOME, Enum.Material.Neon, 0.82)
		end
		(h.dome :: BasePart).CFrame = CFrame.new(x * S, 0, y * S)
	elseif h.dome then
		Pool.put(h.dome)
		h.dome = nil
	end
end

local function place(h: Hero, x: number, y: number, downed: boolean, faceLeft: boolean, t: number)
	local base = CFrame.new(x * S, 0, y * S)
	if downed then
		h.body.CFrame = base * CFrame.new(0, 0.6, 0) * CFrame.Angles(math.rad(80), 0, 0)
		h.head.CFrame = base * CFrame.new(0, 0.7, -1.6)
	else
		local bob = math.abs(math.sin(t * 10)) * 0.15
		local yaw = if faceLeft then math.pi else 0
		h.body.CFrame = base * CFrame.new(0, 1.1 + bob, 0) * CFrame.Angles(0, yaw, 0)
		h.head.CFrame = base * CFrame.new(0, 2.8 + bob, 0)
	end
end

-- leash: stay within LEASH_RADIUS of the centroid of the active heroes (latest snapshot data)
local function leash(x: number, y: number, latest): (number, number)
	local cx, cy, n = x, y, 1
	for slot, h in latest do
		if slot ~= own.slot and not h.downed and not h.fallen then
			cx += h.x
			cy += h.y
			n += 1
		end
	end
	if n < 2 then
		return x, y
	end
	cx /= n
	cy /= n
	local dx, dy = x - cx, y - cy
	local d = math.sqrt(dx * dx + dy * dy)
	local L = Tuning.LEASH_RADIUS
	if d > L then
		return cx + dx / d * L, cy + dy / d * L
	end
	return x, y
end

-- own hero: move, send, render. mx/my = move vector, slow = in a slime puddle
function HeroView.updateOwn(dt: number, mx: number, my: number, slow: boolean, latest, send)
	if own.slot == 0 then
		return
	end
	local l = math.sqrt(mx * mx + my * my)
	own.moving = own.state == "active" and l > 0.05
	if own.moving then
		local k = math.min(1, l) * (if slow then 0.55 else 1)
		own.dirX, own.dirY = mx / l, my / l
		own.x += own.dirX * own.speed * k * dt
		own.y += own.dirY * own.speed * k * dt
		if math.abs(own.dirX) > 0.1 then
			own.face = if own.dirX > 0 then 1 else -1
		end
	end
	if correction then
		local c = correction
		local k = math.min(1, dt / math.max(c.t, 1e-3))
		own.x += (c.x - own.x) * k
		own.y += (c.y - own.y) * k
		c.t -= dt
		if c.t <= 0 then
			own.x, own.y = c.x, c.y
			correction = nil
		end
	end
	own.x, own.y = leash(own.x, own.y, latest)
	send(dt, own.x, own.y, own.dirX, own.dirY, own.moving)
end

-- render all heroes; interp gives teammates
function HeroView.render(interp, t: number)
	local seen = {}
	local latest = interp:latestHeroes()
	if own.slot > 0 then
		local h = get(own.slot)
		place(h, own.x, own.y, own.state == "downed", own.face < 0, if own.moving then t else 0)
		local me = latest[own.slot]
		ward(h, own.x, own.y, me ~= nil and me.ward)
		seen[own.slot] = true
	end
	for slot = 1, Tuning.MAX_PLAYERS do
		if slot ~= own.slot then
			local x, y, data = interp:hero(slot)
			if x and data and not data.fallen then
				local h = get(slot)
				place(h, x, y, data.downed, data.faceLeft, if data.moving then t else 0)
				ward(h, x, y, data.ward)
				seen[slot] = true
			end
		end
	end
	for slot, h in heroes do
		if not seen[slot] then
			h.body.CFrame = Pool.FAR
			h.head.CFrame = Pool.FAR
			ward(h, 0, 0, false)
		end
	end
end

-- world position of a hero (own: predicted; others: interpolated)
function HeroView.position(interp, slot: number): (number?, number?)
	if slot == own.slot then
		return own.x, own.y
	end
	local x, y = interp:hero(slot)
	return x, y
end

function HeroView.clear()
	for slot, h in heroes do
		if h.light then
			h.light:Destroy()
		end
		ward(h, 0, 0, false)
		Pool.put(h.body)
		Pool.put(h.head)
		heroes[slot] = nil
	end
	own.slot = 0
	table.clear(states)
end

return HeroView
