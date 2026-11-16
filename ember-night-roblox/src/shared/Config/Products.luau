-- Robux products and game passes (docs/DESIGN.md §7.1). Pure data + lookups, shared by server and client.
--
-- HOW TO CONFIGURE: create the developer products and game passes in the Creator Hub (experience → Monetization),
-- then paste each id into `id` below and rebuild. An item whose id is 0 is hidden everywhere and the server refuses
-- to prompt or grant it. `price` is only a suggestion for the Creator Hub; the shop always shows the live price from
-- MarketplaceService (fetched by the server).
--
-- kind = "product" (developer product, granted through ProcessReceipt) | "pass" (game pass, ownership checked live)
-- grant (products): gold = n | revive = n (tokens) | cosmetic = cosmetic id (stored, non-consumable)
-- pass effects:     gold2x = true | heroes = { heroId, ... } | allCosmetics = true
-- tab = shop tab ("gold", "heroes", "cosmetics", "passes"); name = German text key (Lang.tr)
local Products = {}

export type Item = {
	key: string,
	kind: string,
	id: number,
	price: number,
	tab: string,
	name: string,
	desc: string,
	grant: { gold: number?, revive: number?, cosmetic: string? }?,
	gold2x: boolean?,
	heroes: { string }?,
	allCosmetics: boolean?,
	order: number,
}

local HERO_PASSES = { "kael", "sela", "brom", "nyx", "eira", "lio", "ignis" }
Products.HERO_PASSES = HERO_PASSES

-- stylua: ignore
local list: { Item } = {
	{ key = "revive", kind = "product", id = 0, price = 25, tab = "none", name = "Zweite Glut",
		desc = "Steh mit halber Kraft wieder auf (einmal pro Lauf)", grant = { revive = 1 } },
	{ key = "gold_s", kind = "product", id = 0, price = 49, tab = "gold", name = "Goldbeutel",
		desc = "+{0} Gold", grant = { gold = 1000 } },
	{ key = "gold_m", kind = "product", id = 0, price = 129, tab = "gold", name = "Goldtruhe",
		desc = "+{0} Gold", grant = { gold = 3500 } },
	{ key = "gold_l", kind = "product", id = 0, price = 299, tab = "gold", name = "Goldschatz",
		desc = "+{0} Gold", grant = { gold = 10000 } },
	{ key = "pass_gold2x", kind = "pass", id = 0, price = 199, tab = "passes", name = "Doppeltes Gold",
		desc = "Doppeltes Gold aus jedem Lauf (nicht für Erfolge und gekauftes Gold)", gold2x = true },
	{ key = "pass_heroes_all", kind = "pass", id = 0, price = 399, tab = "heroes", name = "Alle Helden",
		desc = "Schaltet alle sieben Helden frei", heroes = HERO_PASSES },
	{ key = "pass_cosmetics", kind = "pass", id = 0, price = 349, tab = "passes", name = "Sammlung",
		desc = "Alle käuflichen Aussehen, Waffenfarben und Spuren (auch künftige)", allCosmetics = true },
	{ key = "skin_ashen", kind = "product", id = 0, price = 79, tab = "cosmetics", name = "Aussehen: Aschgrau",
		desc = "Farben für alle Helden", grant = { cosmetic = "skin_ashen" } },
	{ key = "skin_frost", kind = "product", id = 0, price = 79, tab = "cosmetics", name = "Aussehen: Frostglanz",
		desc = "Farben für alle Helden", grant = { cosmetic = "skin_frost" } },
	{ key = "skin_nightbloom", kind = "product", id = 0, price = 79, tab = "cosmetics", name = "Aussehen: Nachtblüte",
		desc = "Farben für alle Helden", grant = { cosmetic = "skin_nightbloom" } },
	{ key = "fx_emerald", kind = "product", id = 0, price = 59, tab = "cosmetics", name = "Waffenfarbe: Smaragd",
		desc = "Färbt deine Waffeneffekte", grant = { cosmetic = "fx_emerald" } },
	{ key = "fx_azure", kind = "product", id = 0, price = 59, tab = "cosmetics", name = "Waffenfarbe: Azur",
		desc = "Färbt deine Waffeneffekte", grant = { cosmetic = "fx_azure" } },
	{ key = "fx_solar", kind = "product", id = 0, price = 59, tab = "cosmetics", name = "Waffenfarbe: Sonnenglanz",
		desc = "Färbt deine Waffeneffekte", grant = { cosmetic = "fx_solar" } },
	{ key = "fx_prism", kind = "product", id = 0, price = 99, tab = "cosmetics", name = "Waffenfarbe: Prisma",
		desc = "Wechselnde Farben für deine Waffeneffekte", grant = { cosmetic = "fx_prism" } },
	{ key = "trail_frost", kind = "product", id = 0, price = 49, tab = "cosmetics", name = "Spur: Raureif",
		desc = "Eine Spur hinter deinem Helden", grant = { cosmetic = "trail_frost" } },
	{ key = "trail_star", kind = "product", id = 0, price = 49, tab = "cosmetics", name = "Spur: Sternenstaub",
		desc = "Eine Spur hinter deinem Helden", grant = { cosmetic = "trail_star" } },
	{ key = "trail_shadow", kind = "product", id = 0, price = 49, tab = "cosmetics", name = "Spur: Schatten",
		desc = "Eine Spur hinter deinem Helden", grant = { cosmetic = "trail_shadow" } },
}

-- one pass per hero that is normally earned by an achievement
for i, hid in HERO_PASSES do
	table.insert(list, 6 + i, {
		key = "pass_hero_" .. hid,
		kind = "pass",
		id = 0,
		price = 99,
		tab = "heroes",
		name = "Held freischalten",
		desc = "Schaltet den Helden sofort frei (auch durch seinen Erfolg erreichbar)",
		heroes = { hid },
	} :: any)
end

for i, it in list do
	it.order = i
end

Products.list = list
Products.byKey = {} :: { [string]: Item }
for _, it in list do
	Products.byKey[it.key] = it
end

-- the item behind a key when it is configured (id > 0), else nil
function Products.get(key: string): Item?
	local it = Products.byKey[key]
	if it and it.id > 0 then
		return it
	end
	return nil
end

function Products.configured(key: string): boolean
	return Products.get(key) ~= nil
end

-- developer product id -> item (configured products only)
function Products.byProductId(id: number): Item?
	for _, it in list do
		if it.kind == "product" and it.id > 0 and it.id == id then
			return it
		end
	end
	return nil
end

-- game pass id -> item (configured passes only)
function Products.byPassId(id: number): Item?
	for _, it in list do
		if it.kind == "pass" and it.id > 0 and it.id == id then
			return it
		end
	end
	return nil
end

-- the product that sells a cosmetic (nil for free cosmetics)
function Products.forCosmetic(cosmeticId: string): Item?
	for _, it in list do
		if it.grant and it.grant.cosmetic == cosmeticId then
			return it
		end
	end
	return nil
end

-- set ids at runtime (Lune tests only; real ids are written into the list above)
function Products.setIds(ids: { [string]: number })
	for key, id in ids do
		local it = Products.byKey[key]
		assert(it, "unknown product key " .. key)
		it.id = id
	end
end

return Products
