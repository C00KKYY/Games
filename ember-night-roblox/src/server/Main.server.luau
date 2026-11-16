-- Server bootstrap: hub, remotes, profiles, run host, lobby (docs/DESIGN.md §3.1).
local Services = script.Parent.Services
local Net = require(Services.Net)
local Profiles = require(Services.Profiles)
local RunHost = require(Services.RunHost)
local Lobby = require(Services.Lobby)
local HubBuilder = require(script.Parent.World.HubBuilder)

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Version = require(ReplicatedStorage:WaitForChild("Shared").Version)

HubBuilder.build()
Net.init()
Profiles.init()
local deps = { Net = Net, Profiles = Profiles, RunHost = RunHost, Lobby = Lobby }
RunHost.init(deps)
Lobby.init(deps)

print(string.format("[%s %s] server ready", Version.name, Version.version))
