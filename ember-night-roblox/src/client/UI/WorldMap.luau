-- World map (docs/DESIGN.md §2.3, web tpl_map): 5 lands with stars and lock state, the leader picks land and
-- night level (only what the leader's profile unlocked); others see the choice.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Stages = require(Shared.Sim.Data.Stages)
local Heat = require(Shared.Sim.Data.Heat)
local Story = require(Shared.Sim.Data.Story)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

local Screen = { TITLE = Lang.key("Weltkarte") }
local tr = Lang.tr

function Screen.render(body: ScrollingFrame, msg, command: (any) -> (), _open)
	-- the story's premise until the first star (web: map premise); each land's intro is in its row
	if (msg.profile and msg.profile.stars or 0) == 0 then
		Kit.label(body, tr(Story.premise), {
			TextSize = 14,
			TextColor3 = Theme.dim,
			TextWrapped = true,
			Size = UDim2.new(1, -10, 0, 40),
			LayoutOrder = -1,
		})
	end
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
		-- land badge: ground colour with a speckle, the number in the middle
		local badge = Kit.frame(row, {
			Size = UDim2.fromOffset(64, 64),
			Position = UDim2.fromOffset(0, 8),
			BackgroundColor3 = Color3.fromHex(st.ground.base),
		})
		local bc = Instance.new("UICorner")
		bc.CornerRadius = UDim.new(0.5, 0)
		bc.Parent = badge
		local bs = Instance.new("UIStroke")
		bs.Color = if sel then Theme.primary elseif s.unlocked then Color3.fromHex(st.ground.grass) else Theme.stroke
		bs.Thickness = if sel then 3 else 2
		bs.Parent = badge
		local spk = Kit.frame(badge, {
			Size = UDim2.fromScale(0.42, 0.3),
			Position = UDim2.fromScale(0.16, 0.56),
			BackgroundColor3 = Color3.fromHex(st.ground.speckle[1]),
		})
		local sc = Instance.new("UICorner")
		sc.CornerRadius = UDim.new(0.5, 0)
		sc.Parent = spk
		Kit.label(badge, if s.unlocked then tostring(i) else "🔒", {
			Size = UDim2.fromScale(1, 1),
			Font = Theme.title,
			TextSize = 26,
			TextStrokeTransparency = 0.3,
		})
		local text = Kit.frame(row, {
			BackgroundTransparency = 1,
			Size = UDim2.new(1, -76, 1, 0),
			Position = UDim2.fromOffset(76, 0),
		})
		Kit.label(
			text,
			tr("Land {0}: {1}", i, tr(st.name)) .. "   " .. string.rep("★", s.stars) .. string.rep("☆", 3 - s.stars),
			{
				Font = Theme.title,
				TextSize = 20,
				TextColor3 = if s.unlocked then Theme.text else Theme.dim,
				TextXAlignment = Enum.TextXAlignment.Left,
				Size = UDim2.new(1, -150, 0, 26),
			}
		)
		local info = if s.unlocked
			then tr(st.intro)
			else tr("Befreie „{0}“, um „{1}“ freizuschalten.", tr(Stages.list[i - 1].name), tr(st.name))
		Kit.label(text, info, {
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
		b.BackgroundColor3 = if h == msg.heat
			then Theme.primary
			elseif allowed then Theme.panel2
			else Color3.fromRGB(30, 26, 36)
		b.TextColor3 = if allowed then Theme.text else Theme.dim
	end
	local hd = Heat.list[msg.heat + 1]
	if hd then
		Kit.label(body, tr("Gold ×{0}", Lang.fmtDec(hd.gold)), { TextColor3 = Theme.gold, LayoutOrder = 11 })
	end
end

return Screen
