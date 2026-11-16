-- Display helpers shared by the hub screens: product and cosmetic names, price buttons, unlock conditions.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Products = require(Shared.Config.Products)
local Cosmetics = require(Shared.Config.Cosmetics)
local Heroes = require(Shared.Sim.Data.Heroes)
local Achievements = require(Shared.Sim.Data.Achievements)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

local Names = {}
local tr = Lang.tr

local achById = {}
for _, a in Achievements.list do
	achById[a.id] = a
end
Names.achById = achById

-- "Held freischalten: Kael", "Goldbeutel", ...
function Names.product(key: string): string
	local it = Products.byKey[key]
	if not it then
		return key
	end
	if it.heroes and #it.heroes == 1 then
		local h = Heroes.byId[it.heroes[1]]
		return tr("Held freischalten: {0}", if h then tr(h.name) else it.heroes[1])
	end
	return tr(it.name)
end

function Names.productDesc(key: string): string
	local it = Products.byKey[key]
	if not it then
		return ""
	end
	if it.grant and it.grant.gold then
		return tr(it.desc, Lang.fmtNum(it.grant.gold))
	end
	return tr(it.desc)
end

function Names.cosmetic(id: string): string
	local c = Cosmetics.byId[id]
	return if c then tr(c.name) else id
end

-- how a free cosmetic or a hero is earned
function Names.achievementHint(achId: string): string
	local a = achById[achId]
	if not a then
		return ""
	end
	return tr("Erfolg: {0}", tr(a.name)) .. " – " .. tr(a.text)
end

-- the shop entry of a configured item (from the profile view), or nil
function Names.shopItem(view, key: string)
	for _, it in view.shop.items do
		if it.key == key then
			return it
		end
	end
	return nil
end

-- a Robux price button (nothing when the item is not for sale or already owned)
function Names.buyButton(parent: Instance, view, key: string, command: (any) -> (), props: { [string]: any }?): TextButton?
	local it = Names.shopItem(view, key)
	if not it or it.owned then
		return nil
	end
	local b = Kit.button(parent, "R$ " .. tostring(it.price), function()
		command({ op = "buy", key = key })
	end, props)
	b.BackgroundColor3 = Color3.fromRGB(0, 162, 90)
	return b
end

function Names.heroColor(id: string): Color3
	local h = Heroes.byId[id]
	return if h then Color3.fromHex(h.color) else Theme.text
end

return Names
