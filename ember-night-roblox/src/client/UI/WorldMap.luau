-- World map (docs/DESIGN.md §2.3, web tpl_map): 5 lands with stars and lock state, the leader picks land and
-- night level (only what the leader's profile unlocked); others see the choice.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Stages = require(Shared.Sim.Data.Stages)
local Heat = require(Shared.Sim.Data.Heat)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

local Screen = { TITLE = Lang.key("Weltkarte") }
local tr = Lang.tr

function Screen.render(body: ScrollingFrame, msg, command: (any) -> (), _open)
	if not msg.isLeader then
		Kit.label(body, tr("Nur der Anführer wählt das Land."), { TextColor3 = Theme.dim, LayoutOrder = 0 })
	end
	for i, s in msg.stages do
		local st = Stages.list[i]
		local sel = s.id == msg.stage
		local row = Kit.panel(body, {
			Size = UDim2.new(1, -10, 0, 96),
			LayoutOrder = i,
			BackgroundColor3 = if sel then Theme.panel2 else Theme.panel,
		})
		Kit.padding(row, 8)
		Kit.label(row, tr("Land {0}: {1}", i, tr(st.name)) .. "   " .. string.rep("★", s.stars) .. string.rep("☆", 3 - s.stars), {
			Font = Theme.title,
			TextSize = 20,
			TextColor3 = if s.unlocked then Theme.text else Theme.dim,
			TextXAlignment = Enum.TextXAlignment.Left,
			Size = UDim2.new(1, -150, 0, 26),
		})
		local info = if s.unlocked
			then tr(st.intro)
			else tr("Befreie „{0}“, um „{1}“ freizuschalten.", tr(Stages.list[i - 1].name), tr(st.name))
		Kit.label(row, info, {
			TextSize = 13,
			TextColor3 = Theme.dim,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextYAlignment = Enum.TextYAlignment.Top,
			Size = UDim2.new(1, -150, 0, 48),
			Position = UDim2.fromOffset(0, 28),
		})
		if msg.isLeader and s.unlocked and not msg.running and not sel then
			Kit.button(row, tr("Wählen"), function()
				command({ op = "selectStage", stage = s.id, heat = math.min(msg.heat, s.maxHeat) })
			end, { Size = UDim2.fromOffset(130, 44), Position = UDim2.new(1, -130, 0, 16) })
		elseif sel then
			Kit.label(row, "✔ " .. tr("Gewählt"), {
				TextColor3 = Theme.good,
				Font = Theme.title,
				Size = UDim2.fromOffset(130, 44),
				Position = UDim2.new(1, -130, 0, 16),
			})
		end
	end
	-- night level of the chosen land
	local cur = nil
	for _, s in msg.stages do
		if s.id == msg.stage then
			cur = s
		end
	end
	local hrow = Kit.frame(body, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 50), LayoutOrder = 10 })
	Kit.list(hrow, true, 6)
	Kit.label(hrow, tr("Nachtstufe"), { Size = UDim2.fromOffset(130, 44), Font = Theme.title })
	for h = 0, #Heat.list - 1 do
		local allowed = cur ~= nil and h <= cur.maxHeat
		local b = Kit.button(hrow, if h == 0 then tr("Normal") else tostring(h), function()
			if msg.isLeader and allowed and not msg.running then
				command({ op = "selectStage", stage = msg.stage, heat = h })
			end
		end, { Size = UDim2.fromOffset(if h == 0 then 90 else 52, 44), TextSize = 16 })
		b.BackgroundColor3 = if h == msg.heat then Theme.primary elseif allowed then Theme.panel2 else Color3.fromRGB(30, 26, 36)
		b.TextColor3 = if allowed then Theme.text else Theme.dim
	end
	local hd = Heat.list[msg.heat + 1]
	if hd then
		Kit.label(body, tr("Gold ×{0}", Lang.fmtDec(hd.gold)), { TextColor3 = Theme.gold, LayoutOrder = 11 })
	end
end

return Screen
