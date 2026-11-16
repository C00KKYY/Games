-- Robux purchases (docs/DESIGN.md §7.2, §7.3): MarketplaceService.ProcessReceipt (set once, here), purchase prompts
-- requested by clients (validated: configured, not owned, revive only while allowed), the revive flow during a run.
-- The grant itself is ProfileStore.grant (one DataStore write with the receipt ledger; Lune-tested).
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Products = require(Shared.Config.Products)
local Entitlements = require(Shared.Server.Entitlements)
local RateLimit = require(Shared.Server.RateLimit)

local Purchases = {}

local deps: any = nil
local promptLimit = RateLimit.new(0.5, 2) -- purchase prompts: 2 at once, then one every 2 s
local PROMPT_HOLD_MAX = 45 -- seconds a revive prompt may hold the last chance open
local revivePrompts: { [Player]: number } = {} -- open revive prompts (os.clock when opened)

local function updateHold()
	local now = os.clock()
	local any = false
	for player, t in revivePrompts do
		if now - t > PROMPT_HOLD_MAX or not player.Parent then
			revivePrompts[player] = nil
		else
			any = true
		end
	end
	deps.RunHost.holdLast(any)
end

local function processReceipt(info): Enum.ProductPurchaseDecision
	local player = Players:GetPlayerByUserId(info.PlayerId)
	if not player then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	if not deps.Profiles.waitLoaded(player, 15) then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local store = deps.Profiles.store()
	local decision, item, reason = store:grant(player.UserId, tostring(info.PurchaseId), info.ProductId)
	if decision ~= "granted" then
		warn(
			string.format(
				"[EmberNight] receipt %s (product %s) not processed: %s",
				tostring(info.PurchaseId),
				tostring(info.ProductId),
				reason
			)
		)
		if reason == "save lost" then
			deps.Profiles.save(player) -- reports the lost session (kick)
		end
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	if reason == "granted" and item then
		-- runtime effects after the grant is saved
		if item.grant and item.grant.revive then
			deps.RunHost.useReviveToken(player)
		end
		deps.Net.ui(player, { t = "purchased", key = item.key })
		deps.Profiles.changed(player)
	end
	revivePrompts[player] = nil
	updateHold()
	return Enum.ProductPurchaseDecision.PurchaseGranted
end

-- client asks to buy `key` (Cmd { op = "buy", key })
function Purchases.buy(player: Player, key: string)
	if not promptLimit:allow(player, os.clock()) then
		return
	end
	local it = Products.get(key)
	local prof = deps.Profiles.get(player)
	if not it or not prof then
		return
	end
	local passes = deps.Passes.get(player)
	if Entitlements.ownsItem(prof, passes, key) then
		return
	end
	if it.kind == "pass" then
		MarketplaceService:PromptGamePassPurchase(player, it.id)
		return
	end
	if it.grant and it.grant.revive then
		local offer = deps.RunHost.reviveOffer(player)
		if not (offer and offer.buy) then
			return
		end
		revivePrompts[player] = os.clock()
		updateHold()
	end
	MarketplaceService:PromptProductPurchase(player, it.id)
end

-- client uses a stored revive token (Cmd { op = "useRevive" })
function Purchases.useRevive(player: Player)
	deps.RunHost.useReviveToken(player)
end

function Purchases.init(d)
	deps = d
	MarketplaceService.ProcessReceipt = processReceipt
	MarketplaceService.PromptProductPurchaseFinished:Connect(
		function(userId: number, productId: number, isPurchased: boolean)
			local player = Players:GetPlayerByUserId(userId)
			if not player then
				return
			end
			local it = Products.byProductId(productId)
			if it and it.grant and it.grant.revive and not isPurchased then
				revivePrompts[player] = nil
				updateHold()
			end
		end
	)
	-- safety: a prompt that never reports back does not hold the last chance forever
	task.spawn(function()
		while true do
			task.wait(5)
			if next(revivePrompts) then
				updateHold()
			end
		end
	end)
end

function Purchases.onLeave(player: Player)
	promptLimit:forget(player)
	if revivePrompts[player] then
		revivePrompts[player] = nil
		updateHold()
	end
end

return Purchases
