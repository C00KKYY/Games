-- Client bootstrap (docs/DESIGN.md §3.1): starts the client application with the real remotes and binds its frame
-- update after the camera step.
local RunService = game:GetService("RunService")

local ClientNet = require(script.Parent.Net.ClientNet)
local App = require(script.Parent.App)

App.start(ClientNet)
RunService:BindToRenderStep("EmberNight", Enum.RenderPriority.Camera.Value + 1, App.frame)
