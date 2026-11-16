-- Combat parity with the web game: 32 boss runs (16 bosses, heat 0 and 3), 16 ranged-enemy runs (4 types, elite or
-- not, before/after 4:00) and 36 weapon runs (9 weapons at level 1/4/8/evolved) are replayed with the same scripted
-- random sequence as tools/ref-sim.js ran them with the web code; the per-0.1-s digests (hero position and HP, enemy
-- count/positions/HP, enemy shots, telegraphs incl. their durations, hazards, hero shots) must agree.
-- Accepted: pure floating-point drift in crowded summons (Math.hypot vs sqrt differ in the last bit and the crowd's
-- separation amplifies it) – a first difference below 1e-3 px in a position sum after at least 10 s.
local T = require("./lib/T")
local Parity = require("./lib/Parity")

local suite = T.new("parity")
local ref = Parity.load()
local DRIFT_FIELDS = { [5] = true, [6] = true, [9] = true, [10] = true, [13] = true }

for _, kind in { "boss", "ranged", "weapon" } do
	suite:test(kind .. " scenarios match the web game step by step", function()
		local n, drift = 0, 0
		for _, sc in ref.scenarios do
			if sc.kind == kind then
				n += 1
				local msg, field, diff, t = Parity.check(sc, ref.dt, ref.rec)
				if msg then
					local ok = DRIFT_FIELDS[field] and diff < 1e-3 and t >= 10
					T.ok(ok, msg)
					drift += 1
				end
			end
		end
		T.ok(n >= 16, "scenarios present")
		if drift > 0 then
			print(string.format("  (%s: %d of %d scenarios with float drift after >= 10 s)", kind, drift, n))
		end
	end)
end

return suite
