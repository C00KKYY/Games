-- Icons without image uploads (docs/DESIGN.md §5.1): a rounded tile in the item's colour with a gradient and an
-- outline, a glyph (emoji or symbol, rendered by Roblox's text engine) and optional level pips. Used by the HUD
-- build slots, level-up cards, chest, pause screen, hero cards and the countdown bar.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Enemies = require(Shared.Sim.Data.Enemies)
local Heroes = require(Shared.Sim.Data.Heroes)

local Icons = {}

-- glyph and colour per item
Icons.WEAPON = {
	wand = { "✨", "#b48cff" },
	whip = { "🗡️", "#e8eef8" },
	orbit = { "🔵", "#ffe27a" },
	aura = { "☀️", "#ff9a3c" },
	lightning = { "⚡", "#9fe8ff" },
	sickle = { "🌙", "#e8e0c8" },
	fire = { "🧪", "#ff7a2f" },
	nova = { "❄️", "#a8e4ff" },
	knives = { "🔪", "#d8f3ff" },
}
Icons.PASSIVE = {
	might = { "💪", "#ff7a6a" },
	armor = { "🛡️", "#9aa8c0" },
	heart = { "❤️", "#ff5a7a" },
	boots = { "👢", "#c8945a" },
	magnet = { "🧲", "#e05050" },
	hourglass = { "⏳", "#ffd27a" },
	lens = { "🔍", "#8fd8ff" },
	mirror = { "🪞", "#c8d8ff" },
	clover = { "🍀", "#5ddc6a" },
	elixir = { "💧", "#5ab8ff" },
	candle = { "🕯️", "#ffcf6a" },
	wing = { "🪶", "#e8f0ff" },
}
Icons.ENEMY = {
	bat = "🦇",
	slime = "🟢",
	skel = "💀",
	ghost = "👻",
	ghoul = "🧟",
	spitter = "🐸",
	cinder = "🔥",
	moth = "🦋",
	bell = "🔔",
	wraith = "🌀",
	brute = "👹",
	golem = "🗿",
	night = "🌑",
}
Icons.MISC = {
	gold = { "🪙", "#ffd23f" },
	heal = { "🧡", "#ff7a8a" },
	chest = { "🎁", "#d8a040" },
	surge = { "⚠️", "#ff5a6e" },
	boss = { "👑", "#ff5a6e" },
	skull = { "☠", "#ff5a6e" },
	revive = { "✚", "#5dff8f" },
	star = { "★", "#ffd23f" },
}

local function hex(h: string): Color3
	return Color3.fromHex(h)
end

-- the glyph and colour for an item kind ("weapon", "passive", "gold", "heal", "enemy", "hero", or a MISC key)
function Icons.look(kind: string, id: string?): (string, Color3)
	if kind == "weapon" and id and Icons.WEAPON[id] then
		local w = Icons.WEAPON[id]
		return w[1], hex(w[2])
	elseif kind == "passive" and id and Icons.PASSIVE[id] then
		local p = Icons.PASSIVE[id]
		return p[1], hex(p[2])
	elseif kind == "enemy" and id then
		return Icons.ENEMY[id] or "👾", hex(Enemies.COLORS[id] or "#ff5a6e")
	elseif kind == "hero" and id then
		local h = Heroes.byId[id]
		local w = h and Icons.WEAPON[h.weapon]
		return if w then w[1] else "★", hex(if h then h.color else "#4f8cff")
	end
	local m = Icons.MISC[if kind == "gold" or kind == "heal" then kind else (id or kind)] or Icons.MISC.star
	return m[1], hex(m[2])
end

-- an icon tile of `size` px; level/max draw pips under it (max 8); evo = golden frame
function Icons.tile(
	parent: Instance,
	kind: string,
	id: string?,
	size: number,
	props: { [string]: any }?,
	level: number?,
	max: number?,
	evo: boolean?
): Frame
	local glyph, col = Icons.look(kind, id)
	local f = Instance.new("Frame")
	f.Name = "Icon"
	f.Size = UDim2.fromOffset(size, size)
	f.BackgroundColor3 = col:Lerp(Color3.fromRGB(20, 14, 30), 0.55)
	f.BorderSizePixel = 0
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, math.floor(size * 0.22))
	c.Parent = f
	local g = Instance.new("UIGradient")
	g.Rotation = 90
	g.Color = ColorSequence.new(col:Lerp(Color3.new(1, 1, 1), 0.15), col:Lerp(Color3.new(0, 0, 0), 0.55))
	g.Transparency = NumberSequence.new(0.35, 0.1)
	g.Parent = f
	local s = Instance.new("UIStroke")
	s.Color = if evo then Color3.fromHex("#ffd23f") else col
	s.Thickness = if evo then 2.5 else 1.5
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Parent = f
	local t = Instance.new("TextLabel")
	t.Name = "Glyph"
	t.BackgroundTransparency = 1
	t.Size = UDim2.fromScale(1, 1)
	t.Text = glyph
	t.TextScaled = true
	t.Font = Enum.Font.GothamBold
	t.TextColor3 = Color3.new(1, 1, 1)
	t.Parent = f
	local pad = Instance.new("UIPadding")
	local p = UDim.new(0, math.floor(size * 0.14))
	pad.PaddingTop, pad.PaddingBottom, pad.PaddingLeft, pad.PaddingRight = p, p, p, p
	pad.Parent = t
	if level and max and max > 1 then
		local row = Instance.new("Frame")
		row.Name = "Pips"
		row.BackgroundTransparency = 1
		row.AnchorPoint = Vector2.new(0.5, 1)
		row.Position = UDim2.new(0.5, 0, 1, -1)
		row.Size = UDim2.new(1, -4, 0, math.max(3, math.floor(size * 0.1)))
		local l = Instance.new("UIListLayout")
		l.FillDirection = Enum.FillDirection.Horizontal
		l.HorizontalAlignment = Enum.HorizontalAlignment.Center
		l.Padding = UDim.new(0, 1)
		l.Parent = row
		local n = math.min(max, 8)
		for i = 1, n do
			local pip = Instance.new("Frame")
			pip.BorderSizePixel = 0
			pip.Size = UDim2.new(1 / n, -1, 1, 0)
			pip.BackgroundColor3 = if i <= level then Color3.fromHex("#ffd23f") else Color3.fromRGB(40, 30, 50)
			pip.LayoutOrder = i
			pip.Parent = row
		end
		row.Parent = f
	end
	for k, v in props or {} do
		(f :: any)[k] = v
	end
	f.Parent = parent
	return f
end

return Icons
