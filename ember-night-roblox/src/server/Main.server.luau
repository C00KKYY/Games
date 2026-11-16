--!strict
-- Ember Night server bootstrap. Services (Net, Profiles, Lobby, RunHost, Replicator, Purchases, Passes, Policy)
-- are added in milestones R2 and R4 (docs/DESIGN.md §11).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Version = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Version"))

print(string.format("[EmberNight] server %s starting", Version.version))
