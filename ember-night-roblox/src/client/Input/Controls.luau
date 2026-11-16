-- Input (docs/DESIGN.md §5.4): the move vector comes from Roblox's PlayerModule control module (keyboard, touch
-- thumbstick, gamepad) - the camera never rotates, so x = mv.X and y = mv.Z. Fallback: WASD/arrows via
-- UserInputService. Actions are bound with ContextActionService only while they are relevant.
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local ContextActionService = game:GetService("ContextActionService")

local Controls = {}

local controlModule: any = nil
local actions: { [string]: (string) -> () } = {}

local function loadControlModule()
	local ok, pm = pcall(function()
		local ps = Players.LocalPlayer:WaitForChild("PlayerScripts")
		return require(ps:WaitForChild("PlayerModule", 10) :: any)
	end)
	if ok and pm then
		local ok2, controls = pcall(function()
			return pm:GetControls()
		end)
		if ok2 then
			controlModule = controls
		end
	end
end

local function keyboardVector(): (number, number)
	local x, y = 0, 0
	if UserInputService:IsKeyDown(Enum.KeyCode.W) or UserInputService:IsKeyDown(Enum.KeyCode.Up) then
		y -= 1
	end
	if UserInputService:IsKeyDown(Enum.KeyCode.S) or UserInputService:IsKeyDown(Enum.KeyCode.Down) then
		y += 1
	end
	if UserInputService:IsKeyDown(Enum.KeyCode.A) or UserInputService:IsKeyDown(Enum.KeyCode.Left) then
		x -= 1
	end
	if UserInputService:IsKeyDown(Enum.KeyCode.D) or UserInputService:IsKeyDown(Enum.KeyCode.Right) then
		x += 1
	end
	return x, y
end

-- move vector in sim axes (length <= 1)
function Controls.move(): (number, number)
	local x, y = 0, 0
	if controlModule then
		local ok, mv = pcall(function()
			return controlModule:GetMoveVector()
		end)
		if ok and typeof(mv) == "Vector3" then
			x, y = mv.X, mv.Z
		end
	end
	if x == 0 and y == 0 then
		x, y = keyboardVector()
	end
	local l = math.sqrt(x * x + y * y)
	if l > 1 then
		x, y = x / l, y / l
	end
	return x, y
end

-- bind an action (name -> handler) with keys/buttons; handler gets the name on key press
function Controls.bind(name: string, handler: (string) -> (), ...: Enum.KeyCode)
	actions[name] = handler
	ContextActionService:BindAction("EN_" .. name, function(_, state)
		if state == Enum.UserInputState.Begin then
			handler(name)
			return Enum.ContextActionResult.Sink
		end
		return Enum.ContextActionResult.Pass
	end, false, ...)
end

function Controls.unbind(name: string)
	if actions[name] then
		actions[name] = nil
		ContextActionService:UnbindAction("EN_" .. name)
	end
end

function Controls.init()
	task.spawn(loadControlModule)
end

return Controls
