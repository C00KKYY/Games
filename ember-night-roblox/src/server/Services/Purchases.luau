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
local PROMPT_HOLD_MAX = 45 -- seconds of the last chance a player's revive prompts may hold, in total per run
local revivePrompts: { [Player]: number } = {} -- open revive prompts (os.clock when first opened)
local holdSpent: { [Player]: number } = {} -- hold seconds already used by closed prompts in this run
local holdRun: any = nil -- the run these tables belong to
local PROMPT_OPEN_MAX = 60 -- a product prompt that never reports back stops blocking a second one after this
local openPrompts: { [Player]: { [string]: number } } = {} -- open prompts of non-consumables (cosmetics)

-- a prompt closed (bought, cancelled, player gone): its time counts against the player's hold budget
local function closeRevivePrompt(player: Player)
	local t = revivePrompts[player]
	if t then
		holdSpent[player] = (holdSpent[player] or 0) + (os.clock() - t)
		revivePrompts[player] = nil
	end
end

local function updateHold()
	-- a new run (or none): prompts of the last run hold nothing, the budget starts again
	local cur = deps.RunHost.current()
	if cur ~= holdRun then
		holdRun = cur
		table.clear(revivePrompts)
		table.clear(holdSpent)
	end
	local now = os.clock()
	local any = false
	for player, t in revivePrompts do
		if now - t + (holdSpent[player] or 0) > PROMPT_HOLD_MAX or not player.Parent then
			closeRevivePrompt(player)
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
	if item and item.grant and item.grant.revive then
		closeRevivePrompt(player)
		updateHold()
	end
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
		updateHold()
		-- re-asking does not restart the hold: the first opening counts, and the run's budget is shared
		if not revivePrompts[player] then
			revivePrompts[player] = os.clock()
		end
		updateHold()
	end
	if it.grant and it.grant.cosmetic then
		-- a non-consumable: no second prompt while one is open (two quick clicks would sell it twice)
		local open = openPrompts[player] or {}
		openPrompts[player] = open
		local t = open[key]
		if t and os.clock() - t < PROMPT_OPEN_MAX then
			return
		end
		open[key] = os.clock()
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
			if it and openPrompts[player] then
				openPrompts[player][it.key] = nil
			end
			if it and it.grant and it.grant.revive and not isPurchased then
				closeRevivePrompt(player)
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
	openPrompts[player] = nil
	holdSpent[player] = nil
	if revivePrompts[player] then
		revivePrompts[player] = nil
		updateHold()
	end
end

return Purchases
