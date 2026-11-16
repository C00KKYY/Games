-- Results after a run (R1, simple; docs/DESIGN.md §5.2): time, level, kills, gold breakdown, new achievements.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Achievements = require(Shared.Sim.Data.Achievements)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

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

function Results.show(s)
	Results.hide()
	local f = Kit.panel(gui, { Size = UDim2.fromOffset(420, 460), Position = UDim2.new(0.5, -210, 0.5, -230) })
	panel = f
	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0, 10)
	pad.Parent = f
	Kit.list(f, false, 4)
	Kit.label(f, if s.won then tr("Sieg!") else tr("Gefallen"), {
		Font = Theme.title,
		TextSize = 34,
		Size = UDim2.new(1, 0, 0, 42),
		TextColor3 = if s.won then Theme.gold else Theme.bad,
	})
	local function row(k: string, v: any)
		Kit.label(f, tr(k) .. ": " .. tostring(v), { TextSize = 18 })
	end
	row("Zeit", Lang.fmtTime(s.t))
	row("Stufe", s.level)
	row("Besiegt", Lang.fmtNum(s.kills))
	row("Gesammelt", s.collected)
	row("Zeitbonus", s.timeBonus)
	row("Bossbonus", s.bossBonus)
	if s.pass2x and s.pass2x > 0 then
		row("Doppeltes Gold", "+" .. s.pass2x)
	end
	if s.gift > 0 then
		row("Startgeschenk", s.gift)
	end
	Kit.label(
		f,
		tr("+{0} Gold", s.total),
		{ Font = Theme.title, TextSize = 24, TextColor3 = Theme.gold, Size = UDim2.new(1, 0, 0, 30) }
	)
	if #s.achievements > 0 then
		local names = {}
		for _, id in s.achievements do
			for _, a in Achievements.list do
				if a.id == id then
					table.insert(names, tr(a.name))
				end
			end
		end
		Kit.label(
			f,
			tr("Neue Erfolge") .. ": " .. table.concat(names, ", "),
			{ TextSize = 15, Size = UDim2.new(1, -20, 0, 40) }
		)
	end
	Kit.button(f, tr("Zurück"), function()
		Results.hide()
		onClose()
	end)
end

return Results
