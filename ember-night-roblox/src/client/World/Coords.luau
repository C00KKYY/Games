-- Sim (world px, x/y on the ground) <-> Roblox studs (docs/DESIGN.md §0, §4.1): X = x * 0.1, Z = y * 0.1, Y up.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Tuning = require(ReplicatedStorage:WaitForChild("Shared").Config.Tuning)

local Coords = {}
local S = Tuning.STUDS_PER_PX
Coords.S = S

function Coords.v3(x: number, y: number, h: number?): Vector3
	return Vector3.new(x * S, h or 0, y * S)
end

function Coords.cf(x: number, y: number, h: number?): CFrame
	return CFrame.new(x * S, h or 0, y * S)
end

-- rotation about Y for a sim angle a (0 = +x, pi/2 = +y = +Z)
function Coords.yaw(a: number): CFrame
	return CFrame.Angles(0, -a, 0)
end

function Coords.color(hex: string?): Color3
	if type(hex) ~= "string" or #hex < 7 then
		return Color3.new(1, 1, 1)
	end
	return Color3.fromHex(hex)
end

return Coords
