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

suite:test("hub and purchase commands are validated", function()
	T.eq(Validate.command({ op = "forgeBuy", id = "might" }).id, "might")
	T.eq(Validate.command({ op = "forgeBuy", id = "gold" }), nil)
	T.eq(Validate.command({ op = "equip", slot = "trail", id = "trail_star" }).id, "trail_star")
	T.eq(Validate.command({ op = "equip", slot = "trail", id = "" }).id, "")
	T.eq(Validate.command({ op = "equip", slot = "hat", id = "" }), nil)
	T.eq(Validate.command({ op = "equip", slot = "skin", id = "skin_x" }), nil)
	T.eq(Validate.command({ op = "setting", key = "sfx", value = false }).value, false)
	T.eq(Validate.command({ op = "setting", key = "camZoom", value = 0 / 0 }), nil, "NaN")
	T.eq(Validate.command({ op = "setting", key = "gold", value = 1 }), nil)
	T.eq(Validate.command({ op = "buy", key = "gold_s" }).key, "gold_s")
	T.eq(Validate.command({ op = "buy", key = "free_gold" }), nil)
	T.eq(Validate.command({ op = "buy", key = 12345 }), nil, "no raw ids from clients")
	T.ok(Validate.command({ op = "useRevive" }))
	T.eq(Validate.command({ op = "revive" }), nil, "the sim's revive op is server-only")
	T.eq(Validate.command({ op = "holdLast", on = true }), nil)
end)

return suite
