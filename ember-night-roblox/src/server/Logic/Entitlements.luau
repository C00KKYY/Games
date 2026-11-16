-- What a player may use (docs/DESIGN.md §7.1, §7.2): heroes (earned or through a pass), cosmetics (bought, earned by
-- achievement or through the collection pass), double gold. Pure: the server passes the profile and the set of
-- game pass keys it confirmed with MarketplaceService ({ [passKey] = true }).
-- server-only (ServerScriptService): shared modules come from ReplicatedStorage.Shared
local Shared = if script then game:GetService("ReplicatedStorage"):WaitForChild("Shared") else nil
local Products = if script then require(Shared.Config.Products) else require("../../shared/Config/Products")
local Cosmetics = if script then require(Shared.Config.Cosmetics) else require("../../shared/Config/Cosmetics")
local Profile = if script then require(Shared.Sim.Profile) else require("../../shared/Sim/Profile")

local Entitlements = {}

-- only passes that are configured count (an id of 0 never grants anything)
local function hasPass(passes: { [string]: boolean }?, key: string): boolean
	return passes ~= nil and passes[key] == true and Products.configured(key)
end

-- { [heroId] = true } for heroes unlocked through passes
function Entitlements.passHeroes(passes: { [string]: boolean }?): { [string]: boolean }
	local out = {}
	for _, it in Products.list do
		if it.kind == "pass" and it.heroes and hasPass(passes, it.key) then
			for _, hid in it.heroes do
				out[hid] = true
			end
		end
	end
	return out
end

function Entitlements.heroes(profile, passes: { [string]: boolean }?): { string }
	return Profile.unlockedHeroes(profile, Entitlements.passHeroes(passes))
end

function Entitlements.heroAllowed(profile, passes: { [string]: boolean }?, heroId: string): boolean
	return table.find(Entitlements.heroes(profile, passes), heroId) ~= nil
end

function Entitlements.gold2x(passes: { [string]: boolean }?): boolean
	for _, it in Products.list do
		if it.kind == "pass" and it.gold2x and hasPass(passes, it.key) then
			return true
		end
	end
	return false
end

-- may the player use this cosmetic?
function Entitlements.ownsCosmetic(profile, passes: { [string]: boolean }?, id: string): boolean
	local c = Cosmetics.byId[id]
	if not c then
		return false
	end
	local kind, ref = string.match(c.source, "^(%a+):(.+)$")
	if kind == "achievement" then
		return profile.achievements[ref] == true
	end
	if profile.cosmetics.owned[id] then
		return true
	end
	for _, it in Products.list do
		if it.kind == "pass" and it.allCosmetics and hasPass(passes, it.key) then
			return true
		end
	end
	return false
end

-- { [cosmeticId] = true }
function Entitlements.cosmetics(profile, passes: { [string]: boolean }?): { [string]: boolean }
	local out = {}
	for _, c in Cosmetics.list do
		if Entitlements.ownsCosmetic(profile, passes, c.id) then
			out[c.id] = true
		end
	end
	return out
end

-- equipped cosmetics that are still owned ({ skin = id?, fx = id?, trail = id? }); anything else is dropped
function Entitlements.equipped(profile, passes: { [string]: boolean }?)
	local out = {}
	for _, slot in Cosmetics.SLOTS do
		local id = profile.cosmetics.equipped[slot]
		local c = id and Cosmetics.byId[id]
		if c and c.slot == slot and Entitlements.ownsCosmetic(profile, passes, id) then
			out[slot] = id
		end
	end
	return out
end

-- is the item already owned (passes and stored cosmetics cannot be bought twice)?
function Entitlements.ownsItem(profile, passes: { [string]: boolean }?, key: string): boolean
	local it = Products.byKey[key]
	if not it then
		return false
	end
	if it.kind == "pass" then
		if passes ~= nil and passes[key] == true then
			return true
		end
		-- a pass that would add nothing counts as owned (never sell Robux for nothing): hero passes whose heroes
		-- are all unlocked already (achievement or another pass), the collection pass when every cosmetic is owned
		if it.heroes and #it.heroes > 0 then
			local have = Entitlements.heroes(profile, passes)
			for _, hid in it.heroes do
				if not table.find(have, hid) then
					return false
				end
			end
			return true
		end
		if it.allCosmetics and not it.gold2x then
			for _, c in Cosmetics.list do
				if
					string.match(c.source, "^achievement:") == nil
					and not Entitlements.ownsCosmetic(profile, passes, c.id)
				then
					return false
				end
			end
			return true
		end
		return false
	end
	if it.grant and it.grant.cosmetic then
		return Entitlements.ownsCosmetic(profile, passes, it.grant.cosmetic)
	end
	return false
end

return Entitlements
