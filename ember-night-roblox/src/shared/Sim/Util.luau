--!strict
-- Small pure helpers shared by the sim and the clients (web util.js).
local Rng = if script then require(script.Parent.Rng) else require("./Rng")

local Util = {}

Util.TAU = math.pi * 2
Util.DEG = math.pi / 180

function Util.clamp(v: number, a: number, b: number): number
	if v < a then
		return a
	elseif v > b then
		return b
	end
	return v
end

function Util.lerp(a: number, b: number, t: number): number
	return a + (b - a) * t
end

function Util.dist2(ax: number, ay: number, bx: number, by: number): number
	local dx, dy = ax - bx, ay - by
	return dx * dx + dy * dy
end

function Util.hypot(x: number, y: number): number
	return math.sqrt(x * x + y * y)
end

-- atan2 that matches JS Math.atan2 argument order (y, x)
Util.atan2 = math.atan2

local TWO32 = 4294967296
local imul = Rng.imul
local bxor, rshift = bit32.bxor, bit32.rshift

-- Deterministic hash for chunk decoration and braziers; identical results to web util.js hash2 (tested).
function Util.hash2(x: number, y: number, s: number?): number
	local v = x * 374761393 + y * 668265263 + (s or 0) * 2147483647
	local h = v % TWO32 -- JS `| 0` reinterpreted as uint32
	h = imul(bxor(h, rshift(h, 13)), 1274126177)
	h = bxor(h, rshift(h, 16))
	return h / TWO32
end

-- Fisher-Yates with the sim RNG
function Util.shuffle<T>(rng: any, a: { T }): { T }
	for i = #a, 2, -1 do
		local j = math.floor(rng:next() * i) + 1
		a[i], a[j] = a[j], a[i]
	end
	return a
end

-- JS Math.round (rounds .5 up, also for negatives)
function Util.round(v: number): number
	return math.floor(v + 0.5)
end

-- array helpers
function Util.indexOf<T>(t: { T }, v: T): number?
	for i, x in t do
		if x == v then
			return i
		end
	end
	return nil
end

function Util.removeSwap<T>(t: { T }, i: number)
	local n = #t
	t[i] = t[n]
	t[n] = nil
end

-- parse "#rrggbb" into 0..255 r, g, b
function Util.hex(c: string): (number, number, number)
	local r = tonumber(string.sub(c, 2, 3), 16) or 255
	local g = tonumber(string.sub(c, 4, 5), 16) or 255
	local b = tonumber(string.sub(c, 6, 7), 16) or 255
	return r, g, b
end

return Util
