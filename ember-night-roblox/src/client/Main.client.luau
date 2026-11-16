--!strict
-- Ember Night client bootstrap. Net, input, world renderers, UI and audio are added in R2-R4 (docs/DESIGN.md §11).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Version = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Version"))

print(string.format("[EmberNight] client %s starting", Version.version))
