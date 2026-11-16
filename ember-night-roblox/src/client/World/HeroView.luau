-- Heroes (docs/DESIGN.md §3.6, §4.3): the own hero is predicted locally every frame with the sim's movement rules
-- (speed, x0.55 in slime, leash) and sent at 20 Hz; teammates come from interpolated snapshots. Models from
-- ModelKit (body, head, cape, hat, weapon prop) in the hero or skin colours; every hero carries a warm "ember"
-- light, teammates show their name and HP above the head, downed heroes lie down inside a revive ring.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Tuning = require(Shared.Config.Tuning)
local Cosmetics = require(Shared.Config.Cosmetics)
local ModelKit = require(script.Parent.ModelKit)
local Pool = require(script.Parent.Pool)
local Coords = require(script.Parent.Coords)

local HeroView = {}

local S = Coords.S
local R = 1.35 -- hero model radius in studs
type Hero = {
	rig: ModelKit.Rig?,
	hero: string?,
	skin: string?,
	light: PointLight?,
	dome: BasePart?,
	ring: BasePart?,
	ringFill: BasePart?,
	trail: Trail?,
	trailId: string?,
	att: { Attachment }?,
	tag: BillboardGui?,
	tagFill: Frame?,
	tagName: TextLabel?,
	yaw: number,
	px: number,
	py: number,
}
local DOME = Color3.fromRGB(255, 150, 70)
local REVIVE = Color3.fromRGB(93, 255, 143)

local heroes: { [number]: Hero } = {}
local own = { slot = 0, x = 0, y = 0, speed = 150, state = "active", dirX = 1, dirY = 0, moving = false, face = 1 }
local correction: { x: number, y: number, t: number }? = nil
local heroIds: { [number]: string } = {}
local states: { [number]: string } = {}
local names: { [number]: string } = {}
local cosBySlot: { [number]: { skin: string?, fx: string?, trail: string? } } = {}
local bulkP: { BasePart } = {}
local bulkC: { CFrame } = {}
local visible: { { x: number, y: number } } = {}
local stIdle = { moving = false }
local stMove = { moving = true }

-- equipped cosmetics of a hero (validated by the server): skin palette and trail; weapon colours are in ShotView
function HeroView.setCosmetics(slot: number, cos: { skin: string?, fx: string?, trail: string? }?, name: string?)
	cosBySlot[slot] = cos or {}
	if name then
		names[slot] = name
	end
end

local function color(hex: string?): Color3?
	local r, g, b = Cosmetics.parseHex(hex)
	return if r then Color3.new(r, g :: number, b :: number) else nil
end

local function removeTrail(h: Hero)
	if h.trail then
		h.trail:Destroy()
		h.trail = nil
	end
	if h.att then
		for _, a in h.att do
			a:Destroy()
		end
		h.att = nil
	end
	h.trailId = nil
end

local function applyTrail(h: Hero, id: string?)
	if h.trailId == id or not h.rig then
		return
	end
	removeTrail(h)
	local c = id and Cosmetics.byId[id]
	local col = c and color(c.color)
	if not col then
		return
	end
	local body = (h.rig :: ModelKit.Rig).parts[1]
	local a0 = Instance.new("Attachment")
	a0.Position = Vector3.new(0, 0, 0.6)
	local a1 = Instance.new("Attachment")
	a1.Position = Vector3.new(0, 0, -0.6)
	local tr = Instance.new("Trail")
	tr.Attachment0 = a0
	tr.Attachment1 = a1
	tr.Color = ColorSequence.new(col)
	tr.LightEmission = 0.8
	tr.Lifetime = 0.45
	tr.FaceCamera = true
	tr.Transparency = NumberSequence.new(0.2, 1)
	tr.WidthScale = NumberSequence.new(1, 0.2)
	a0.Parent = body
	a1.Parent = body
	tr.Parent = body
	h.trail = tr
	h.att = { a0, a1 }
	h.trailId = id
end

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

local function makeTag(h: Hero, slot: number)
	local bb = Instance.new("BillboardGui")
	bb.Name = "EN_Tag"
	bb.Size = UDim2.fromOffset(110, 26)
	bb.StudsOffsetWorldSpace = Vector3.new(0, 5.4, 0)
	bb.AlwaysOnTop = true
	bb.LightInfluence = 0
	bb.MaxDistance = 400
	local name = Instance.new("TextLabel")
	name.BackgroundTransparency = 1
	name.Size = UDim2.new(1, 0, 0, 14)
	name.Font = Enum.Font.GothamBold
	name.TextSize = 13
	name.TextColor3 = Color3.new(1, 1, 1)
	name.TextStrokeTransparency = 0.4
	name.Text = names[slot] or ""
	name.Parent = bb
	local bg = Instance.new("Frame")
	bg.BorderSizePixel = 0
	bg.BackgroundColor3 = Color3.fromRGB(20, 14, 28)
	bg.Size = UDim2.new(0.8, 0, 0, 6)
	bg.Position = UDim2.new(0.1, 0, 0, 16)
	bg.Parent = bb
	local fill = Instance.new("Frame")
	fill.BorderSizePixel = 0
	fill.BackgroundColor3 = Color3.fromRGB(255, 80, 100)
	fill.Size = UDim2.fromScale(1, 1)
	fill.Parent = bg
	h.tag = bb
	h.tagFill = fill
	h.tagName = name
end

local function get(slot: number): Hero
	local h = heroes[slot]
	if not h then
		h = { rig = nil, hero = nil, yaw = 0, px = 0, py = 0 }
		heroes[slot] = h
	end
	local id = heroIds[slot]
	local cos = cosBySlot[slot] or {}
	if not h.rig or h.hero ~= id or h.skin ~= cos.skin then
		if h.rig then
			removeTrail(h)
			ModelKit.release(h.rig)
			h.light = nil
			h.tag = nil
		end
		h.hero = id
		h.skin = cos.skin
		local skin = cos.skin and Cosmetics.byId[cos.skin]
		local pal: ModelKit.Palette = {
			body = (skin and color(skin.body)) or ModelKit.heroColor(id),
			accent = skin and color(skin.accent) or nil,
		}
		h.rig = ModelKit.hero(id, R, pal)
		local rig = h.rig :: ModelKit.Rig
		local l = Instance.new("PointLight")
		l.Range = if slot == own.slot then 22 else 16
		l.Brightness = if slot == own.slot then 1.4 else 1
		l.Color = Color3.fromRGB(255, 170, 90)
		l.Shadows = false
		l.Parent = rig.parts[2]
		h.light = l
		if slot ~= own.slot then
			makeTag(h, slot);
			(h.tag :: BillboardGui).Parent = rig.parts[4]
		end
	end
	applyTrail(h, cos.trail)
	return h
end

local function showTrail(h: Hero, on: boolean)
	local tr = h.trail
	if tr and tr.Enabled ~= on then
		tr:Clear()
		tr.Enabled = on
	end
end

-- ember ward (co-op level-up, docs/DESIGN.md §2.5): translucent dome of WARD_RADIUS
local function ward(h: Hero, x: number, y: number, on: boolean)
	if on then
		if not h.dome then
			local d = Tuning.WARD_RADIUS * 2 * S
			h.dome = Pool.get("Ball", Vector3.one * d, DOME, Enum.Material.Neon, 0.85)
		end
		(h.dome :: BasePart).CFrame = CFrame.new(x * S, 0, y * S)
	elseif h.dome then
		Pool.put(h.dome)
		h.dome = nil
	end
end

-- revive ring around a downed hero: outline + filling progress
local function reviveRing(h: Hero, x: number, y: number, downed: boolean, frac: number)
	if downed then
		local d = Tuning.REVIVE_RADIUS * 2 * S
		if not h.ring then
			h.ring = Pool.get("Cylinder", Vector3.new(0.06, d, d), REVIVE, Enum.Material.Neon, 0.7)
			h.ringFill = Pool.get("Cylinder", Vector3.new(0.08, 0.2, 0.2), REVIVE, Enum.Material.Neon, 0.35)
		end
		local base = CFrame.new(x * S, 0.08, y * S) * CFrame.Angles(0, 0, math.rad(90));
		(h.ring :: BasePart).CFrame = base
		local f = math.max(0.2, d * math.clamp(frac, 0, 1))
		local fill = h.ringFill :: BasePart
		if math.abs(fill.Size.Y - f) > 0.05 then
			fill.Size = Vector3.new(0.08, f, f)
		end
		fill.CFrame = base * CFrame.new(0.02, 0, 0)
	elseif h.ring then
		Pool.put(h.ring)
		Pool.put(h.ringFill :: BasePart)
		h.ring = nil
		h.ringFill = nil
	end
end

local function turn(from: number, to: number, k: number): number
	local d = (to - from + math.pi) % (2 * math.pi) - math.pi
	return from + d * k
end

local function place(h: Hero, x: number, y: number, downed: boolean, moving: boolean, t: number, n: number): number
	local rig = h.rig :: ModelKit.Rig
	local base = CFrame.new(x * S, 0, y * S) * CFrame.Angles(0, -h.yaw, 0)
	if downed then
		base = base * CFrame.new(0, 0.6, 0) * CFrame.Angles(0, 0, math.rad(80))
	end
	return ModelKit.pose(rig, base, t, if moving and not downed then stMove else stIdle, bulkP, bulkC, n)
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

-- render all heroes; interp gives teammates. Returns the visible hero positions (enemies face them).
function HeroView.render(interp, t: number, dt: number?): { { x: number, y: number } }
	local seen = {}
	local latest = interp:latestHeroes()
	local n = 0
	local k = math.min(1, (dt or 1 / 60) * 14)
	table.clear(bulkP)
	table.clear(bulkC)
	table.clear(visible)
	if own.slot > 0 then
		local h = get(own.slot)
		if own.moving then
			h.yaw = turn(h.yaw, math.atan2(own.dirY, own.dirX), k)
		end
		local me = latest[own.slot]
		local downed = own.state == "downed"
		n = place(h, own.x, own.y, downed, own.moving, t, n)
		ward(h, own.x, own.y, me ~= nil and me.ward)
		reviveRing(h, own.x, own.y, downed, if me then me.revive or 0 else 0)
		showTrail(h, not downed)
		seen[own.slot] = true
		if own.state ~= "fallen" then
			table.insert(visible, { x = own.x, y = own.y })
		end
	end
	for slot = 1, Tuning.MAX_PLAYERS do
		if slot ~= own.slot then
			local x, y, data = interp:hero(slot)
			if x and data and not data.fallen then
				local h = get(slot)
				local dx, dy = x - h.px, y - h.py
				if dx * dx + dy * dy > 0.25 then
					h.yaw = turn(h.yaw, math.atan2(dy, dx), k)
				end
				h.px, h.py = x, y
				n = place(h, x, y, data.downed, data.moving, t, n)
				ward(h, x, y, data.ward)
				reviveRing(h, x, y, data.downed, data.revive or 0)
				showTrail(h, not data.downed)
				if h.tagFill then
					(h.tagFill :: Frame).Size = UDim2.fromScale(math.clamp(data.hp or 1, 0, 1), 1)
				end
				if h.tagName and names[slot] and (h.tagName :: TextLabel).Text ~= names[slot] then
					(h.tagName :: TextLabel).Text = names[slot]
				end
				seen[slot] = true
				table.insert(visible, { x = x, y = y })
			end
		end
	end
	if n > 0 then
		workspace:BulkMoveTo(bulkP, bulkC, Enum.BulkMoveMode.FireCFrameChanged)
	end
	for slot, h in heroes do
		if not seen[slot] and h.rig then
			for _, p in (h.rig :: ModelKit.Rig).parts do
				p.CFrame = Pool.FAR
			end
			ward(h, 0, 0, false)
			reviveRing(h, 0, 0, false, 0)
			showTrail(h, false)
		end
	end
	return visible
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
		ward(h, 0, 0, false)
		reviveRing(h, 0, 0, false, 0)
		removeTrail(h)
		if h.rig then
			ModelKit.release(h.rig)
		end
		heroes[slot] = nil
	end
	own.slot = 0
	table.clear(states)
end

return HeroView
