--!strict
-- Enemy HP curve and XP curve (web game.js hpCurve, hpCurveBridged, xpFor).
local Curves = {}

function Curves.hpCurve(m: number): number
	local q = math.max(0, m - 3)
	return 1 + 0.12 * m + 0.012 * m * m + 0.22 * q + 0.125 * q * q
end

local HP_BRIDGE_A, HP_BRIDGE_B = 1.25, 4
function Curves.hpCurveBridged(m: number): number
	local h = Curves.hpCurve(m)
	if m <= HP_BRIDGE_A or m >= HP_BRIDGE_B then
		return h
	end
	local a, b = Curves.hpCurve(HP_BRIDGE_A), Curves.hpCurve(HP_BRIDGE_B)
	return math.max(h, a * math.pow(b / a, (m - HP_BRIDGE_A) / (HP_BRIDGE_B - HP_BRIDGE_A)))
end

local XP_EARLY = { 6, 11, 17, 24, 32, 42, 53, 66, 80, 95 }
function Curves.xpFor(level: number): number
	if level <= #XP_EARLY then
		return XP_EARLY[level]
	end
	if level < 20 then
		return 5 + (level - 1) * 10
	end
	if level < 40 then
		return 200 + (level - 20) * 28
	end
	return 760 + (level - 40) * 40
end

return Curves
