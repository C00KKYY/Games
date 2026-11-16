local T = require("./lib/T")
local RateLimit = require("../src/shared/Server/RateLimit")
local Validate = require("../src/shared/Server/Validate")

local suite = T.new("ratelimit")

suite:test("token bucket", function()
	local rl = RateLimit.new(30, 30)
	local ok = 0
	for _ = 1, 100 do
		if rl:allow("p", 0) then
			ok += 1
		end
	end
	T.eq(ok, 30, "burst")
	T.ok(not rl:allow("p", 0.01))
	T.ok(rl:allow("p", 0.1), "refills at 30/s")
	T.ok(rl:allow("q", 0), "per key")
	local n = 0
	for i = 1, 300 do
		if rl:allow("p", 1 + i / 100) then
			n += 1
		end
	end
	T.ok(n <= 31 + 30 * 3 + 1, "about 30/s sustained: " .. n)
end)

suite:test("command validation", function()
	T.eq(Validate.command({ op = "pick", i = 2 }).i, 2)
	T.eq(Validate.command({ op = "pick", i = 7 }), nil)
	T.eq(Validate.command({ op = "pick", i = 1.5 }), nil)
	T.eq(Validate.command({ op = "pick" }), nil)
	T.eq(Validate.command({ op = "nuke" }), nil)
	T.eq(Validate.command("x"), nil)
	T.eq(Validate.command({ op = "selectHero", hero = "nyx" }).hero, "nyx")
	T.eq(Validate.command({ op = "selectHero", hero = "zed" }), nil)
	T.eq(Validate.command({ op = "selectStage", stage = "ruins", heat = 3 }).heat, 3)
	T.eq(Validate.command({ op = "selectStage", stage = "ruins", heat = 9 }), nil)
	T.eq(Validate.command({ op = "vote", endless = "yes" }), nil)
	local c = Validate.command({ op = "reroll", extra = { 1, 2 } })
	T.eq(c.extra, nil, "unknown fields dropped")
end)

return suite
