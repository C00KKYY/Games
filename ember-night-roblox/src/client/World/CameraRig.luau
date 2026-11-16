-- Arena camera (docs/DESIGN.md §4.1): scriptable, above and behind the followed hero, pitch 58 deg, FOV 40, never
-- rotates; distance grows on narrow screens so the 128 x 72 stud sim view fits; critically damped follow; shake.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Tuning = require(ReplicatedStorage:WaitForChild("Shared").Config.Tuning)
local Coords = require(script.Parent.Coords)

local CameraRig = {}

local active = false
local pos = Vector3.zero
local vel = Vector3.zero
local shakeAmt, shakeT = 0, 0
local zoom = 1
local rng = Random.new()

function CameraRig.setActive(on: boolean)
	local cam = workspace.CurrentCamera
	active = on
	if on then
		cam.CameraType = Enum.CameraType.Scriptable
		cam.FieldOfView = Tuning.CAM_FOV
	else
		cam.CameraType = Enum.CameraType.Custom
		cam.FieldOfView = 70
	end
end

function CameraRig.isActive(): boolean
	return active
end

function CameraRig.setZoom(z: number)
	zoom = math.clamp(z, 0.7, 1.3)
end

function CameraRig.snap(x: number, y: number)
	pos = Coords.v3(x, y)
	vel = Vector3.zero
end

function CameraRig.shake(amount: number)
	shakeAmt = math.max(shakeAmt, amount)
	shakeT = 0.25
end

-- distance so that the sim view width (2 * VIEW_HW px) fits horizontally at the ground plane
local function distance(cam: Camera): number
	local vp = cam.ViewportSize
	local aspect = if vp.Y > 0 then vp.X / vp.Y else 16 / 9
	local vfov = math.rad(Tuning.CAM_FOV)
	local hfov = 2 * math.atan(math.tan(vfov / 2) * aspect)
	local needW = 2 * Tuning.VIEW_HW * Tuning.STUDS_PER_PX
	local needH = 2 * Tuning.VIEW_HH * Tuning.STUDS_PER_PX
	local dW = needW / 2 / math.tan(hfov / 2)
	local dH = needH / 2 / math.tan(vfov / 2) * math.sin(math.rad(Tuning.CAM_PITCH))
	return math.max(Tuning.CAM_DIST * 0.8, dW, dH) * zoom
end

function CameraRig.update(dt: number, x: number, y: number)
	if not active then
		return
	end
	local cam = workspace.CurrentCamera
	local target = Coords.v3(x, y)
	-- critically damped spring, half-life 0.08 s
	local omega = math.log(2) / 0.08 * 1.5
	local diff = pos - target
	local exp = math.exp(-omega * dt)
	local temp = (vel + diff * omega) * dt
	vel = (vel - temp * omega) * exp
	pos = target + (diff + temp) * exp
	if (pos - target).Magnitude > 60 then
		pos = target
		vel = Vector3.zero
	end
	local pitch = math.rad(Tuning.CAM_PITCH)
	local d = distance(cam)
	local eye = pos + Vector3.new(0, math.sin(pitch) * d, math.cos(pitch) * d)
	local cf = CFrame.lookAt(eye, pos)
	if shakeT > 0 then
		shakeT -= dt
		local k = math.max(0, shakeT / 0.25) * shakeAmt * 0.04
		cf *= CFrame.new(rng:NextNumber(-k, k), rng:NextNumber(-k, k), 0)
		if shakeT <= 0 then
			shakeAmt = 0
		end
	end
	cam.CFrame = cf
end

return CameraRig
