local T = require("./lib/T")
local Rng = require("../src/shared/Sim/Rng")

local suite = T.new("rng")

suite:test("reproducible and seed-dependent", function()
	local a, b, c = Rng.new(42), Rng.new(42), Rng.new(43)
	local same, diff = true, false
	for _ = 1, 1000 do
		local x, y, z = a:u32(), b:u32(), c:u32()
		if x ~= y then
			same = false
		end
		if x ~= z then
			diff = true
		end
		T.ok(x >= 0 and x < 4294967296 and x == math.floor(x), "u32 range")
	end
	T.ok(same, "same seed -> same stream")
	T.ok(diff, "different seed -> different stream")
end)

suite:test("imul matches Math.imul", function()
	T.eq(Rng.imul(0xFFFFFFFF, 0xFFFFFFFF), 1)
	-- known value: Math.imul(0x7fffffff, 0x7fffffff) = 1 (unsigned 1)
	T.eq(Rng.imul(0x7fffffff, 0x7fffffff), 1)
	-- Math.imul(1274126177, 305419896) >>> 0 = 4135668600 (computed with node)
	T.eq(Rng.imul(1274126177, 305419896), 4135668600)
end)

suite:test("distributions", function()
	local r = Rng.new(7)
	local sum, n = 0, 20000
	local lo, hi = 1, 0
	for _ = 1, n do
		local v = r:next()
		sum += v
		lo = math.min(lo, v)
		hi = math.max(hi, v)
	end
	T.near(sum / n, 0.5, 0.01, "mean")
	T.ok(lo >= 0 and hi < 1)
	local counts = { 0, 0, 0, 0, 0, 0 }
	for _ = 1, 6000 do
		local i = r:int(1, 6)
		counts[i] += 1
	end
	for i = 1, 6 do
		T.ok(counts[i] > 850 and counts[i] < 1150, "int uniform " .. i .. ": " .. counts[i])
	end
	local w = { a = 0, b = 0 }
	for _ = 1, 10000 do
		local k = r:weighted({ { k = "a", w = 1 }, { k = "b", w = 3 } })
		w[k] += 1
	end
	T.near(w.b / 10000, 0.75, 0.02, "weighted")
	local pk = { 0, 0, 0 }
	for _ = 1, 3000 do
		local v = r:pick({ 1, 2, 3 })
		pk[v] += 1
	end
	T.ok(pk[1] > 900 and pk[3] > 900, "pick")
	for _ = 1, 1000 do
		local v = r:range(-2, 5)
		T.ok(v >= -2 and v < 5)
	end
end)

return suite
