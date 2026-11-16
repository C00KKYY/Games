-- Developer product receipts (docs/DESIGN.md §7.3). Pure: the decision table for ProcessReceipt and the grant that
-- is applied to the profile together with the ledger entry (one DataStore write, see ProfileStore.grant).
local Products = if script then require(script.Parent.Parent.Config.Products) else require("../Config/Products")

local ReceiptLogic = {}

ReceiptLogic.LEDGER_MAX = 200 -- entries kept in profile.receipts ...
ReceiptLogic.KEEP_SECONDS = 30 * 86400 -- ... but never one younger than this (Roblox's re-delivery window)
ReceiptLogic.LEDGER_HARD_MAX = 1000 -- absolute cap (profile size) even for young entries

-- "notYet" (Roblox retries later), "granted" (already done) or "apply"; second value = reason
-- s = { item = configured product or nil, loaded = profile in memory, lost = session lock lost, already = receipt
--       id in the ledger }
function ReceiptLogic.decide(s: { item: any, loaded: boolean, lost: boolean?, already: boolean? }): (string, string)
	if not s.item then
		return "notYet", "unknown product"
	end
	if not s.loaded then
		return "notYet", "profile not loaded"
	end
	if s.lost then
		return "notYet", "session lost"
	end
	if s.already then
		return "granted", "already granted"
	end
	return "apply", "new"
end

-- drop the oldest entries beyond LEDGER_MAX, keeping every entry younger than KEEP_SECONDS (up to LEDGER_HARD_MAX)
function ReceiptLogic.prune(receipts: { [string]: number }, now: number)
	local ids = {}
	for id in receipts do
		table.insert(ids, id)
	end
	if #ids <= ReceiptLogic.LEDGER_MAX then
		return
	end
	table.sort(ids, function(a, b)
		if receipts[a] ~= receipts[b] then
			return receipts[a] > receipts[b]
		end
		return a > b
	end)
	for i = ReceiptLogic.LEDGER_MAX + 1, #ids do
		local id = ids[i]
		if i > ReceiptLogic.LEDGER_HARD_MAX or now - receipts[id] >= ReceiptLogic.KEEP_SECONDS then
			receipts[id] = nil
		end
	end
end

-- apply the product's grant to `profile` and record the receipt (the caller writes the result in one save)
function ReceiptLogic.apply(profile, item: Products.Item, purchaseId: string, now: number)
	local g = item.grant or {}
	if g.gold then
		profile.gold += g.gold
	end
	if g.revive then
		profile.reviveTokens += g.revive
	end
	if g.cosmetic then
		-- an already owned cosmetic: the receipt is recorded, nothing else changes (the UI prevents this)
		profile.cosmetics.owned[g.cosmetic] = true
	end
	profile.receipts[purchaseId] = now
	ReceiptLogic.prune(profile.receipts, now)
end

return ReceiptLogic
