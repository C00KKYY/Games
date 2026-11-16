-- Damage numbers and floating texts (docs/DESIGN.md §4.4): pooled BillboardGuis on their own anchor parts (max 40 on
-- PC, 20 on phones), rising 3 studs over 0.7 s and fading. Own hits and boss hits only (the server sends no others);
-- crits are gold and larger. The "damage numbers" setting turns numbers off (texts such as "+Gold" stay).
local Lang = require(game:GetService("ReplicatedStorage"):WaitForChild("Shared").Lang.Lang)
local Pool = require(script.Parent.Pool)
local Coords = require(script.Parent.Coords)
local Device = require(script.Parent.Parent.Device)

local DamageNumbers = {}

type Num = {
	part: BasePart,
	gui: BillboardGui,
	label: TextLabel,
	t: number,
	life: number,
	x: number,
	y: number,
	h: number,
}
local free: { Num } = {}
local active: { Num } = {}
local enabled = true
local WHITE = Color3.new(1, 1, 1)
local GOLD = Color3.fromHex("#ffd23f")
local BOSS = Color3.fromHex("#ffb0c0")

local function make(): Num
	local part = Instance.new("Part")
	part.Name = "EN_Num"
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = false
	part.Transparency = 1
	part.Size = Vector3.one * 0.2
	part.CFrame = Pool.FAR
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.fromOffset(90, 30)
	bb.AlwaysOnTop = true
	bb.LightInfluence = 0
	bb.MaxDistance = 300
	bb.Adornee = part
	local t = Instance.new("TextLabel")
	t.Name = "T"
	t.BackgroundTransparency = 1
	t.Size = UDim2.fromScale(1, 1)
	t.Font = Enum.Font.FredokaOne
	t.TextScaled = true
	t.TextStrokeTransparency = 0.2
	t.TextStrokeColor3 = Color3.fromRGB(30, 10, 20)
	t.Parent = bb
	bb.Parent = part
	part.Parent = Pool.folder()
	return { part = part, gui = bb, label = t, t = 0, life = 0.7, x = 0, y = 0, h = 3 }
end

function DamageNumbers.setEnabled(on: boolean)
	enabled = on
end

local function cap(): number
	return if Device.phone() then 20 else 40
end

local function showNum(text: string, color: Color3, w: number, hgt: number, x: number, y: number, h: number, life: number)
	if #active >= cap() then
		-- replace the oldest
		local old = table.remove(active, 1) :: Num
		old.gui.Enabled = false
		old.part.CFrame = Pool.FAR
		table.insert(free, old)
	end
	local n = table.remove(free) or make()
	n.label.Text = text
	n.label.TextColor3 = color
	n.label.TextTransparency = 0
	n.label.TextStrokeTransparency = 0.2
	n.gui.Size = UDim2.fromOffset(w, hgt)
	n.gui.Enabled = true
	n.t, n.life, n.x, n.y, n.h = 0, life, x, y, h
	n.part.CFrame = Coords.cf(x, y, h)
	table.insert(active, n)
end

-- e = dmg event { x, y, amount, crit, boss }
function DamageNumbers.number(e)
	if not enabled then
		return
	end
	-- a little sideways jitter so stacked hits stay readable
	local jx = (math.random() - 0.5) * 16
	local amount = math.floor(e.amount + 0.5)
	if e.crit then
		showNum(tostring(amount) .. "!", GOLD, 110, 38, e.x + jx, e.y, 3.4, 0.8)
	else
		showNum(tostring(amount), if e.boss and not e.own then BOSS else WHITE, 80, 28, e.x + jx, e.y, 3, 0.7)
	end
end

-- e = text event { x, y, text, arg, color }
function DamageNumbers.text(e)
	local s = if e.arg ~= nil then Lang.tr(e.text, e.arg) else Lang.tr(e.text)
	showNum(s, Coords.color(e.color), 160, 30, e.x, e.y, 4, 1.0)
end

function DamageNumbers.count(): number
	return #active
end

function DamageNumbers.render(dt: number)
	for i = #active, 1, -1 do
		local n = active[i]
		n.t += dt
		if n.t >= n.life then
			n.gui.Enabled = false
			n.part.CFrame = Pool.FAR
			table.remove(active, i)
			table.insert(free, n)
		else
			local k = n.t / n.life
			n.part.CFrame = Coords.cf(n.x, n.y, n.h + k * 3)
			if k > 0.6 then
				local a = (k - 0.6) / 0.4
				n.label.TextTransparency = a
				n.label.TextStrokeTransparency = 0.2 + 0.8 * a
			end
		end
	end
end

function DamageNumbers.clear()
	for _, n in active do
		n.gui.Enabled = false
		n.part.CFrame = Pool.FAR
		table.insert(free, n)
	end
	table.clear(active)
end

return DamageNumbers
