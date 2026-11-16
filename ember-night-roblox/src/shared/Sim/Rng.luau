--!strict
-- Deterministic RNG for the simulation (docs/DESIGN.md §0): xoshiro128** on 32-bit integers (bit32), seeded with
-- splitmix32. Only 32-bit operations and small exact multiplications (x5, x9), so results are identical in Roblox and
-- Lune. The sim never uses math.random.

local Rng = {}
Rng.__index = Rng

export type Rng = typeof(setmetatable({} :: { s0: number, s1: number, s2: number, s3: number }, Rng))

local band, bxor, lrotate, lshift, rshift = bit32.band, bit32.bxor, bit32.lrotate, bit32.lshift, bit32.rshift
local TWO32 = 4294967296

-- 32-bit multiplication (Math.imul semantics, unsigned result)
local function imul(a: number, b: number): number
	local lo = a % 65536
	local hi = (a - lo) / 65536
	return (lo * b + ((hi * b) % 65536) * 65536) % TWO32
end
Rng.imul = imul

local function splitmix(state: number): (number, number)
	state = (state + 0x9E3779B9) % TWO32
	local z = state
	z = imul(bxor(z, rshift(z, 16)), 0x85EBCA6B)
	z = imul(bxor(z, rshift(z, 13)), 0xC2B2AE35)
	z = bxor(z, rshift(z, 16))
	return state, z
end

function Rng.new(seed: number): Rng
	local st = math.floor(seed) % TWO32
	local a, b, c, d
	st, a = splitmix(st)
	st, b = splitmix(st)
	st, c = splitmix(st)
	st, d = splitmix(st)
	if a == 0 and b == 0 and c == 0 and d == 0 then
		a = 1
	end
	return setmetatable({ s0 = a, s1 = b, s2 = c, s3 = d }, Rng)
end

-- next uint32
function Rng.u32(self: Rng): number
	local s0, s1, s2, s3 = self.s0, self.s1, self.s2, self.s3
	local result = (lrotate((s1 * 5) % TWO32, 7) * 9) % TWO32
	local t = lshift(s1, 9)
	s2 = bxor(s2, s0)
	s3 = bxor(s3, s1)
	s1 = bxor(s1, s2)
	s0 = bxor(s0, s3)
	s2 = bxor(s2, t)
	s3 = lrotate(s3, 11)
	self.s0, self.s1, self.s2, self.s3 = s0, s1, s2, s3
	return result
end

-- float in [0, 1)
function Rng.next(self: Rng): number
	return self:u32() / TWO32
end

-- float in [a, b)  (web rand)
function Rng.range(self: Rng, a: number, b: number): number
	return a + self:u32() / TWO32 * (b - a)
end

-- integer in [a, b] (web randi)
function Rng.int(self: Rng, a: number, b: number): number
	return math.floor(a + self:u32() / TWO32 * (b - a + 1))
end

-- random element of an array (web pick)
function Rng.pick<T>(self: Rng, t: { T }): T
	return t[math.floor(self:u32() / TWO32 * #t) + 1]
end

-- entries: array of { k = value, w = weight } (web weightedPick)
function Rng.weighted(self: Rng, entries: { any }): any
	local sum = 0
	for _, e in entries do
		sum += e.w
	end
	local r = self:u32() / TWO32 * sum
	for _, e in entries do
		r -= e.w
		if r <= 0 then
			return e.k
		end
	end
	return entries[#entries].k
end

-- state snapshot (for determinism checks)
function Rng.state(self: Rng): string
	return string.format("%08x%08x%08x%08x", self.s0, self.s1, self.s2, self.s3)
end

-- band kept for callers that need it
Rng.band = band

return Rng
