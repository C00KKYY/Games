-- Achievements (docs/DESIGN.md §5.2, web tpl_ach): all 31 with their gold reward and hero unlocks.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Achievements = require(Shared.Sim.Data.Achievements)
local Cosmetics = require(Shared.Config.Cosmetics)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

local Screen = { TITLE = Lang.key("Erfolge") }
local tr = Lang.tr

-- free cosmetics by achievement id
local rewardCos = {}
for _, c in Cosmetics.list do
	local kind, ref = string.match(c.source, "^(%a+):(.+)$")
	if kind == "achievement" then
		rewardCos[ref] = c
	end
end

function Screen.render(body: ScrollingFrame, msg, _command, _open)
	local have = msg.profile.achievements or {}
	local n = 0
	for _, a in Achievements.list do
		if have[a.id] then
			n += 1
		end
	end
	Kit.label(body, tr("{0} von {1} erreicht", n, #Achievements.list), {
		Font = Theme.title,
		TextColor3 = Theme.gold,
		LayoutOrder = 0,
	})
	for i, a in Achievements.list do
		local done = have[a.id] == true
		local row = Kit.panel(body, { Size = UDim2.new(1, -10, 0, 58), LayoutOrder = i })
		Kit.padding(row, 6)
		Kit.label(row, (if done then "✔ " else "○ ") .. tr(a.name), {
			Font = Theme.title,
			TextSize = 17,
			TextColor3 = if done then Theme.good else Theme.text,
			TextXAlignment = Enum.TextXAlignment.Left,
			Size = UDim2.new(1, -170, 0, 22),
		})
		local extra = ""
		if a.unlock then
			extra = "  · " .. tr("Freigeschaltet: {0}", tr(a.unlock))
		end
		local c = rewardCos[a.id]
		if c then
			extra ..= "  · " .. tr("Aussehen") .. ": " .. tr(c.name)
		end
		Kit.label(row, tr(a.text) .. extra, {
			TextSize = 13,
			TextColor3 = Theme.dim,
			TextXAlignment = Enum.TextXAlignment.Left,
			Position = UDim2.fromOffset(0, 24),
			Size = UDim2.new(1, -170, 0, 20),
		})
		Kit.label(row, "+" .. Lang.fmtNum(a.gold) .. " " .. tr("Gold"), {
			TextColor3 = Theme.gold,
			Size = UDim2.fromOffset(160, 40),
			Position = UDim2.new(1, -160, 0, 2),
			TextXAlignment = Enum.TextXAlignment.Right,
		})
	end
end

return Screen
