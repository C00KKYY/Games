-- "Second Ember" while downed, fallen or in the last chance (docs/DESIGN.md §2.8, §7.3): a button that uses a stored
-- revive token, or (product configured, no token) one that asks the server to open the purchase prompt. The server
-- decides what is offered; the player must press the button himself (no automatic prompts, §7.4).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Kit = require(script.Parent.Kit)

local ReviveOffer = {}
local tr = Lang.tr

local gui: ScreenGui = nil :: any
local holder: Frame = nil :: any
local command: (any) -> () = function(_) end

function ReviveOffer.init(cmd: (any) -> ())
	command = cmd
	gui = Kit.screen("EN_Revive", 7)
	holder = Kit.frame(gui, {
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(420, 60),
		Position = UDim2.fromScale(0.5, 0.62),
		AnchorPoint = Vector2.new(0.5, 0),
	})
	Kit.list(holder, true, 8)
end

function ReviveOffer.show(m)
	Kit.clear(holder)
	if m.use then
		Kit.button(holder, tr("Zweite Glut einsetzen ({0})", m.tokens), function()
			command({ op = "useRevive" })
		end, { Size = UDim2.fromOffset(320, 52), TextSize = 20 })
	elseif m.buy and m.price then
		local b = Kit.button(holder, tr("Zweite Glut") .. " – R$ " .. tostring(m.price), function()
			command({ op = "buy", key = "revive" })
		end, { Size = UDim2.fromOffset(320, 52), TextSize = 20 })
		b.BackgroundColor3 = Color3.fromRGB(0, 162, 90)
	end
end

function ReviveOffer.hide()
	if holder then
		Kit.clear(holder)
	end
end

return ReviveOffer
