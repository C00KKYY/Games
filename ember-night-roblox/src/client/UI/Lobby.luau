-- Party panel in the hub (docs/DESIGN.md §2.2, §2.3): gold and stars, the party with leader crown and ready state,
-- the own hero and the chosen land (buttons open the Heroes / World map screens), Ready / Start, start countdown.
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
local open: (string) -> () = function(_) end
local last: any = nil

function Lobby.init(cmd: (any) -> (), openScreen: (string) -> ())
	command = cmd
	open = openScreen
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
		Size = UDim2.fromOffset(330, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Position = UDim2.fromOffset(16, 16),
	})
	root = r
	Kit.padding(r, 10)
	Kit.list(r, false, 6)
	Kit.label(r, "Ember Night", {
		Font = Theme.title,
		TextSize = 30,
		Size = UDim2.new(1, 0, 0, 34),
		TextColor3 = Theme.primary,
		LayoutOrder = 1,
	})
	local view = msg.profile or {}
	Kit.label(r, "● " .. Lang.fmtNum(view.gold or 0) .. "   ★ " .. tostring(view.stars or 0), {
		TextColor3 = Theme.gold,
		Font = Theme.number,
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
				.. (if h then tr(h.name) else m.hero)
				.. (if m.ready then "  ✔" else "")
		)
	end
	Kit.label(r, tr("Gruppe") .. " (" .. #msg.members .. "/4)\n" .. table.concat(party, "\n"), {
		Size = UDim2.new(1, 0, 0, 24 + 20 * #party),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		LayoutOrder = 3,
	})
	local h = me and Heroes.byId[me.hero]
	local hrow = Kit.frame(r, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 44), LayoutOrder = 4 })
	Kit.label(hrow, tr("Held") .. ": " .. (if h then tr(h.name) else "?"), {
		Size = UDim2.new(1, -120, 1, 0),
		TextXAlignment = Enum.TextXAlignment.Left,
		Font = Theme.title,
	})
	Kit.button(hrow, tr("Ändern"), function()
		open("heroes")
	end, {
		Size = UDim2.fromOffset(110, 40),
		Position = UDim2.new(1, -110, 0, 2),
		BackgroundColor3 = Theme.panel2,
		TextSize = 16,
	})
	local srow = Kit.frame(r, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 44), LayoutOrder = 5 })
	Kit.label(
		srow,
		stageName(msg.stage) .. " · " .. (if msg.heat > 0 then tr("Nachtstufe {0}", msg.heat) else tr("Normal")),
		{
			Size = UDim2.new(1, -120, 1, 0),
			TextXAlignment = Enum.TextXAlignment.Left,
		}
	)
	Kit.button(srow, if msg.isLeader then tr("Wählen") else tr("Ansehen"), function()
		open("map")
	end, {
		Size = UDim2.fromOffset(110, 40),
		Position = UDim2.new(1, -110, 0, 2),
		BackgroundColor3 = Theme.panel2,
		TextSize = 16,
	})
	local brow = Kit.frame(r, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 48), LayoutOrder = 6 })
	Kit.list(brow, true, 10)
	if msg.running then
		Kit.label(brow, tr("Ein Lauf ist im Gang – du spielst den nächsten mit."), { Size = UDim2.new(1, 0, 0, 44) })
	else
		if #msg.members > 1 then
			Kit.button(brow, if me and me.ready then tr("Nicht bereit") else tr("Bereit"), function()
				command({ op = "ready", on = not (me and me.ready) })
			end, { BackgroundColor3 = Theme.panel2, Size = UDim2.fromOffset(150, 44) })
		end
		if msg.isLeader then
			Kit.button(brow, tr("Starten"), function()
				command({ op = "start" })
			end, { Size = UDim2.fromOffset(150, 44) })
		else
			Kit.label(brow, tr("Der Anführer startet."), { TextColor3 = Theme.dim, Size = UDim2.fromOffset(150, 44) })
		end
	end
	if msg.countdown then
		Kit.label(
			r,
			tr("Lauf beginnt in {0} …", math.ceil(msg.countdown)),
			{ TextColor3 = Theme.primary, LayoutOrder = 7 }
		)
	end
end

function Lobby.rerender()
	if last then
		Lobby.render(last)
	end
end

return Lobby
