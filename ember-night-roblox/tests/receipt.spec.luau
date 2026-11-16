-- ProcessReceipt core (ReceiptLogic + ProfileStore.grant, docs/DESIGN.md §7.3): idempotent grants, duplicate
-- receipts, unknown/unconfigured products, failures before and after the write, a player leaving between a write
-- and its retry, ledger size.
local T = require("./lib/T")
local FakeStore = require("./lib/FakeStore")
local Ids = require("./lib/Ids")
local ProfileStore = require("../src/shared/Server/ProfileStore")
local ReceiptLogic = require("../src/shared/Server/ReceiptLogic")
local Products = require("../src/shared/Config/Products")

local suite = T.new("receipt")
local UID = 7
local KEY = ProfileStore.key(UID)
local IDS = Ids.all()
local GOLD_S = IDS.gold_s

local function fresh(gold: number?)
	local fs = FakeStore.new()
	local st = ProfileStore.new(fs:opts("jobA"))
	local p = assert(st:load(UID))
	p.gold = gold or 100
	assert(st:save(UID))
	return fs, st, p
end

suite:test("decision table", function()
	local item = { key = "x" }
	T.eq((ReceiptLogic.decide({ item = nil, loaded = true })), "notYet")
	T.eq((ReceiptLogic.decide({ item = item, loaded = false })), "notYet")
	T.eq((ReceiptLogic.decide({ item = item, loaded = true, lost = true })), "notYet")
	T.eq((ReceiptLogic.decide({ item = item, loaded = true, already = true })), "granted")
	T.eq((ReceiptLogic.decide({ item = item, loaded = true })), "apply")
end)

suite:test("gold pack: granted once, stored and in memory", function()
	Ids.with(IDS, function()
		local fs, st, p = fresh(100)
		local d, item = st:grant(UID, "P1", GOLD_S)
		T.eq(d, "granted")
		T.eq(item.key, "gold_s")
		T.eq(p.gold, 1100)
		T.eq(fs.data[KEY].gold, 1100)
		T.ok(fs.data[KEY].receipts.P1)
		T.ok(p.receipts.P1)
	end)
end)

suite:test("duplicate receipt: granted without a second grant, also after a rejoin on another server", function()
	Ids.with(IDS, function()
		local fs, st, p = fresh(100)
		T.eq((st:grant(UID, "P1", GOLD_S)), "granted")
		local writes = fs.writes
		T.eq((st:grant(UID, "P1", GOLD_S)), "granted")
		T.eq(p.gold, 1100)
		T.eq(fs.writes, writes, "no write for a duplicate")
		assert(st:save(UID, true))
		local st2 = ProfileStore.new(fs:opts("jobB"))
		local q = assert(st2:load(UID))
		T.eq((st2:grant(UID, "P1", GOLD_S)), "granted")
		T.eq(q.gold, 1100)
		T.eq(fs.data[KEY].gold, 1100)
	end)
end)

suite:test("unknown product, unconfigured product, profile not loaded: not processed yet", function()
	local fs, st, p = fresh(100)
	T.eq((st:grant(UID, "P1", 123456)), "notYet", "unknown id")
	T.eq((st:grant(UID, "P2", 0)), "notYet", "id 0 never maps to a product")
	T.eq((st:grant(UID, "P3", GOLD_S)), "notYet", "gold_s not configured (all ids 0)")
	Ids.with(IDS, function()
		T.eq((st:grant(999, "P4", GOLD_S)), "notYet", "player not on this server")
	end)
	T.eq(p.gold, 100)
	T.eq(fs.data[KEY].gold, 100)
	T.eq(next(p.receipts), nil)
end)

suite:test("failure before the write (all attempts): nothing changes; the redelivery grants once", function()
	Ids.with(IDS, function()
		local fs, st, p = fresh(100)
		fs.failBefore = 4
		T.eq((st:grant(UID, "P1", GOLD_S)), "notYet")
		T.eq(p.gold, 100)
		T.eq(p.receipts.P1, nil)
		T.eq(fs.data[KEY].gold, 100)
		T.eq((st:grant(UID, "P1", GOLD_S)), "granted")
		T.eq(p.gold, 1100)
		T.eq(fs.data[KEY].gold, 1100)
	end)
end)

suite:test("failure after the write: the retry recognises it, gold is granted once", function()
	Ids.with(IDS, function()
		local fs, st, p = fresh(100)
		fs.failAfter = 1
		T.eq((st:grant(UID, "P1", GOLD_S)), "granted")
		T.eq(p.gold, 1100)
		T.eq(fs.data[KEY].gold, 1100)
	end)
end)

suite:test("written but every call failed: notYet; the redelivery does not double the gold", function()
	Ids.with(IDS, function()
		local fs, st, p = fresh(100)
		fs.failAfter = 1
		fs.failBefore = 0
		local calls = 0
		fs.during = function()
			calls += 1
			if calls > 1 then
				fs.failBefore = 1 -- the retries fail before writing
			end
		end
		T.eq((st:grant(UID, "P1", GOLD_S)), "notYet")
		fs.during = nil
		fs.failBefore = 0
		T.eq(p.gold, 100, "memory unchanged")
		T.eq(fs.data[KEY].gold, 1100, "stored value already has the grant")
		T.eq((st:grant(UID, "P1", GOLD_S)), "granted", "Roblox delivers the receipt again")
		T.eq(p.gold, 1100)
		T.eq(fs.data[KEY].gold, 1100, "not 2100")
		assert(st:save(UID))
		T.eq(fs.data[KEY].gold, 1100)
	end)
end)

suite:test("written but failed, then the player leaves: the release save drops grant and receipt together", function()
	Ids.with(IDS, function()
		local fs, st, p = fresh(100)
		fs.failAfter = 1
		local calls = 0
		fs.during = function()
			calls += 1
			if calls > 1 then
				fs.failBefore = 1
			end
		end
		T.eq((st:grant(UID, "P1", GOLD_S)), "notYet")
		fs.during = nil
		fs.failBefore = 0
		p.gold += 5 -- run gold earned meanwhile
		assert(st:save(UID, true))
		T.eq(fs.data[KEY].gold, 105)
		T.eq(fs.data[KEY].receipts.P1, nil)
		local st2 = ProfileStore.new(fs:opts("jobB"))
		local q = assert(st2:load(UID))
		T.eq((st2:grant(UID, "P1", GOLD_S)), "granted", "redelivered on the next join")
		T.eq(q.gold, 1105)
		T.eq(fs.data[KEY].gold, 1105)
	end)
end)

suite:test("changes made while the grant's write is waiting are kept", function()
	Ids.with(IDS, function()
		local fs, st, p = fresh(100)
		fs.during = function()
			fs.during = nil
			p.gold += 50 -- the run books gold while UpdateAsync yields
		end
		T.eq((st:grant(UID, "P1", GOLD_S)), "granted")
		T.eq(p.gold, 1150)
		assert(st:save(UID))
		T.eq(fs.data[KEY].gold, 1150)
	end)
end)

suite:test("lost session: receipts stay unprocessed (another server grants them)", function()
	Ids.with(IDS, function()
		local fs, st, p = fresh(100)
		fs.data[KEY]._lock = { job = "jobB", t = fs.clock }
		T.eq((st:grant(UID, "P1", GOLD_S)), "notYet")
		T.ok(st:isLost(UID))
		T.eq(p.gold, 100)
		T.eq(fs.data[KEY].gold, 100)
		T.eq((st:grant(UID, "P2", GOLD_S)), "notYet")
	end)
end)

suite:test("revive token and stored cosmetics", function()
	Ids.with(IDS, function()
		local fs, st, p = fresh(0)
		T.eq((st:grant(UID, "R1", IDS.revive)), "granted")
		T.eq(p.reviveTokens, 1)
		T.eq(fs.data[KEY].reviveTokens, 1)
		T.eq((st:grant(UID, "C1", IDS.trail_star)), "granted")
		T.ok(p.cosmetics.owned.trail_star)
		-- buying an owned cosmetic again (UI prevents it): receipt recorded, nothing else changes
		local gold = p.gold
		T.eq((st:grant(UID, "C2", IDS.trail_star)), "granted")
		T.ok(p.receipts.C2)
		T.eq(p.gold, gold)
		-- passes never go through ProcessReceipt
		T.eq((st:grant(UID, "X1", IDS.pass_gold2x)), "notYet")
	end)
end)

suite:test("ledger: oldest entries dropped beyond 200, never one younger than 30 days", function()
	local now = 100 * 86400
	local r = {}
	for i = 1, 250 do
		r["old" .. i] = now - 40 * 86400 + i
	end
	ReceiptLogic.prune(r, now)
	local n = 0
	for _ in r do
		n += 1
	end
	T.eq(n, 200)
	T.eq(r.old1, nil, "oldest dropped")
	T.ok(r.old250)
	local y = {}
	for i = 1, 300 do
		y["y" .. i] = now - i
	end
	ReceiptLogic.prune(y, now)
	n = 0
	for _ in y do
		n += 1
	end
	T.eq(n, 300, "young receipts are all kept")
	local h = {}
	for i = 1, 1200 do
		h["h" .. i] = now - i
	end
	ReceiptLogic.prune(h, now)
	n = 0
	for _ in h do
		n += 1
	end
	T.eq(n, ReceiptLogic.LEDGER_HARD_MAX, "hard cap")
	T.ok(h.h1, "newest kept")
end)

suite:test("products: keys and configured ids unique, unconfigured items invisible", function()
	local seenKey = {}
	for _, it in Products.list do
		T.ok(not seenKey[it.key], it.key)
		seenKey[it.key] = true
		T.eq(it.id, 0, "shipped with placeholder ids")
		T.eq(Products.get(it.key), nil)
		T.ok(it.kind == "product" or it.kind == "pass", it.key)
		T.ok(it.price > 0, it.key)
	end
	Ids.with(IDS, function()
		local seen = {}
		for _, it in Products.list do
			T.ok(not seen[it.id], "id unique")
			seen[it.id] = true
			if it.kind == "product" then
				T.eq(Products.byProductId(it.id), it)
				T.eq(Products.byPassId(it.id), nil)
			else
				T.eq(Products.byPassId(it.id), it)
				T.eq(Products.byProductId(it.id), nil)
			end
		end
	end)
	T.eq(Products.byProductId(0), nil)
end)

return suite
