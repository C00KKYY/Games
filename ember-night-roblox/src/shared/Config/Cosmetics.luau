-- Cosmetics (docs/DESIGN.md §7.1, §7.4): hero skins (palettes for every hero), weapon effect colours and trails.
-- Visual only. Paid ones are sold as stored developer products (Config/Products.luau, or all of them with the
-- collection pass); free ones are earned by achievements. Pure data + validate() (Lune test cosmetics.spec).
local Cosmetics = {}

export type Cosmetic = {
	id: string,
	slot: string, -- "skin" | "fx" | "trail"
	name: string, -- German text key
	source: string, -- "product:<key>" | "achievement:<id>"
	body: string?, -- skin: main colour
	accent: string?, -- skin: head/trim colour
	colors: { string }?, -- fx: one colour, or several cycled (prism)
	color: string?, -- trail
}

Cosmetics.SLOTS = { "skin", "fx", "trail" }

-- stylua: ignore
local list: { Cosmetic } = {
	{ id = "skin_ashen", slot = "skin", name = "Aschgrau", source = "product:skin_ashen", body = "#8f8a99", accent = "#e2ddd6" },
	{ id = "skin_frost", slot = "skin", name = "Frostglanz", source = "product:skin_frost", body = "#8fdcff", accent = "#effbff" },
	{ id = "skin_nightbloom", slot = "skin", name = "Nachtblüte", source = "product:skin_nightbloom", body = "#8a5cff", accent = "#ffb3f2" },
	{ id = "skin_gilded", slot = "skin", name = "Vergoldet", source = "achievement:stars15", body = "#ffcf4a", accent = "#fff1b8" },
	{ id = "skin_dawn", slot = "skin", name = "Morgenrot", source = "achievement:night", body = "#ffb07a", accent = "#fff0d6" },
	{ id = "fx_emerald", slot = "fx", name = "Smaragd", source = "product:fx_emerald", colors = { "#4dffa6" } },
	{ id = "fx_azure", slot = "fx", name = "Azur", source = "product:fx_azure", colors = { "#5cc4ff" } },
	{ id = "fx_solar", slot = "fx", name = "Sonnenglanz", source = "product:fx_solar", colors = { "#fff09a" } },
	{ id = "fx_prism", slot = "fx", name = "Prisma", source = "product:fx_prism",
		colors = { "#5cc4ff", "#4dffa6", "#fff09a", "#c08cff" } },
	{ id = "trail_frost", slot = "trail", name = "Raureif", source = "product:trail_frost", color = "#bdf2ff" },
	{ id = "trail_star", slot = "trail", name = "Sternenstaub", source = "product:trail_star", color = "#fff3a8" },
	{ id = "trail_shadow", slot = "trail", name = "Schatten", source = "product:trail_shadow", color = "#8a72d6" },
	{ id = "trail_ember", slot = "trail", name = "Glutspur", source = "achievement:win", color = "#ffa040" },
}

Cosmetics.list = list
Cosmetics.byId = {} :: { [string]: Cosmetic }
for _, c in list do
	Cosmetics.byId[c.id] = c
end

-- "#rrggbb" -> r, g, b in 0..1 (nil when malformed)
function Cosmetics.parseHex(s: any): (number?, number?, number?)
	if type(s) ~= "string" or not string.match(s, "^#%x%x%x%x%x%x$") then
		return nil, nil, nil
	end
	local r = tonumber(string.sub(s, 2, 3), 16) :: number
	local g = tonumber(string.sub(s, 4, 5), 16) :: number
	local b = tonumber(string.sub(s, 6, 7), 16) :: number
	return r / 255, g / 255, b / 255
end

-- hue in degrees (0..360), saturation (HSV) and relative luminance (sRGB)
function Cosmetics.hsl(r: number, g: number, b: number): (number, number, number)
	local mx, mn = math.max(r, g, b), math.min(r, g, b)
	local d = mx - mn
	local h = 0
	if d > 0 then
		if mx == r then
			h = 60 * (((g - b) / d) % 6)
		elseif mx == g then
			h = 60 * ((b - r) / d + 2)
		else
			h = 60 * ((r - g) / d + 4)
		end
	end
	local s = if mx > 0 then d / mx else 0
	local function lin(c: number): number
		return if c <= 0.04045 then c / 12.92 else ((c + 0.055) / 1.055) ^ 2.4
	end
	local lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
	return h, s, lum
end

-- readability rules (§7.4): no player effect or trail in the enemy-shot hue family (#ff3d5a, hue ~351°),
-- no skin that is near-black on the darkest ground
Cosmetics.ENEMY_HUE = 351
Cosmetics.HUE_GAP = 25 -- degrees an effect colour must stay away from ENEMY_HUE (when saturated)
Cosmetics.MIN_SKIN_LUM = 0.12 -- relative luminance

local function hueDist(a: number, b: number): number
	local d = math.abs(a - b) % 360
	return math.min(d, 360 - d)
end

-- returns a list of problems (empty when everything is fine); validProducts / validAchievements are id sets
function Cosmetics.validate(validProducts: { [string]: any }?, validAchievements: { [string]: any }?): { string }
	local errs = {}
	local function err(c: Cosmetic, msg: string)
		table.insert(errs, c.id .. ": " .. msg)
	end
	local function effectColor(c: Cosmetic, hex: string?)
		local r, g, b = Cosmetics.parseHex(hex)
		if not r then
			err(c, "bad colour " .. tostring(hex))
			return
		end
		local h, s = Cosmetics.hsl(r, g :: number, b :: number)
		if s > 0.35 and hueDist(h, Cosmetics.ENEMY_HUE) < Cosmetics.HUE_GAP then
			err(c, "colour " .. tostring(hex) .. " looks like an enemy shot")
		end
	end
	local seen = {}
	for _, c in list do
		if seen[c.id] then
			err(c, "duplicate id")
		end
		seen[c.id] = true
		if not table.find(Cosmetics.SLOTS, c.slot) then
			err(c, "bad slot")
		end
		if string.sub(c.id, 1, #c.slot + 1) ~= c.slot .. "_" then
			err(c, "id must start with its slot")
		end
		local kind, ref = string.match(c.source, "^(%a+):(.+)$")
		if kind == "product" then
			if validProducts and not validProducts[ref] then
				err(c, "unknown product " .. tostring(ref))
			end
		elseif kind == "achievement" then
			if validAchievements and not validAchievements[ref] then
				err(c, "unknown achievement " .. tostring(ref))
			end
		else
			err(c, "bad source")
		end
		if c.slot == "skin" then
			for _, hex in { c.body, c.accent } do
				local r, g, b = Cosmetics.parseHex(hex)
				if not r then
					err(c, "bad colour " .. tostring(hex))
				else
					local _, _, lum = Cosmetics.hsl(r, g :: number, b :: number)
					if lum < Cosmetics.MIN_SKIN_LUM then
						err(c, "colour " .. tostring(hex) .. " too dark")
					end
				end
			end
		elseif c.slot == "fx" then
			if type(c.colors) ~= "table" or #c.colors == 0 then
				err(c, "no colours")
			else
				for _, hex in c.colors do
					effectColor(c, hex)
				end
			end
		elseif c.slot == "trail" then
			effectColor(c, c.color)
		end
	end
	return errs
end

return Cosmetics
