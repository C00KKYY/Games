-- Combat parity with the web game (tools/ref-sim.js runs the same scenarios with the web code and the same scripted
-- random sequence; tests/lib/Parity.luau replays them with the Luau sim):
--   boss      16 bosses x heat 0/3, 32 s each from spawn (all skills incl. dash, summon, slam, nova, fan, lances,
--             rain scatter/flank/walk/stars/track, spiral, lanes x/fan3), digests every 0.1 s
--   ranged    spitter, cinder, moth, bell; plain/elite; before/after 4:00; 14 s each
--   weapon    9 weapons at level 1/4/8/evolved against 62 dummies, 8 s each
--   director  every land at heat 0/3/5, whole length + 30 s (waves, ranged gate and cap, elites, bosses, events,
--             countdown, surge); enemies stand still and vanish after 6 s
--   run       whole solo runs (Game.update vs Run.step: weapons, enemies, gems, coins, braziers, level-ups with the
--             first card, chests, the 0.45-s ramp); 6 mortal runs until death, 5 invulnerable runs of 400 s
-- Accepted: floating-point drift. sin/cos/atan2 of V8 and Luau differ in the last bit for a few arguments; crowds of
-- enemies pushing each other amplify that. A scenario may therefore end its exact agreement with a difference in a
-- position sum (never in a count, HP, XP, gold or level) after at least 10 s.
local T = require("./lib/T")
local Parity = require("./lib/Parity")

local suite = T.new("parity")
local ref = Parity.load()
local DRIFT = { [5] = true, [6] = true, [9] = true, [10] = true, [13] = true }
local RUN_DRIFT = { [1] = true, [2] = true, [9] = true, [10] = true }

for _, kind in { "boss", "ranged", "weapon" } do
	suite:test(kind .. " scenarios match the web game step by step", function()
		local n, drift = 0, 0
		for _, sc in ref.scenarios do
			if sc.kind == kind then
				n += 1
				local msg, field, diff, t = Parity.check(sc, ref.dt, ref.rec)
				if msg then
					T.ok(DRIFT[field] and diff < 1e-3 and t >= 10, msg)
					drift += 1
				end
			end
		end
		T.ok(n >= 16, "scenarios present")
		if drift > 0 then
			print(string.format("  (%s: %d of %d scenarios end in float drift after >= 10 s)", kind, drift, n))
		end
	end)
end

suite:test("director: waves, elites, bosses, events, countdown and surge match for every land and heat", function()
	local n = 0
	for _, sc in ref.scenarios do
		if sc.kind == "director" then
			n += 1
			local msg = Parity.checkDirector(sc, ref.dt)
			T.ok(msg == nil, msg)
		end
	end
	T.eq(n, 15)
end)

suite:test("whole solo runs match until death / 400 s or until float drift (>= 10 s)", function()
	local n = 0
	local held = {}
	for _, sc in ref.scenarios do
		if sc.kind == "run" then
			n += 1
			local msg, field, _diff, t = Parity.checkRun(sc, ref.dt, ref.rec)
			if msg then
				T.ok(RUN_DRIFT[field] and t >= 10, msg)
				table.insert(held, string.format("%s %.0f s", string.sub(sc.name, 5), t))
			end
		end
	end
	T.eq(n, 11)
	if #held > 0 then
		print("  (exact until drift: " .. table.concat(held, ", ") .. ")")
	end
end)

return suite
