-- Level-up cards (solo: modal, the world is paused; co-op: non-modal tray with auto-pick timer, docs/DESIGN.md §2.5),
-- reroll / skip / banish, chest result panel, victory buttons. Keys 1-4, R, K, B; gamepad via GuiService selection.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local GuiService = game:GetService("GuiService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Weapons = require(Shared.Sim.Data.Weapons)
local Passives = require(Shared.Sim.Data.Passives)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

local LevelUp = {}
local tr = Lang.tr

local gui: ScreenGui = nil :: any
local tray: Frame? = nil
local chestPanel: Frame? = nil
local victoryPanel: Frame? = nil
local command: (any) -> () = function(_) end
local offer: any = nil
local banishMode = false
local deadline: number? = nil
local timeNow: () -> number = os.clock
local timerLabel: TextLabel? = nil

function LevelUp.init(cmd, clock)
	command = cmd
	timeNow = clock
	gui = Kit.screen("EN_Cards", 5)
end

local function describe(o): (string, string)
	if o.kind == "weapon" then
		local d = Weapons.byId[o.id]
		if o.isNew then
			return tr(d.name), tr("NEU!") .. " " .. tr(d.desc)
		end
		local lv = d.levels[o.level - 1]
		return tr(d.name), tr("Stufe {0}", o.level) .. ": " .. (if lv then tr(lv.t) else "")
	elseif o.kind == "passive" then
		local d = Passives.byId[o.id]
		return tr(d.name), (if o.isNew then tr("NEU!") .. " " else tr("Stufe {0}", o.level) .. ": ") .. tr(d.desc)
	elseif o.kind == "gold" then
		return tr("{0} Gold", o.amount), tr("Alles ist ausgebaut – nimm Gold mit.")
	end
	return tr("Heiltrank"), tr("Stellt {0} Leben wieder her.", o.amount)
end

function LevelUp.close()
	if tray then
		tray:Destroy()
		tray = nil
	end
	offer = nil
	banishMode = false
	deadline = nil
	timerLabel = nil
end

function LevelUp.choose(i: number)
	if not offer or not offer.options[i] then
		return
	end
	if banishMode then
		command({ op = "banish", i = i })
		banishMode = false
	else
		command({ op = "pick", i = i })
	end
end

function LevelUp.action(name: string)
	if not offer then
		return
	end
	if name == "reroll" and offer.rerolls > 0 then
		command({ op = "reroll" })
	elseif name == "skip" and offer.skips > 0 then
		command({ op = "skip" })
	elseif name == "banish" and offer.banishes > 0 then
		banishMode = not banishMode
		LevelUp.show(offer, offer.solo)
	end
end

function LevelUp.isOpen(): boolean
	return offer ~= nil
end

function LevelUp.show(m, solo: boolean)
	LevelUp.close()
	offer = m
	offer.solo = solo
	deadline = m.deadline
	local n = #m.options
	local w = math.min(1, 0.22 * n + 0.04)
	local f = Kit.panel(gui, {
		Size = if solo then UDim2.new(w, 0, 0, 300) else UDim2.new(w, 0, 0, 190),
		Position = if solo then UDim2.new((1 - w) / 2, 0, 0.5, -150) else UDim2.new((1 - w) / 2, 0, 1, -250),
		BackgroundTransparency = if solo then 0.05 else 0.25,
	})
	tray = f
	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0, 8)
	pad.PaddingLeft = UDim.new(0, 8)
	pad.PaddingRight = UDim.new(0, 8)
	pad.Parent = f
	Kit.list(f, false, 6)
	timerLabel = Kit.label(f, if banishMode then tr("Verbannen") .. "?" else tr("Stufe {0}!", ""), {
		Font = Theme.title,
		TextSize = 22,
		LayoutOrder = 1,
		TextColor3 = if banishMode then Theme.bad else Theme.primary,
	})
	local row = Kit.frame(
		f,
		{ BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, if solo then 190 else 110), LayoutOrder = 2 }
	)
	Kit.list(row, true, 8)
	local first: GuiObject? = nil
	for i, o in m.options do
		local name, desc = describe(o)
		local b = Kit.button(row, "", function()
			LevelUp.choose(i)
		end, {
			Size = UDim2.new(1 / n, -8, 1, 0),
			BackgroundColor3 = if banishMode and o.isNew then Theme.bad else Theme.panel2,
			AutoButtonColor = true,
		})
		first = first or b
		Kit.label(b, i .. "  " .. name, {
			Font = Theme.title,
			TextSize = if solo then 20 else 16,
			Size = UDim2.new(1, -8, 0, 26),
			Position = UDim2.fromOffset(4, 4),
		})
		Kit.label(b, desc, {
			TextSize = if solo then 15 else 12,
			Size = UDim2.new(1, -8, 1, -34),
			Position = UDim2.fromOffset(4, 30),
			TextColor3 = Theme.dim,
			TextYAlignment = Enum.TextYAlignment.Top,
		})
	end
	local brow = Kit.frame(f, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 44), LayoutOrder = 3 })
	Kit.list(brow, true, 8)
	if m.rerolls > 0 then
		Kit.button(brow, tr("Neu würfeln") .. " (" .. m.rerolls .. ") [R]", function()
			LevelUp.action("reroll")
		end, { Size = UDim2.fromOffset(190, 40), TextSize = 16, BackgroundColor3 = Theme.panel2 })
	end
	if m.skips > 0 then
		Kit.button(brow, tr("Überspringen") .. " (" .. m.skips .. ") [K]", function()
			LevelUp.action("skip")
		end, { Size = UDim2.fromOffset(190, 40), TextSize = 16, BackgroundColor3 = Theme.panel2 })
	end
	if m.banishes > 0 then
		Kit.button(brow, tr("Verbannen") .. " (" .. m.banishes .. ") [B]", function()
			LevelUp.action("banish")
		end, { Size = UDim2.fromOffset(190, 40), TextSize = 16, BackgroundColor3 = Theme.panel2 })
	end
	if solo and first then
		GuiService.SelectedObject = first
	end
end

-- chest result (solo: with a Continue button; co-op: side panel for 3.5 s)
function LevelUp.chest(res, solo: boolean)
	if chestPanel then
		chestPanel:Destroy()
	end
	local f = Kit.panel(gui, {
		Size = UDim2.fromOffset(340, 220),
		Position = if solo then UDim2.new(0.5, -170, 0.5, -110) else UDim2.new(1, -356, 0.5, -110),
	})
	chestPanel = f
	Kit.list(f, false, 4)
	Kit.label(
		f,
		if res.evolved then tr("ENTWICKLUNG!") else tr("Truhe!"),
		{ Font = Theme.title, TextSize = 26, TextColor3 = Theme.gold, Size = UDim2.new(1, 0, 0, 34) }
	)
	if res.evolved then
		Kit.label(f, tr(Weapons.byId[res.evolved].evo.name), { Font = Theme.title, TextSize = 20 })
	end
	for _, o in res.items do
		local name = if o.kind == "weapon" then Weapons.byId[o.id].name else Passives.byId[o.id].name
		Kit.label(f, tr(name) .. " – " .. tr("Stufe {0}", o.level), { TextSize = 16 })
	end
	Kit.label(f, tr("+{0} Gold", res.gold), { TextColor3 = Theme.gold })
	if solo then
		Kit.button(f, tr("Weiter"), function()
			f:Destroy()
			chestPanel = nil
			command({ op = "chestClose" })
		end)
	else
		task.delay(3.5, function()
			if chestPanel == f then
				f:Destroy()
				chestPanel = nil
			end
		end)
	end
end

function LevelUp.closeChest()
	if chestPanel then
		chestPanel:Destroy()
		chestPanel = nil
	end
end

function LevelUp.victory(on: boolean)
	if victoryPanel then
		victoryPanel:Destroy()
		victoryPanel = nil
	end
	if not on then
		return
	end
	local f = Kit.panel(gui, { Size = UDim2.fromOffset(420, 170), Position = UDim2.new(0.5, -210, 0.5, -85) })
	victoryPanel = f
	Kit.list(f, false, 8)
	Kit.label(
		f,
		tr("Sieg!"),
		{ Font = Theme.title, TextSize = 34, TextColor3 = Theme.gold, Size = UDim2.new(1, 0, 0, 44) }
	)
	local row = Kit.frame(f, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 48) })
	Kit.list(row, true, 12)
	Kit.button(row, tr("Endlos weiter"), function()
		command({ op = "vote", endless = true })
	end, { Size = UDim2.fromOffset(190, 44) })
	Kit.button(row, tr("Beenden"), function()
		command({ op = "vote", endless = false })
	end, { Size = UDim2.fromOffset(150, 44), BackgroundColor3 = Theme.panel2 })
end

function LevelUp.update()
	if deadline and timerLabel then
		local left = math.max(0, deadline - timeNow())
		timerLabel.Text = tr("Stufe {0}!", "") .. "  " .. math.ceil(left) .. " s"
	end
end

return LevelUp
