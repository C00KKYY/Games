-- Pause screen (docs/DESIGN.md §5.2, web tpl_pause): weapons with level and evolution hint, passives, the stats grid,
-- quick settings (sound, music, damage numbers, shake), give up with confirmation and continue. Solo: the world is
-- paused by the server; co-op: the menu button opens it without pausing anyone and "give up" leaves the run (the
-- hero falls and the player spectates).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local GuiService = game:GetService("GuiService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Weapons = require(Shared.Sim.Data.Weapons)
local Passives = require(Shared.Sim.Data.Passives)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)
local Icons = require(script.Parent.Icons)

local Pause = {}
local tr = Lang.tr

local gui: ScreenGui = nil :: any
local panel: Frame? = nil
local command: (any) -> () = function(_) end
local hero: any = nil
local settings: { [string]: any } = {}
local confirm = false
local solo = true
local open = false

local TOGGLES = {
	{ "sfx", Lang.key("Soundeffekte") },
	{ "music", Lang.key("Musik") },
	{ "dmgNums", Lang.key("Schadenszahlen") },
	{ "shake", Lang.key("Wackeln") },
}

function Pause.init(cmd)
	command = cmd
	gui = Kit.screen("EN_Pause", 8)
	gui.Enabled = false
end

function Pause.setHero(m)
	hero = m
	if open then
		Pause.render()
	end
end

function Pause.setSettings(s: { [string]: any }?)
	settings = s or {}
	if open then
		Pause.render()
	end
end

function Pause.isOpen(): boolean
	return open
end

local function pct(v: number): string
	local ps = if Lang.get() == "de" then " %" else "%"
	return (if v >= 0 then "+" else "") .. math.floor(v * 100 + 0.5) .. ps
end

function Pause.render()
	if panel then
		panel:Destroy()
		panel = nil
	end
	if not open then
		gui.Enabled = false
		return
	end
	gui.Enabled = true
	Kit.frame(gui, {
		BackgroundColor3 = Color3.fromRGB(8, 4, 16),
		BackgroundTransparency = 0.4,
		Size = UDim2.new(1, 0, 1, 80),
		Position = UDim2.fromOffset(0, -40),
		Name = "Dim",
	})
	local w, body = Kit.window(gui, tr("Pause"), function()
		Pause.close(true)
	end)
	panel = w
	Kit.list(body, false, 8)
	local h = hero or { weapons = {}, passives = {}, stats = {}, hp = 0 }
	local owned = {}
	for _, p in h.passives or {} do
		owned[p.id] = true
	end
	-- build: two columns
	local cols = Kit.frame(body, {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, -10, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		LayoutOrder = 1,
	})
	local function column(title: string, x: number): Frame
		local c = Kit.frame(cols, {
			BackgroundTransparency = 1,
			Size = UDim2.new(0.5, -6, 0, 0),
			Position = UDim2.new(x, if x > 0 then 6 else 0, 0, 0),
			AutomaticSize = Enum.AutomaticSize.Y,
		})
		local l = Kit.list(c, false, 4)
		l.HorizontalAlignment = Enum.HorizontalAlignment.Left
		Kit.label(c, tr(title), {
			Font = Theme.title,
			TextSize = 20,
			TextColor3 = Theme.primary,
			TextXAlignment = Enum.TextXAlignment.Left,
			LayoutOrder = 0,
		})
		return c
	end
	local wc = column("Waffen", 0)
	local pc = column("Passive", 0.5)
	local function row(
		parent: Frame,
		order: number,
		kind: string,
		id: string,
		name: string,
		lv: string,
		small: string,
		evo: boolean
	)
		local r = Kit.frame(parent, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 46), LayoutOrder = order })
		Icons.tile(r, kind, id, 40, { Position = UDim2.fromOffset(0, 3) }, nil, nil, evo)
		Kit.label(r, name .. "  " .. lv, {
			Size = UDim2.new(1, -50, 0, 20),
			Position = UDim2.fromOffset(48, 2),
			TextSize = 15,
			Font = Theme.number,
			TextColor3 = if evo then Theme.gold else Theme.text,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextTruncate = Enum.TextTruncate.AtEnd,
		})
		Kit.label(r, small, {
			Size = UDim2.new(1, -50, 0, 22),
			Position = UDim2.fromOffset(48, 22),
			TextSize = 12,
			TextColor3 = Theme.dim,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextTruncate = Enum.TextTruncate.AtEnd,
		})
	end
	for i, wp in h.weapons or {} do
		local d = Weapons.byId[wp.id]
		if d then
			local max = #d.levels + 1
			local hint = if wp.evo
				then ""
				else tr(
					"Entwicklung: Stufe 8 + {0}{1}, dann Truhe",
					tr(Passives.byId[d.evo.with].name),
					if owned[d.evo.with] then " ✓" else ""
				)
			row(
				wc,
				i,
				"weapon",
				wp.id,
				tr(if wp.evo then d.evo.name else d.name),
				if wp.evo then tr("ENTWICKELT") else tr("Stufe {0}/{1}", wp.level, max),
				hint,
				wp.evo == true
			)
		end
	end
	for i, p in h.passives or {} do
		local d = Passives.byId[p.id]
		if d then
			row(pc, i, "passive", p.id, tr(d.name), tr("Stufe {0}/{1}", p.level, d.max), tr(d.desc), false)
		end
	end
	if #(h.passives or {}) == 0 then
		Kit.label(
			pc,
			tr("Noch keine"),
			{ TextColor3 = Theme.dim, LayoutOrder = 1, TextXAlignment = Enum.TextXAlignment.Left }
		)
	end
	-- stats grid
	local s = h.stats or {}
	local grid = Kit.grid(body, 168, 28, { LayoutOrder = 2 })
	local function stat(i: number, label: string, value: string)
		local c = Kit.frame(grid, { BackgroundColor3 = Theme.panel2, BackgroundTransparency = 0.3, LayoutOrder = i })
		Kit.label(c, tr(label), {
			Size = UDim2.new(0.6, -6, 1, 0),
			Position = UDim2.fromOffset(6, 0),
			TextSize = 13,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextColor3 = Theme.dim,
		})
		Kit.label(c, value, {
			Size = UDim2.new(0.4, -6, 1, 0),
			Position = UDim2.fromScale(0.6, 0),
			TextSize = 13,
			Font = Theme.number,
			TextXAlignment = Enum.TextXAlignment.Right,
		})
	end
	if s.maxHp then
		stat(1, "Leben", math.ceil(h.hp or 0) .. "/" .. s.maxHp)
		stat(2, "Rüstung", tostring(s.armor))
		stat(3, "Erholung", Lang.fmtDec(math.floor((s.regen or 0) * 10 + 0.5) / 10) .. "/s")
		stat(4, "Schaden", pct((s.might or 1) - 1))
		stat(5, "Fläche", pct((s.area or 1) - 1))
		stat(6, "Abklingzeit", pct((s.cooldown or 1) - 1))
		stat(7, "Geschosse", "+" .. tostring(s.amount or 0))
		stat(8, "Lauftempo", pct((s.speed or 150) / 150 - 1))
		stat(9, "Glück", pct((s.luck or 1) - 1))
		stat(10, "Krit", math.floor((s.crit or 0) * 100 + 0.5) .. (if Lang.get() == "de" then " %" else "%"))
		stat(11, "Wachstum", pct((s.growth or 1) - 1))
		stat(12, "Gier", pct((s.greed or 1) - 1))
	end
	-- quick settings
	local srow = Kit.frame(body, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 44), LayoutOrder = 3 })
	Kit.list(srow, true, 6)
	for _, t in TOGGLES do
		local key = t[1]
		local on = settings[key] ~= false
		local b = Kit.button(srow, tr(t[2]) .. ": " .. (if on then tr("An") else tr("Aus")), function()
			settings[key] = not on
			command({ op = "setting", key = key, value = not on })
			Pause.render()
		end, { Size = UDim2.fromOffset(176, 40), TextSize = 14 })
		b.BackgroundColor3 = if on then Theme.primary else Theme.panel2
	end
	-- actions
	local arow = Kit.frame(body, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 52), LayoutOrder = 4 })
	Kit.list(arow, true, 12)
	Kit.button(arow, if confirm then tr("Wirklich aufgeben?") else tr("Aufgeben"), function()
		if confirm then
			confirm = false
			Pause.close(false)
			command({ op = "giveup" })
		else
			confirm = true
			Pause.render()
		end
	end, { Size = UDim2.fromOffset(220, 46), BackgroundColor3 = Theme.bad })
	local cont = Kit.button(arow, tr("Weiter"), function()
		Pause.close(true)
	end, { Size = UDim2.fromOffset(200, 46) })
	GuiService.SelectedObject = cont
end

-- solo: the server paused; co-op: opened from the menu button
function Pause.open(isSolo: boolean)
	solo = isSolo
	if open then
		return
	end
	open = true
	confirm = false
	Pause.render()
end

-- resume = ask the server to continue (solo)
function Pause.close(resume: boolean)
	if not open then
		return
	end
	open = false
	confirm = false
	Pause.render()
	for _, c in gui:GetChildren() do
		if c.Name == "Dim" then
			c:Destroy()
		end
	end
	if resume and solo then
		command({ op = "resume" })
	end
end

return Pause
