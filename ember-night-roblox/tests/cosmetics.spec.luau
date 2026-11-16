-- Cosmetics and entitlements (Config/Cosmetics.luau, Shared/Server/Entitlements.luau, docs/DESIGN.md §7.1-§7.4).
local T = require("./lib/T")
local Ids = require("./lib/Ids")
local Cosmetics = require("../src/shared/Config/Cosmetics")
local Products = require("../src/shared/Config/Products")
local Entitlements = require("../src/shared/Server/Entitlements")
local Profile = require("../src/shared/Sim/Profile")
local Achievements = require("../src/shared/Sim/Data/Achievements")
local Heroes = require("../src/shared/Sim/Data/Heroes")

local suite = T.new("cosmetics")

local function sets()
	local prod, ach = {}, {}
	for _, it in Products.list do
		prod[it.key] = true
	end
	for _, a in Achievements.list do
		ach[a.id] = true
	end
	return prod, ach
end

suite:test("validate: all cosmetics readable and referencing real products/achievements", function()
	local prod, ach = sets()
	local errs = Cosmetics.validate(prod, ach)
	T.eq(#errs, 0, table.concat(errs, "; "))
end)

suite:test("validate catches enemy-shot colours, near-black skins and bad sources", function()
	local prod, ach = sets()
	local bad = {
		{ id = "fx_bad", slot = "fx", name = "x", source = "product:fx_bad", colors = { "#ff3d5a" } },
		{ id = "trail_bad", slot = "trail", name = "x", source = "achievement:nope", color = "#ff2040" },
		{ id = "skin_bad", slot = "skin", name = "x", source = "product:skin_ashen", body = "#101010", accent = "#ffffff" },
	}
	for _, c in bad do
		table.insert(Cosmetics.list, c)
	end
	local errs = Cosmetics.validate(prod, ach)
	for _ = 1, #bad do
		table.remove(Cosmetics.list)
	end
	local text = table.concat(errs, "\n")
	T.ok(string.find(text, "fx_bad: colour #ff3d5a looks like an enemy shot", 1, true), text)
	T.ok(string.find(text, "fx_bad: unknown product", 1, true), text)
	T.ok(string.find(text, "trail_bad: colour #ff2040 looks like an enemy shot", 1, true), text)
	T.ok(string.find(text, "trail_bad: unknown achievement nope", 1, true), text)
	T.ok(string.find(text, "skin_bad: colour #101010 too dark", 1, true), text)
	T.eq(#Cosmetics.validate(prod, ach), 0, "list restored")
end)

suite:test("every paid cosmetic has exactly one product and vice versa", function()
	for _, c in Cosmetics.list do
		local kind, ref = string.match(c.source, "^(%a+):(.+)$")
		if kind == "product" then
			local it = Products.forCosmetic(c.id)
			T.ok(it, c.id)
			T.eq((it :: any).key, ref, c.id)
		else
			T.eq(Products.forCosmetic(c.id), nil, c.id .. " is free")
		end
	end
	for _, it in Products.list do
		if it.grant and it.grant.cosmetic then
			T.ok(Cosmetics.byId[it.grant.cosmetic], it.key)
		end
	end
end)

suite:test("hero passes cover exactly the heroes that are otherwise earned", function()
	local earned = {}
	for _, id in Heroes.ORDER do
		if Heroes.byId[id].unlock then
			table.insert(earned, id)
		end
	end
	T.eq(table.concat(Products.HERO_PASSES, ","), table.concat(earned, ","))
	for _, hid in Products.HERO_PASSES do
		T.ok(Products.byKey["pass_hero_" .. hid], hid)
	end
end)

suite:test("passes count only when configured; heroes, gold2x, collection", function()
	local p = Profile.default()
	local owned = { pass_hero_kael = true, pass_gold2x = true, pass_cosmetics = true }
	T.eq(#Entitlements.heroes(p, owned), 2, "ids 0: passes grant nothing")
	T.ok(not Entitlements.gold2x(owned))
	T.ok(not Entitlements.ownsCosmetic(p, owned, "trail_star"))
	Ids.with(Ids.all(), function()
		T.eq(#Entitlements.heroes(p, owned), 3)
		T.ok(Entitlements.heroAllowed(p, owned, "kael"))
		T.ok(not Entitlements.heroAllowed(p, owned, "sela"))
		T.ok(Entitlements.heroAllowed(p, { pass_heroes_all = true }, "ignis"))
		T.eq(#Entitlements.heroes(p, { pass_heroes_all = true }), 9)
		T.ok(Entitlements.gold2x(owned))
		T.ok(Entitlements.ownsCosmetic(p, owned, "trail_star"), "collection pass")
		T.ok(not Entitlements.ownsCosmetic(p, owned, "skin_gilded"), "achievement cosmetics are not in the pass")
		T.ok(Entitlements.ownsItem(p, owned, "pass_gold2x"))
		T.ok(Entitlements.ownsItem(p, owned, "skin_frost"), "covered by the collection")
		T.ok(not Entitlements.ownsItem(p, {}, "skin_frost"))
		T.ok(not Entitlements.ownsItem(p, owned, "gold_s"), "consumables are never owned")
	end)
end)

suite:test("earned heroes and cosmetics, equipped items that are no longer owned are dropped", function()
	local p = Profile.default()
	table.insert(p.chars, "lio")
	T.ok(Entitlements.heroAllowed(p, nil, "lio"))
	T.ok(not Entitlements.ownsCosmetic(p, nil, "trail_ember"))
	p.achievements.win = true
	T.ok(Entitlements.ownsCosmetic(p, nil, "trail_ember"))
	p.cosmetics.owned.skin_frost = true
	p.cosmetics.equipped = { skin = "skin_frost", trail = "trail_ember", fx = "fx_prism" }
	local eq = Entitlements.equipped(p, nil)
	T.eq(eq.skin, "skin_frost")
	T.eq(eq.trail, "trail_ember")
	T.eq(eq.fx, nil, "not owned")
	local all = Entitlements.cosmetics(p, nil)
	T.ok(all.skin_frost and all.trail_ember and not all.fx_prism)
end)

return suite
