-- Hub panel (R1, simple): party list with leader and ready state, hero pick (unlocked heroes), land + night level
-- (leader), Ready / Start, language. Full screens follow in R3 (docs/DESIGN.md §5.2).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Heroes = require(Shared.Sim.Data.Heroes)
local Stages = require(Shared.Sim.Data.Stages)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

local Lobby = {}
local tr = Lang.tr

local gui: ScreenGui? = nil
local root: Frame? = nil
local command: (any) -> () = function(_) end
local last: any = nil

function Lobby.init(cmd: (any) -> ())
	command = cmd
	gui = Kit.screen("EN_Lobby", 1)
end

function Lobby.setVisible(on: boolean)
	if gui then
		gui.Enabled = on
	end
end

local function stageName(id: string): string
	for _, s in Stages.list do
		if s.id == id then
			return tr(s.name)
		end
	end
	return id
end

function Lobby.render(msg)
	last = msg
	if not gui then
		return
	end
	if root then
		root:Destroy()
	end
	local me = nil
	for _, m in msg.members do
		if m.userId == msg.you then
			me = m
		end
	end
	local r = Kit.panel(gui, {
		Size = UDim2.fromOffset(520, 470),
		Position = UDim2.new(0, 16, 0.5, -235),
	})
	root = r
	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0, 10)
	pad.PaddingLeft = UDim.new(0, 12)
	pad.PaddingRight = UDim.new(0, 12)
	pad.Parent = r
	Kit.list(r, false, 6)
	Kit.label(r, "Ember Night", { Font = Theme.title, TextSize = 30, Size = UDim2.new(1, 0, 0, 34), TextColor3 = Theme.primary, LayoutOrder = 1 })
	local gold = msg.profile and msg.profile.gold or 0
	Kit.label(r, tr("Gold") .. ": " .. Lang.fmtNum(gold) .. "   ★ " .. tostring(msg.profile and msg.profile.stars or 0), {
		TextColor3 = Theme.gold,
		LayoutOrder = 2,
	})
	-- party
	local party = {}
	for _, m in msg.members do
		local h = Heroes.byId[m.hero]
		table.insert(
			party,
			(if m.leader then "♛ " else "• ")
				.. m.name
				.. " – "
				.. (if h then h.name else m.hero)
				.. (if m.ready then "  ✔" else "")
		)
	end
	Kit.label(r, tr("Gruppe") .. ":\n" .. table.concat(party, "\n"), {
		Size = UDim2.new(1, 0, 0, 22 + 20 * #party),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		LayoutOrder = 3,
	})
	-- heroes
	Kit.label(r, tr("Held wählen"), { Font = Theme.title, LayoutOrder = 4 })
	local hrow = Kit.frame(r, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 92), LayoutOrder = 5 })
	local grid = Instance.new("UIGridLayout")
	grid.CellSize = UDim2.fromOffset(92, 42)
	grid.CellPadding = UDim2.fromOffset(6, 6)
	grid.Parent = hrow
	for _, id in Heroes.ORDER do
		local h = Heroes.byId[id]
		local unlocked = table.find(msg.heroes, id) ~= nil
		local b = Kit.button(hrow, h.name, function()
			if unlocked then
				command({ op = "selectHero", hero = id })
			end
		end)
		b.TextSize = 16
		b.BackgroundColor3 = if me and me.hero == id then Theme.primary elseif unlocked then Theme.panel2 else Color3.fromRGB(30, 26, 36)
		b.TextColor3 = if unlocked then Theme.text else Theme.dim
		if not unlocked then
			b.Text = "🔒 " .. h.name
		end
	end
	-- land + heat
	Kit.label(r, tr("Land") .. ": " .. stageName(msg.stage) .. " · " .. (if msg.heat > 0 then tr("Nachtstufe {0}", msg.heat) else tr("Normal")), {
		Font = Theme.title,
		LayoutOrder = 6,
	})
	if msg.isLeader and not msg.running then
		local srow = Kit.frame(r, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 44), LayoutOrder = 7 })
		Kit.list(srow, true, 4)
		for _, s in msg.stages do
			local b = Kit.button(srow, tostring(table.find(Stages.ORDER, s.id)) .. string.rep("★", s.stars), function()
				if s.unlocked then
					command({ op = "selectStage", stage = s.id, heat = 0 })
				end
			end, { Size = UDim2.fromOffset(84, 40), TextSize = 16 })
			b.BackgroundColor3 = if s.id == msg.stage then Theme.primary elseif s.unlocked then Theme.panel2 else Color3.fromRGB(30, 26, 36)
		end
		local cur = nil
		for _, s in msg.stages do
			if s.id == msg.stage then
				cur = s
			end
		end
		local hrow2 = Kit.frame(r, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 44), LayoutOrder = 8 })
		Kit.list(hrow2, true, 8)
		Kit.button(hrow2, "−", function()
			command({ op = "selectStage", stage = msg.stage, heat = math.max(0, msg.heat - 1) })
		end, { Size = UDim2.fromOffset(60, 40) })
		Kit.label(hrow2, tr("Nachtstufe") .. " " .. msg.heat, { Size = UDim2.fromOffset(160, 40) })
		Kit.button(hrow2, "+", function()
			local maxH = if cur then cur.maxHeat else 0
			command({ op = "selectStage", stage = msg.stage, heat = math.min(maxH, msg.heat + 1) })
		end, { Size = UDim2.fromOffset(60, 40) })
	end
	local brow = Kit.frame(r, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 48), LayoutOrder = 9 })
	Kit.list(brow, true, 10)
	if msg.running then
		Kit.label(brow, tr("Ein Lauf ist im Gang – du spielst den nächsten mit."), { Size = UDim2.fromOffset(480, 44) })
	else
		Kit.button(brow, if me and me.ready then tr("Nicht bereit") else tr("Bereit"), function()
			command({ op = "ready", on = not (me and me.ready) })
		end, { BackgroundColor3 = Theme.panel2 })
		if msg.isLeader then
			Kit.button(brow, tr("Starten"), function()
				command({ op = "start" })
			end)
		end
	end
	if msg.countdown then
		Kit.label(r, tr("Lauf beginnt in {0} …", math.ceil(msg.countdown)), { TextColor3 = Theme.primary, LayoutOrder = 10 })
	end
	local lrow = Kit.frame(r, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 36), LayoutOrder = 11 })
	Kit.list(lrow, true, 8)
	for _, l in { "de", "en" } do
		Kit.button(lrow, string.upper(l), function()
			Lang.setLang(l)
			command({ op = "lang", lang = l })
		end, {
			Size = UDim2.fromOffset(60, 32),
			TextSize = 14,
			BackgroundColor3 = if Lang.get() == l then Theme.primary else Theme.panel2,
		})
	end
end

function Lobby.rerender()
	if last then
		Lobby.render(last)
	end
end

return Lobby
