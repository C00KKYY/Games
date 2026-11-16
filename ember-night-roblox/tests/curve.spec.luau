local T = require("./lib/T")
local Ref = require("./lib/Ref")
local Curves = require("../src/shared/Sim/Curves")
local Util = require("../src/shared/Sim/Util")

local suite = T.new("curve")
local g = Ref.load("golden")

suite:test("hpCurve / hpCurveBridged equal web", function()
	for _, p in g.hpCurve do
		T.near(Curves.hpCurve(p[1]), p[2], 1e-9, "hpCurve " .. p[1])
	end
	for _, p in g.hpCurveBridged do
		T.near(Curves.hpCurveBridged(p[1]), p[2], 1e-9, "bridged " .. p[1])
	end
end)

suite:test("xpFor equals web", function()
	for _, p in g.xpFor do
		T.eq(Curves.xpFor(p[1]), p[2], "xpFor " .. p[1])
	end
end)

suite:test("hash2 equals web", function()
	for _, p in g.hash2 do
		T.near(Util.hash2(p[1], p[2], p[3]), p[4], 1e-15, "hash2 " .. p[1] .. "," .. p[2])
	end
end)

return suite
