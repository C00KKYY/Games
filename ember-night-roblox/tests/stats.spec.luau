local T = require("./lib/T")
local Ref = require("./lib/Ref")
local Stats = require("../src/shared/Sim/Stats")

local suite = T.new("stats")
local g = Ref.load("golden")

suite:test("computeStats and refreshWeapon equal web", function()
	for _, b in g.stats do
		local s = Stats.compute(b.build.char, b.build.shop, b.build.passives)
		for k, v in b.stats do
			T.near(s[k], v, 1e-9, b.build.char .. " stat " .. k)
		end
		for _, w in b.weapons do
			local ww = { id = w.id, level = w.level, evo = w.evo }
			Stats.weapon(ww, s)
			for k, v in w.st do
				T.near(
					ww.st[k],
					v,
					1e-9,
					string.format("%s %s L%d evo=%s %s", b.build.char, w.id, w.level, tostring(w.evo), k)
				)
			end
		end
	end
end)

return suite
