-- Short effects (R1 placeholders): explosions, impact rings, hazards (ember / slime puddles), screen flash and pooled
-- damage numbers (BillboardGui; own hits and boss hits only, docs/DESIGN.md §4.4).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Lang = require(ReplicatedStorage:WaitForChild("Shared").Lang.Lang)
local Pool = require(script.Parent.Pool)
local Coords = require(script.Parent.Coords)

local FxView = {}

local S = Coords.S
local list: { any } = {}
local hazards: { [number]: any } = {}
local numbers: { BillboardGui } = {}
local activeNumbers: { any } = {}
local MAX_NUMBERS = 30
local enabled = { dmgNums = true }

function FxView.setOption(k: string, v: any)
	enabled[k] = v
end

local function add(part: BasePart, life: number, update)
	table.insert(list, { part = part, t = 0, life = life, update = update })
end

function FxView.boom(e)
	local d = e.rad * 2 * S
	local p = Pool.get("Cylinder", Vector3.one, Coords.color(e.color), Enum.Material.Neon, 0.4)
	local x, y = e.x, e.y
	add(p, 0.4, function(part, k)
		local s = math.max(0.2, d * (0.4 + 0.6 * k))
		part.Size = Vector3.new(0.6, s, s)
		part.CFrame = Coords.cf(x, y, 0.3) * CFrame.Angles(0, 0, math.rad(90))
		part.Transparency = 0.4 + 0.6 * k
	end)
end

function FxView.burst(e)
	local p = Pool.get("Ball", Vector3.one * 1.2, Coords.color(e.color), Enum.Material.Neon, 0.3)
	local x, y = e.x, e.y
	add(p, 0.3, function(part, k)
		local s = 1 + 3 * k
		part.Size = Vector3.one * s
		part.CFrame = Coords.cf(x, y, 1)
		part.Transparency = 0.3 + 0.7 * k
	end)
end

function FxView.kill(e)
	local col = if e.boss then Color3.fromRGB(255, 220, 140) else Color3.fromRGB(255, 240, 230)
	local p = Pool.get("Ball", Vector3.one, col, Enum.Material.Neon, 0.3)
	local x, y = e.x, e.y
	add(p, 0.25, function(part, k)
		local s = (if e.boss then 8 else 2) * (0.5 + k)
		part.Size = Vector3.one * s
		part.CFrame = Coords.cf(x, y, 1)
		part.Transparency = 0.3 + 0.7 * k
	end)
end

function FxView.hazard(e)
	local d = e.rad * 2 * S
	local col = if e.kind == "ember" then Color3.fromRGB(255, 90, 40) else Color3.fromRGB(120, 200, 90)
	local p = Pool.get("Cylinder", Vector3.new(0.12, d, d), col, Enum.Material.Neon, 0.45)
	p.CFrame = Coords.cf(e.x, e.y, 0.12) * CFrame.Angles(0, 0, math.rad(90))
	hazards[e.id] = { part = p, kind = e.kind, x = e.x, y = e.y, rad = e.rad, t = 0, life = e.life }
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

local function numberGui(): BillboardGui
	local g = table.remove(numbers)
	if g then
		return g
	end
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.fromOffset(80, 30)
	bb.AlwaysOnTop = true
	bb.LightInfluence = 0
	local t = Instance.new("TextLabel")
	t.Name = "T"
	t.BackgroundTransparency = 1
	t.Size = UDim2.fromScale(1, 1)
	t.Font = Enum.Font.GothamBold
	t.TextScaled = true
	t.TextStrokeTransparency = 0.3
	t.Parent = bb
	return bb
end

function FxView.number(e)
	if not enabled.dmgNums or #activeNumbers >= MAX_NUMBERS then
		return
	end
	local bb = numberGui()
	local t = bb:FindFirstChild("T") :: TextLabel
	t.Text = tostring(math.floor(e.amount + 0.5))
	t.TextColor3 = if e.crit then Color3.fromHex("#ffd23f") else Color3.new(1, 1, 1)
	bb.Size = if e.crit then UDim2.fromOffset(100, 36) else UDim2.fromOffset(80, 28)
	local anchor = Pool.get("Block", Vector3.one * 0.1, nil, Enum.Material.SmoothPlastic, 1)
	anchor.CFrame = Coords.cf(e.x, e.y, 3)
	bb.Adornee = anchor
	bb.Parent = anchor
	table.insert(activeNumbers, { gui = bb, anchor = anchor, t = 0, y0 = 3 })
end

function FxView.text(e)
	if #activeNumbers >= MAX_NUMBERS then
		return
	end
	local bb = numberGui()
	local t = bb:FindFirstChild("T") :: TextLabel
	t.Text = if e.arg then Lang.tr(e.text, e.arg) else Lang.tr(e.text)
	t.TextColor3 = Coords.color(e.color)
	bb.Size = UDim2.fromOffset(140, 30)
	local anchor = Pool.get("Block", Vector3.one * 0.1, nil, Enum.Material.SmoothPlastic, 1)
	anchor.CFrame = Coords.cf(e.x, e.y, 4)
	bb.Adornee = anchor
	bb.Parent = anchor
	table.insert(activeNumbers, { gui = bb, anchor = anchor, t = 0, y0 = 4 })
end

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
		end
	end
	for i = #activeNumbers, 1, -1 do
		local n = activeNumbers[i]
		n.t += dt
		if n.t >= 0.7 then
			n.gui.Parent = nil
			table.insert(numbers, n.gui)
			Pool.put(n.anchor)
			table.remove(activeNumbers, i)
		else
			local p = n.anchor.CFrame.Position
			n.anchor.CFrame = CFrame.new(p.X, n.y0 + n.t / 0.7 * 3, p.Z)
		end
	end
end

function FxView.clear()
	for _, f in list do
		Pool.put(f.part)
	end
	table.clear(list)
	for id in hazards do
		FxView.hazardGone(id)
	end
	for _, n in activeNumbers do
		n.gui.Parent = nil
		table.insert(numbers, n.gui)
		Pool.put(n.anchor)
	end
	table.clear(activeNumbers)
end

return FxView
