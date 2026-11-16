-- Level-up cards (solo: modal over a dimmed screen, the world is paused; co-op: a non-modal tray at the bottom with
-- the auto-pick timer, docs/DESIGN.md §2.5), reroll / skip / banish, the chest result (solo modal, co-op side panel)
-- and the victory vote. Cards show the item's icon, name, "NEW!" or the level and what it does; keys 1-4, R, K, B on
-- PC, gamepad selection moves between the cards. Card size follows the screen width (phones included).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local GuiService = game:GetService("GuiService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Weapons = require(Shared.Sim.Data.Weapons)
local Passives = require(Shared.Sim.Data.Passives)
local Stages = require(Shared.Sim.Data.Stages)
local Story = require(Shared.Sim.Data.Story)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)
local Icons = require(script.Parent.Icons)
local Device = require(script.Parent.Parent.Device)

local LevelUp = {}
local tr = Lang.tr

local gui: ScreenGui = nil :: any
local dim: Frame = nil :: any
local tray: Frame? = nil
local chestPanel: Frame? = nil
local victoryPanel: Frame? = nil
local stage: any = nil -- the run's land (victory text: outro, ending after the last land)
local command: (any) -> () = function(_) end
local offer: any = nil
local banishMode = false
local deadline: number? = nil
local timeNow: () -> number = os.clock
local timerLabel: TextLabel? = nil
local voteLabel: TextLabel? = nil
local voteEnd: number? = nil

function LevelUp.init(cmd, clock)
	command = cmd
	timeNow = clock
	gui = Kit.screen("EN_Cards", 5)
	dim = Kit.frame(gui, {
		BackgroundColor3 = Color3.fromRGB(8, 4, 16),
		BackgroundTransparency = 0.45,
		Size = UDim2.new(1, 0, 1, 80),
		Position = UDim2.fromOffset(0, -40),
		Visible = false,
		ZIndex = 0,
	})
end

-- name, tag line, description of an option
local function describe(o): (string, string, string)
	if o.kind == "weapon" then
		local d = Weapons.byId[o.id]
		if o.isNew then
			return tr(d.name), tr("NEU!"), tr(d.desc)
		end
		local lv = d.levels[o.level - 1]
		return tr(d.name), tr("Stufe {0}", o.level), if lv then tr(lv.t) else ""
	elseif o.kind == "passive" then
		local d = Passives.byId[o.id]
		return tr(d.name), if o.isNew then tr("NEU!") else tr("Stufe {0}", o.level), tr(d.desc)
	elseif o.kind == "gold" then
		return tr("{0} Gold", o.amount), "", tr("Alles ist ausgebaut – nimm Gold mit.")
	end
	return tr("Heiltrank"), "", tr("Stellt {0} Leben wieder her.", o.amount)
end

local function maxLevel(o): number
	if o.kind == "weapon" then
		local d = Weapons.byId[o.id]
		return if d then #d.levels + 1 else 8
	elseif o.kind == "passive" then
		local d = Passives.byId[o.id]
		return if d then d.max else 5
	end
	return 1
end

local function updateDim()
	dim.Visible = (offer ~= nil and offer.solo) or (chestPanel ~= nil and chestPanel:GetAttribute("solo") == true)
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
	updateDim()
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

local function card(parent: Instance, i: number, o, w: number, h: number, compact: boolean, keys: boolean): TextButton
	local name, tag, desc = describe(o)
	local isNew = o.isNew == true
	local b = Kit.button(parent, "", function()
		LevelUp.choose(i)
	end, {
		Size = UDim2.fromOffset(w, h),
		BackgroundColor3 = if banishMode then Color3.fromRGB(90, 24, 40) else Theme.panel2,
		AutoButtonColor = true,
		LayoutOrder = i,
	})
	local s = Instance.new("UIStroke")
	s.Color = if banishMode then Theme.bad elseif isNew then Theme.gold else Theme.stroke
	s.Thickness = if isNew then 2.5 else 1.5
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Parent = b
	local g = Instance.new("UIGradient")
	g.Rotation = 90
	g.Color = ColorSequence.new(Color3.new(1, 1, 1), Color3.fromRGB(150, 140, 170))
	g.Parent = b
	local icon = if compact then 40 else 60
	local kind = if o.kind == "weapon" or o.kind == "passive" then o.kind else o.kind
	Icons.tile(b, kind, o.id, icon, {
		Position = UDim2.new(0.5, 0, 0, 8),
		AnchorPoint = Vector2.new(0.5, 0),
	}, o.level, maxLevel(o))
	local y = icon + 12
	Kit.label(b, name, {
		Font = Theme.title,
		TextSize = if compact then 16 else 20,
		Size = UDim2.new(1, -10, 0, if compact then 18 else 24),
		Position = UDim2.fromOffset(5, y),
		TextTruncate = Enum.TextTruncate.AtEnd,
	})
	y += if compact then 18 else 24
	if tag ~= "" then
		Kit.label(b, tag, {
			Font = Theme.number,
			TextSize = if compact then 12 else 14,
			Size = UDim2.new(1, -10, 0, 16),
			Position = UDim2.fromOffset(5, y),
			TextColor3 = if isNew then Theme.gold else Theme.xp,
		})
		y += 16
	end
	Kit.label(b, desc, {
		TextSize = if compact then 12 else 14,
		Size = UDim2.new(1, -14, 1, -(y + 6)),
		Position = UDim2.fromOffset(7, y + 2),
		TextColor3 = Theme.dim,
		TextYAlignment = Enum.TextYAlignment.Top,
	})
	if keys then
		Kit.label(b, tostring(i), {
			Font = Theme.number,
			TextSize = 14,
			Size = UDim2.fromOffset(22, 22),
			Position = UDim2.fromOffset(6, 6),
			TextColor3 = Theme.dim,
		})
	end
	return b
end

function LevelUp.show(m, solo: boolean)
	LevelUp.close()
	offer = m
	offer.solo = solo
	deadline = m.deadline
	local n = #m.options
	local sz = Kit.uiSize(gui)
	local keys = not Device.touch()
	local compact = not solo
	-- card size: as large as fits the width
	local cw = math.floor(math.min(if compact then 190 else 240, (sz.X - 60 - (n - 1) * 10) / math.max(1, n)))
	local ch = if compact then 160 else 230
	local rowW = n * cw + (n - 1) * 10
	local hasActions = m.rerolls > 0 or m.skips > 0 or m.banishes > 0
	local f = Kit.panel(gui, {
		Size = UDim2.fromOffset(rowW + 24, ch + (if compact then 48 else 64) + (if hasActions then 52 else 0)),
		Position = if solo then UDim2.fromScale(0.5, 0.5) else UDim2.new(0.5, 0, 1, -8),
		AnchorPoint = if solo then Vector2.new(0.5, 0.5) else Vector2.new(0.5, 1),
		BackgroundTransparency = if solo then 0.05 else 0.25,
	})
	tray = f
	Kit.padding(f, 10)
	Kit.list(f, false, 8)
	timerLabel = Kit.label(f, if banishMode then tr("Verbannen") .. "?" else tr("Neue Stufe!"), {
		Font = Theme.title,
		TextSize = if compact then 20 else 26,
		Size = UDim2.new(1, 0, 0, if compact then 24 else 30),
		LayoutOrder = 1,
		TextColor3 = if banishMode then Theme.bad else Theme.gold,
		TextStrokeTransparency = 0.5,
	})
	local row = Kit.frame(f, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, ch), LayoutOrder = 2 })
	Kit.list(row, true, 10)
	local cards = {}
	for i, o in m.options do
		table.insert(cards, card(row, i, o, cw, ch, compact, keys))
	end
	for i, c in cards do
		c.NextSelectionLeft = cards[i - 1] or cards[#cards]
		c.NextSelectionRight = cards[i + 1] or cards[1]
	end
	local brow = Kit.frame(f, {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 44),
		LayoutOrder = 3,
		Visible = hasActions,
	})
	Kit.list(brow, true, 8)
	local function act(label: string, count: number, key: string, name: string)
		if count > 0 then
			Kit.button(brow, tr(label) .. " (" .. count .. ")" .. (if keys then " [" .. key .. "]" else ""), function()
				LevelUp.action(name)
			end, {
				Size = UDim2.fromOffset(if compact then 150 else 180, 40),
				TextSize = if compact then 14 else 16,
				BackgroundColor3 = if name == "banish" and banishMode then Theme.bad else Theme.panel,
			})
		end
	end
	act("Neu würfeln", m.rerolls, "R", "reroll")
	act("Überspringen", m.skips, "K", "skip")
	act("Verbannen", m.banishes, "B", "banish")
	if solo and cards[1] then
		GuiService.SelectedObject = cards[1]
	end
	updateDim()
end

-- chest result (solo: modal with Continue; co-op: side panel for 3.5 s)
function LevelUp.chest(res, solo: boolean)
	if chestPanel then
		chestPanel:Destroy()
	end
	local rows = #res.items + (if res.evolved then 1 else 0)
	local h = 120 + rows * 46 + (if solo then 54 else 0)
	local f = Kit.panel(gui, {
		Size = UDim2.fromOffset(360, h),
		Position = if solo then UDim2.fromScale(0.5, 0.5) else UDim2.new(1, -12, 0.5, 0),
		AnchorPoint = if solo then Vector2.new(0.5, 0.5) else Vector2.new(1, 0.5),
		BackgroundTransparency = if solo then 0.05 else 0.2,
	})
	f:SetAttribute("solo", solo)
	chestPanel = f
	Kit.padding(f, 10)
	Kit.list(f, false, 6)
	Kit.label(f, if res.evolved then tr("ENTWICKLUNG!") else tr("Truhe!"), {
		Font = Theme.title,
		TextSize = 30,
		TextColor3 = Theme.gold,
		Size = UDim2.new(1, 0, 0, 36),
		LayoutOrder = 1,
		TextStrokeTransparency = 0.4,
	})
	local function itemRow(order: number, kind: string, id: string, text: string, evo: boolean)
		local r = Kit.frame(f, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 40), LayoutOrder = order })
		Icons.tile(r, kind, id, 40, nil, nil, nil, evo)
		Kit.label(r, text, {
			Size = UDim2.new(1, -52, 1, 0),
			Position = UDim2.fromOffset(50, 0),
			TextSize = if evo then 18 else 16,
			Font = if evo then Theme.title else Theme.body,
			TextColor3 = if evo then Theme.gold else Theme.text,
			TextXAlignment = Enum.TextXAlignment.Left,
		})
	end
	if res.evolved then
		local w = Weapons.byId[res.evolved]
		itemRow(2, "weapon", res.evolved, tr(w.evo.name), true)
	end
	for i, o in res.items do
		local name = if o.kind == "weapon" then Weapons.byId[o.id].name else Passives.byId[o.id].name
		itemRow(2 + i, o.kind, o.id, tr(name) .. " – " .. tr("Stufe {0}", o.level), false)
	end
	Kit.label(f, tr("+{0} Gold", res.gold), {
		Font = Theme.title,
		TextSize = 20,
		TextColor3 = Theme.gold,
		Size = UDim2.new(1, 0, 0, 26),
		LayoutOrder = 50,
	})
	if solo then
		local b = Kit.button(f, tr("Weiter"), function()
			f:Destroy()
			chestPanel = nil
			updateDim()
			command({ op = "chestClose" })
		end, { LayoutOrder = 60 })
		GuiService.SelectedObject = b
	else
		task.delay(3.5, function()
			if chestPanel == f then
				f:Destroy()
				chestPanel = nil
			end
		end)
	end
	updateDim()
end

function LevelUp.closeChest()
	if chestPanel then
		chestPanel:Destroy()
		chestPanel = nil
	end
	updateDim()
end

function LevelUp.setStage(st)
	stage = st
end

-- victory: continue endless or finish (co-op: a vote with its timer); like the web game it tells the land's outro,
-- and after the last land the ending of the story
function LevelUp.victory(on: boolean, voteSeconds: number?)
	if not on then
		if victoryPanel then
			victoryPanel:Destroy()
			victoryPanel = nil
		end
		voteLabel = nil
		voteEnd = nil
		return
	end
	if voteSeconds then
		voteEnd = os.clock() + voteSeconds
	end
	if victoryPanel then
		return
	end
	local last = stage ~= nil and stage == Stages.list[#Stages.list]
	local story = ""
	if stage and stage.outro then
		story = tr(stage.outro)
	end
	if last then
		story ..= "\n" .. tr(Story.ending)
	end
	local storyH = if story == "" then 0 elseif last then 92 else 40
	local f = Kit.panel(gui, {
		Size = UDim2.fromOffset(460, 196 + storyH),
		Position = UDim2.fromScale(0.5, 0.45),
		AnchorPoint = Vector2.new(0.5, 0.5),
	})
	victoryPanel = f
	Kit.padding(f, 10)
	Kit.list(f, false, 8)
	Kit.label(
		f,
		"★ " .. tr(if last then "Die Nacht ist besiegt!" elseif stage then "Land befreit!" else "Sieg!") .. " ★",
		{
			Font = Theme.title,
			TextSize = 34,
			TextColor3 = Theme.gold,
			Size = UDim2.new(1, 0, 0, 46),
			LayoutOrder = 1,
			TextStrokeTransparency = 0.4,
			TextScaled = true,
		}
	)
	if story ~= "" then
		Kit.label(f, story, {
			TextSize = 14,
			TextWrapped = true,
			TextYAlignment = Enum.TextYAlignment.Top,
			Size = UDim2.new(1, 0, 0, storyH - 8),
			LayoutOrder = 2,
		})
	end
	voteLabel = Kit.label(f, tr("Weiter im Endlosmodus oder beenden?"), {
		TextSize = 15,
		TextColor3 = Theme.dim,
		Size = UDim2.new(1, 0, 0, 20),
		LayoutOrder = 3,
	})
	local row = Kit.frame(f, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 48), LayoutOrder = 4 })
	Kit.list(row, true, 12)
	local b = Kit.button(row, tr("Endlos weiter"), function()
		command({ op = "vote", endless = true })
	end, { Size = UDim2.fromOffset(200, 46) })
	Kit.button(row, tr("Beenden"), function()
		command({ op = "vote", endless = false })
	end, { Size = UDim2.fromOffset(160, 46), BackgroundColor3 = Theme.panel2 })
	GuiService.SelectedObject = b
end

function LevelUp.update()
	if deadline and timerLabel then
		local left = math.max(0, deadline - timeNow())
		timerLabel.Text = tr("Neue Stufe!") .. "  ⏱ " .. math.ceil(left) .. " s"
	end
	if voteEnd and voteLabel then
		voteLabel.Text = tr("Abstimmung: noch {0} s", math.ceil(math.max(0, voteEnd - os.clock())))
	end
end

return LevelUp
