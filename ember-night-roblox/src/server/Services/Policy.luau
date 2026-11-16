-- PolicyService lookup per player (docs/DESIGN.md §8). The game has no paid random items, no external links and no
-- trading, so nothing depends on the result yet; it is kept so later features can respect it. Failures are ignored.
local PolicyService = game:GetService("PolicyService")
local Players = game:GetService("Players")

local Policy = {}

local info: { [Player]: any } = {}

local function lookup(player: Player)
	local ok, res = pcall(function()
		return PolicyService:GetPolicyInfoForPlayerAsync(player)
	end)
	if ok and player.Parent then
		info[player] = res
	end
end

function Policy.get(player: Player): any
	return info[player]
end

function Policy.init()
	Players.PlayerAdded:Connect(lookup)
	for _, p in Players:GetPlayers() do
		task.spawn(lookup, p)
	end
end

function Policy.onLeave(player: Player)
	info[player] = nil
end

return Policy
