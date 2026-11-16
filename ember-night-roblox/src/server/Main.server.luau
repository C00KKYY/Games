-- Server bootstrap: hub, remotes, profiles, passes, prices, purchases, run host, lobby (docs/DESIGN.md §3.1).
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Services = script.Parent.Services
local Net = require(Services.Net)
local Profiles = require(Services.Profiles)
local Passes = require(Services.Passes)
local ProductInfo = require(Services.ProductInfo)
local Purchases = require(Services.Purchases)
local Policy = require(Services.Policy)
local Meta = require(Services.Meta)
local RunHost = require(Services.RunHost)
local Lobby = require(Services.Lobby)
local HubBuilder = require(script.Parent.World.HubBuilder)

local Version = require(ReplicatedStorage:WaitForChild("Shared").Version)

HubBuilder.build()
Net.init()
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

print(string.format("[%s %s] server ready", Version.name, Version.version))
