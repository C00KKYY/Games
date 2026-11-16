-- Meta progression outside runs (docs/DESIGN.md §5.2, §6.3): forge buy/refund, cosmetics equip, settings, and the
-- profile view the client's hub screens show (heroes incl. passes, cosmetics, live shop prices, owned state).
-- Every command is validated by Shared/Server/Validate.luau first and checked against the profile here.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Products = require(Shared.Config.Products)
local Cosmetics = require(Shared.Config.Cosmetics)
local Profile = require(Shared.Sim.Profile)
local Entitlements = require(Shared.Server.Entitlements)

local Meta = {}

local deps: any = nil
local pushQueued = false

-- the shop as one player sees it: configured items with a live price, owned state
local function shopView(prof, passes)
	local items = {}
	for _, it in Products.list do
		if it.id > 0 and it.tab ~= "none" then
			local price = deps.ProductInfo.price(it.key)
			if price then
				table.insert(items, {
					key = it.key,
					tab = it.tab,
					kind = it.kind,
					price = price,
					owned = Entitlements.ownsItem(prof, passes, it.key),
					order = it.order,
				})
			end
		end
	end
	local revive = Products.get("revive")
	return {
		items = items,
		revivePrice = if revive then deps.ProductInfo.price("revive") else nil,
	}
end

-- the full profile view for the client (hub screens)
function Meta.view(player: Player)
	local prof = deps.Profiles.get(player)
	local v = deps.Profiles.baseView(player)
	if not prof or not v then
		return nil
	end
	local passes = deps.Passes.get(player)
	v.heroes = Entitlements.heroes(prof, passes)
	v.passHeroes = Entitlements.passHeroes(passes)
	v.passes = table.clone(passes)
	v.gold2x = Entitlements.gold2x(passes)
	v.cosmetics = Entitlements.cosmetics(prof, passes)
	v.equipped = Entitlements.equipped(prof, passes)
	v.shop = shopView(prof, passes)
	v.forgeRefund = prof.shopSpent
	return v
end

-- equipped cosmetics of a player (validated against ownership) for the arena
function Meta.equipped(player: Player)
	local prof = deps.Profiles.get(player)
	if not prof then
		return {}
	end
	return Entitlements.equipped(prof, deps.Passes.get(player))
end

-- profile changed: refresh the hub of everybody (coalesced per frame)
function Meta.push(_player: Player?)
	if pushQueued then
		return
	end
	pushQueued = true
	task.defer(function()
		pushQueued = false
		deps.Lobby.broadcast()
	end)
end

local SETTINGS_BOOL = { sfx = true, music = true, dmgNums = true, shake = true, lowFx = true }

function Meta.command(player: Player, c): boolean
	local prof = deps.Profiles.get(player)
	if not prof then
		return false
	end
	local op = c.op
	if op == "forgeBuy" then
		if deps.RunHost.inRun(player) then
			return true
		end
		if Profile.forgeBuy(prof, c.id) then
			Meta.push(player)
		end
		return true
	elseif op == "forgeRefund" then
		if deps.RunHost.inRun(player) then
			return true
		end
		if prof.shopSpent > 0 then
			Profile.forgeRefund(prof)
			Meta.push(player)
		end
		return true
	elseif op == "equip" then
		local passes = deps.Passes.get(player)
		if c.id == "" then
			prof.cosmetics.equipped[c.slot] = nil
		else
			local cos = Cosmetics.byId[c.id]
			if not cos or cos.slot ~= c.slot or not Entitlements.ownsCosmetic(prof, passes, c.id) then
				return true
			end
			prof.cosmetics.equipped[c.slot] = c.id
		end
		Meta.push(player)
		return true
	elseif op == "setting" then
		if SETTINGS_BOOL[c.key] and type(c.value) == "boolean" then
			prof.settings[c.key] = c.value
		elseif c.key == "camZoom" and type(c.value) == "number" and c.value == c.value then
			prof.settings.camZoom = math.clamp(math.floor(c.value * 20 + 0.5) / 20, 0.7, 1.3)
		else
			return true
		end
		Meta.push(player)
		return true
	elseif op == "lang" then
		prof.settings.lang = c.lang
		Meta.push(player)
		return true
	elseif op == "storySeen" then
		prof.storySeen[c.stage] = true
		return true
	elseif op == "buy" then
		deps.Purchases.buy(player, c.key)
		return true
	elseif op == "useRevive" then
		deps.Purchases.useRevive(player)
		return true
	end
	return false
end

function Meta.init(d)
	deps = d
	deps.Profiles.changed = Meta.push
	deps.Profiles.onLoaded(function(_player)
		Meta.push()
	end)
end

return Meta
