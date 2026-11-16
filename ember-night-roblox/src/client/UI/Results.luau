-- Results after a run (docs/DESIGN.md §5.2, web tpl_over): victory or fall, time / level / kills tiles, the gold
-- breakdown (collected, time bonus, boss bonus, double-gold pass, starter gift) with the total, new achievements and
-- the damage dealt per weapon. Fits phones (the window shrinks with the screen and scrolls).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local GuiService = game:GetService("GuiService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Achievements = require(Shared.Sim.Data.Achievements)
local Weapons = require(Shared.Sim.Data.Weapons)
local Heroes = require(Shared.Sim.Data.Heroes)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)
local Icons = require(script.Parent.Icons)

local Results = {}
local tr = Lang.tr

local gui: ScreenGui = nil :: any
local panel: Frame? = nil
local onClose: () -> () = function() end

function Results.init(close: () -> ())
	onClose = close
	gui = Kit.screen("EN_Results", 6)
end

function Results.hide()
	if panel then
		panel:Destroy()
		panel = nil
	end
end

local function tile(parent: Instance, order: number, label: string, value: string)
	local f = Kit.panel(parent, { BackgroundColor3 = Theme.panel2, BackgroundTransparency = 0.2, LayoutOrder = order })
	Kit.label(
		f,
		value,
		{ Font = Theme.title, TextSize = 24, Size = UDim2.new(1, 0, 0, 30), Position = UDim2.fromOffset(0, 6) }
	)
	Kit.label(
		f,
		tr(label),
		{ TextSize = 13, TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 16), Position = UDim2.fromOffset(0, 38) }
	)
end

function Results.show(s)
	Results.hide()
	local w, body = Kit.window(gui, if s.won then "★ " .. tr("Sieg!") .. " ★" else tr("Gefallen"), function()
		Results.hide()
		onClose()
	end)
	panel = w
	Kit.list(body, false, 8)
	-- hero and headline tiles
	local top = Kit.frame(body, { BackgroundTransparency = 1, Size = UDim2.new(1, -10, 0, 64), LayoutOrder = 1 })
	Kit.list(top, true, 8)
	if s.heroId and Heroes.byId[s.heroId] then
		Icons.tile(top, "hero", s.heroId, 60, { LayoutOrder = 0 })
	end
	local tiles = Kit.frame(top, { BackgroundTransparency = 1, Size = UDim2.new(1, -70, 1, 0), LayoutOrder = 1 })
	local g = Instance.new("UIGridLayout")
	g.CellSize = UDim2.new(1 / 3, -6, 1, 0)
	g.CellPadding = UDim2.fromOffset(6, 0)
	g.SortOrder = Enum.SortOrder.LayoutOrder
	g.Parent = tiles
	tile(tiles, 1, "Zeit", Lang.fmtTime(s.t))
	tile(tiles, 2, "Stufe", tostring(s.level))
	tile(tiles, 3, "Besiegt", Lang.fmtNum(s.ownKills or s.kills))
	-- gold breakdown
	local function row(order: number, label: string, value: string, color: Color3?)
		local r = Kit.frame(body, { BackgroundTransparency = 1, Size = UDim2.new(1, -10, 0, 24), LayoutOrder = order })
		Kit.label(r, label, {
			Size = UDim2.fromScale(0.65, 1),
			TextSize = 16,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextColor3 = color or Theme.text,
		})
		Kit.label(r, value, {
			Size = UDim2.fromScale(0.35, 1),
			Position = UDim2.fromScale(0.65, 0),
			TextSize = 16,
			Font = Theme.number,
			TextXAlignment = Enum.TextXAlignment.Right,
			TextColor3 = color or Theme.text,
		})
	end
	row(10, tr("Gesammelt"), "+" .. Lang.fmtNum(s.collected))
	row(11, tr("Zeitbonus"), "+" .. Lang.fmtNum(s.timeBonus))
	row(12, tr("Bossbonus"), "+" .. Lang.fmtNum(s.bossBonus))
	if s.pass2x and s.pass2x > 0 then
		row(13, tr("Doppeltes Gold"), "+" .. Lang.fmtNum(s.pass2x), Theme.gold)
	end
	if s.gift and s.gift > 0 then
		row(14, tr("Startgeschenk"), "+" .. Lang.fmtNum(s.gift), Theme.good)
	end
	Kit.label(body, "● " .. tr("+{0} Gold", Lang.fmtNum(s.total)), {
		Font = Theme.title,
		TextSize = 30,
		TextColor3 = Theme.gold,
		Size = UDim2.new(1, -10, 0, 38),
		LayoutOrder = 20,
		TextStrokeTransparency = 0.5,
	})
	-- new achievements
	if s.achievements and #s.achievements > 0 then
		Kit.label(
			body,
			tr("Neue Erfolge"),
			{ Font = Theme.title, TextSize = 18, TextColor3 = Theme.primary, LayoutOrder = 30 }
		)
		for i, id in s.achievements do
			for _, a in Achievements.list do
				if a.id == id then
					row(
						30 + i,
						"🏆 " .. tr(a.name),
						if a.gold and a.gold > 0 then "+" .. a.gold .. " ●" else "",
						Theme.gold
					)
				end
			end
		end
	end
	-- damage per weapon (top 5)
	local dmg = {}
	local maxD = 0
	for wid, v in s.dmgBy or {} do
		if Weapons.byId[wid] then
			table.insert(dmg, { id = wid, v = v })
			maxD = math.max(maxD, v)
		end
	end
	table.sort(dmg, function(a, b)
		return a.v > b.v
	end)
	if #dmg > 0 then
		Kit.label(
			body,
			tr("Schaden"),
			{ Font = Theme.title, TextSize = 18, TextColor3 = Theme.primary, LayoutOrder = 60 }
		)
		for i = 1, math.min(5, #dmg) do
			local d = dmg[i]
			local r =
				Kit.frame(body, { BackgroundTransparency = 1, Size = UDim2.new(1, -10, 0, 30), LayoutOrder = 60 + i })
			Icons.tile(r, "weapon", d.id, 28)
			local bg, set =
				Kit.bar(r, Theme.primary, { Size = UDim2.new(1, -150, 0, 12), Position = UDim2.fromOffset(36, 9) })
			set(d.v / math.max(1, maxD))
			Kit.label(bg.Parent :: Instance, Lang.fmtNum(math.floor(d.v)), {
				Size = UDim2.fromOffset(100, 30),
				Position = UDim2.new(1, -100, 0, 0),
				TextSize = 14,
				Font = Theme.number,
				TextXAlignment = Enum.TextXAlignment.Right,
			})
		end
	end
	local b = Kit.button(body, tr("Zurück"), function()
		Results.hide()
		onClose()
	end, { LayoutOrder = 100, Size = UDim2.fromOffset(200, 46) })
	GuiService.SelectedObject = b
end

return Results
