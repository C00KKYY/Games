-- Skeleton smoke test: shared modules load under Lune and keep their documented values.
local T = require("./lib/T")
local Tuning = require("../src/shared/Config/Tuning")
local Version = require("../src/shared/Version")

local suite = T.new("smoke")

suite:test("tuning constants", function()
	T.eq(Tuning.STUDS_PER_PX, 0.1)
	T.near(Tuning.SIM_DT, 1 / Tuning.SIM_HZ)
	T.eq(Tuning.MAX_PLAYERS, 4)
	T.ok(Tuning.UR_MAX_BYTES <= 900, "unreliable packets must stay <= 900 bytes")
end)

suite:test("version", function()
	T.eq(Version.name, "Ember Night")
end)

suite:test("buffer and bit32 available (needed by Rng and Codec)", function()
	local b = buffer.create(4)
	buffer.writei16(b, 0, -1234)
	T.eq(buffer.readi16(b, 0), -1234)
	T.eq(bit32.bxor(5, 3), 6)
end)

return suite
