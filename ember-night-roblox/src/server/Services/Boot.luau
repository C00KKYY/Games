-- Wires the server services together (docs/DESIGN.md §3.1). Main.server.luau calls Boot.start with the real Net
-- service; the Lune smoke test (tests/server.spec.luau) calls it with a recording fake.
local Players = game:GetService("Players")

local Services = script.Parent
local Profiles = require(Services.Profiles)
local Passes = require(Services.Passes)
local ProductInfo = require(Services.ProductInfo)
local Purchases = require(Services.Purchases)
local Policy = require(Services.Policy)
local Meta = require(Services.Meta)
local RunHost = require(Services.RunHost)
local Lobby = require(Services.Lobby)

local Boot = {}

function Boot.start(Net)
	local deps = {
		Net = Net,
		Profiles = Profiles,
		Passes = Passes,
		ProductInfo = ProductInfo,
		Purchases = Purchases,
		Meta = Meta,
		RunHost = RunHost,
		Lobby = Lobby,
	}
	Meta.init(deps)
	RunHost.init(deps)
	Lobby.init(deps)
	Passes.init(deps)
	Purchases.init(deps)
	ProductInfo.init()
	Policy.init()
	Profiles.init() -- last: loading profiles fires the callbacks registered above

	-- leaving: the run books the player's results first, then the profile is saved and released
	Players.PlayerRemoving:Connect(function(player)
		RunHost.onLeave(player)
		Lobby.onLeave(player)
		Purchases.onLeave(player)
		Passes.onLeave(player)
		Policy.onLeave(player)
		Profiles.release(player)
	end)
	return deps
end

return Boot
