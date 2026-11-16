-- Server bootstrap (docs/DESIGN.md §3.1): hub, remotes, then every service (Services/Boot.luau).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Net = require(script.Parent.Services.Net)
local Boot = require(script.Parent.Services.Boot)
local HubBuilder = require(script.Parent.World.HubBuilder)

local Version = require(ReplicatedStorage:WaitForChild("Shared").Version)

HubBuilder.build()
Net.init()
Boot.start(Net)

print(string.format("[%s %s] server ready", Version.name, Version.version))
