local T = require("./lib/T")
local Ref = require("./lib/Ref")
local Profile = require("../src/shared/Sim/Profile")
local Forge = require("../src/shared/Sim/Data/Forge")

local suite = T.new("profile")
local g = Ref.load("golden")

suite:test("forge price and refund equal web values", function()
	for _, c in g.shopPrice do
		local p = { shop = c.shop }
		for i, it in Forge.list do
			T.eq(Profile.forgePrice(p, it), c.prices[i], it.id)
		end
	end
	for _, c in g.refund do
		T.eq(Profile.forgeRefundValue(c.shop), c.value)
	end
end)

suite:test("default, sanitize, migrate", function()
	local d = Profile.default()
	T.eq(d.gold, 0)
	T.eq(#d.chars, 2)
	local bad = Profile.sanitize({
		gold = -5,
		shop = { might = 99, nope = 2 },
		chars = { "kael", "kael", "zzz" },
		stats = { kills = "x", runs = 3 },
		stages = { graveyard = 2, mars = 1 },
		settings = { lang = "fr", sfx = false, camZoom = 9 },
		receipts = { ["abc"] = 123 },
	})
	T.eq(bad.gold, 0)
	T.eq(bad.shop.might, 5, "clamped to max")
	T.eq(bad.shop.nope, nil)
	T.eq(#bad.chars, 3, "aron, mira + kael once")
	T.eq(bad.stats.kills, 0)
	T.eq(bad.stats.runs, 3)
	T.eq(bad.stages.graveyard, 2)
	T.eq(bad.stages.mars, nil)
	T.eq(bad.settings.lang, nil)
	T.eq(bad.settings.sfx, false)
	T.eq(bad.settings.camZoom, 1.3)
	T.eq(bad.receipts.abc, 123)
	T.eq(Profile.migrate(nil).v, 1)
end)

suite:test("stage helpers", function()
	local p = Profile.default()
	T.eq(Profile.stageStars(p, "graveyard"), 0)
	T.ok(Profile.stageUnlocked(p, 1))
	T.ok(not Profile.stageUnlocked(p, 2))
	T.eq(Profile.stageMaxHeat(p, "graveyard"), 0)
	p.stages.graveyard = 0
	T.ok(Profile.stageUnlocked(p, 2))
	T.eq(Profile.stageStars(p, "graveyard"), 1)
	p.stages.graveyard = 3
	T.eq(Profile.stageStars(p, "graveyard"), 3)
	T.eq(Profile.stageMaxHeat(p, "graveyard"), 4)
	T.eq(Profile.totalStars(p), 3)
end)

suite:test("forge buy and refund", function()
	local p = Profile.default()
	p.gold = 1000
	T.ok(Profile.forgeBuy(p, "might"))
	T.eq(p.gold, 880)
	T.eq(p.shop.might, 1)
	local price2 = Profile.forgePrice(p, Forge.list[1])
	T.eq(price2, 250, "120 * 2 * 1.05 rounded to 5")
	T.ok(not Profile.forgeBuy(p, "nope"))
	T.eq(Profile.forgeRefund(p), 120)
	T.eq(p.gold, 1000)
	T.eq(p.shop.might, nil)
end)

suite:test("unlocked heroes: earned or pass", function()
	local p = Profile.default()
	local u = Profile.unlockedHeroes(p, nil)
	T.eq(#u, 2)
	u = Profile.unlockedHeroes(p, { nyx = true })
	T.eq(#u, 3)
end)

return suite
