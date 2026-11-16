-- Device class for readability and budgets (docs/DESIGN.md §4.4, §5.1): phones get bigger enemy shots, thicker
-- telegraph outlines, fewer damage numbers and particles; layouts read the screen size.
local UserInputService = game:GetService("UserInputService")

local Device = {}

-- the current camera viewport (1280 x 720 when unknown)
function Device.viewport(): Vector2
	local cam = workspace.CurrentCamera
	local ok, vp = pcall(function()
		return cam and cam.ViewportSize
	end)
	if ok and vp and vp.X > 0 and vp.Y > 0 then
		return vp
	end
	return Vector2.new(1280, 720)
end

-- touch-first device (phone or tablet without keyboard)
function Device.touch(): boolean
	return UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
end

-- a small screen: phone (short side under 500 px)
function Device.phone(): boolean
	local vp = Device.viewport()
	return Device.touch() and math.min(vp.X, vp.Y) < 500
end

-- gamepad as the last input
function Device.gamepad(): boolean
	return UserInputService.GamepadEnabled
		and not UserInputService.TouchEnabled
		and not UserInputService.KeyboardEnabled
end

return Device
