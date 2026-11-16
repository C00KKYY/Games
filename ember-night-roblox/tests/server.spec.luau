-- Server smoke test: the real server services (src/server/Services, wired by Boot.luau) on a fake Roblox runtime
-- (tests/lib/Roblox.luau: Players, DataStore, MarketplaceService, virtual clock). Join, lobby, start, a co-op run,
-- downed -> revive purchase -> ProcessReceipt, duplicate receipts, gold packs, passes, forge, cosmetics, results with
-- double gold, leaving with the profile released, a session lost to another server.
local T = require("./lib/T")
local Roblox = require("./lib/Roblox")
local Ids = require("./lib/Ids")
local Validate = require("../src/shared/Server/Validate")
local Run = require("../src/shared/Sim/Run")
local K = Run.K

local suite = T.new("server")
local IDS = Ids.all()

local function boot()
	local rb = Roblox.new()
	local net = rb:fakeNet()
	local deps = rb:server("Services/Boot").start(net)
	rb.net = net
	rb.deps = deps
	return rb
end

local function cmd(rb, player, raw)
	local c = Validate.command(raw)
	T.ok(c, "command rejected by Validate: " .. tostring(raw.op))
	rb.net.handlers.command(player, c)
	rb:advance(0.05)
end

local function noErrors(rb)
	local errs = rb:errors()
	T.eq(#errs, 0, table.concat(errs, "\n---\n"))
end

local function receipt(rb, player, purchaseId, key)
	return rb.Market.ProcessReceipt({ PlayerId = player.UserId, PurchaseId = purchaseId, ProductId = IDS[key] })
end

local GRANTED = "Enum.ProductPurchaseDecision.PurchaseGranted"
local NOT_YET = "Enum.ProductPurchaseDecision.NotProcessedYet"

suite:test("join, lobby, forge, cosmetics, gold pack receipt, leave saves and releases", function()
	Ids.with(IDS, function()
		local rb = boot()
		local a = rb:join(101, "de-DE")
		rb:advance(1)
		noErrors(rb)
		local lobby = rb:lastUi(a, "lobby")
		T.ok(lobby, "lobby message")
		T.ok(lobby.isLeader)
		T.eq(#lobby.heroes, 2)
		T.eq(lobby.profile.lang, "de")
		T.ok(#lobby.profile.shop.items > 0, "live prices fetched")
		T.ok(rb.storeData.p_101._lock, "session lock written")
		-- gold pack
		local co = coroutine.create(function()
			return receipt(rb, a, "G1", "gold_m")
		end)
		local _, d = coroutine.resume(co)
		T.eq(tostring(d), GRANTED)
		local prof = rb.deps.Profiles.get(a)
		T.eq(prof.gold, 3500)
		T.eq(rb.storeData.p_101.gold, 3500, "saved before granting")
		_, d = coroutine.resume(coroutine.create(function()
			return receipt(rb, a, "G1", "gold_m")
		end))
		T.eq(tostring(d), GRANTED, "duplicate")
		T.eq(prof.gold, 3500)
		-- forge
		cmd(rb, a, { op = "forgeBuy", id = "might" })
		T.eq(prof.shop.might, 1)
		T.eq(prof.gold, 3500 - 120)
		-- cosmetics: not owned -> ignored; bought -> equipped
		cmd(rb, a, { op = "equip", slot = "trail", id = "trail_star" })
		T.eq(prof.cosmetics.equipped.trail, nil)
		_, d = coroutine.resume(coroutine.create(function()
			return receipt(rb, a, "C1", "trail_star")
		end))
		T.eq(tostring(d), GRANTED)
		cmd(rb, a, { op = "equip", slot = "trail", id = "trail_star" })
		T.eq(prof.cosmetics.equipped.trail, "trail_star")
		-- shop prompt for an owned cosmetic is refused, for a pass it is sent
		cmd(rb, a, { op = "buy", key = "trail_star" })
		T.eq(#rb.prompts, 0)
		cmd(rb, a, { op = "buy", key = "pass_gold2x" })
		T.eq(#rb.prompts, 1)
		T.eq(rb.prompts[1].id, IDS.pass_gold2x)
		cmd(rb, a, { op = "buy", key = "revive" })
		T.eq(#rb.prompts, 1, "no revive outside a run")
		rb:advance(1)
		rb:leave(a)
		rb:advance(1)
		noErrors(rb)
		T.eq(rb.storeData.p_101._lock, nil, "released")
		T.eq(rb.storeData.p_101.gold, 3380)
		T.eq(rb.storeData.p_101.cosmetics.equipped.trail, "trail_star")
		T.eq(rb.deps.Profiles.get(a), nil)
	end)
end)

suite:test("co-op run: downed, revive purchase via ProcessReceipt, limit, results with double gold", function()
	Ids.with(IDS, function()
		local rb = boot()
		local a = rb:join(201)
		local b = rb:join(202)
		rb:advance(1)
		rb.Market.PromptGamePassPurchaseFinished:Fire(a, IDS.pass_gold2x, true)
		rb:advance(0.1)
		T.ok(rb:lastUi(a, "lobby").profile.gold2x)
		cmd(rb, b, { op = "start" })
		T.eq(rb.deps.RunHost.running(), false, "only the leader starts")
		cmd(rb, a, { op = "start" })
		rb:advance(5.2)
		noErrors(rb)
		T.ok(rb.deps.RunHost.running(), "started after the countdown")
		local start = rb:lastUi(b, "runStart")
		T.ok(start)
		T.eq(#start.team, 2)
		local run = rb.deps.RunHost.current()
		-- keep the heroes alive for a minute
		for _ = 1, 62 do
			for _, p in run.plist do
				p.iframe = 1e9
				if p.state == "active" then
					p.hp = p.stats.maxHp
				end
			end
			rb:advance(1, true)
		end
		noErrors(rb)
		local pa = run.players[1]
		pa.iframe, pa.revivals, pa.wardT = 0, 0, 0
		K.hurtPlayer(run, pa, 1e6, "test")
		T.eq(pa.state, "downed")
		rb:advance(0.1, true)
		local offer = rb:lastUi(a, "reviveOffer")
		T.ok(offer and offer.buy, "revive offered")
		T.ok(offer.price and offer.price > 0, "live price")
		cmd(rb, a, { op = "buy", key = "revive" })
		T.eq(rb.prompts[#rb.prompts].id, IDS.revive)
		cmd(rb, b, { op = "buy", key = "revive" })
		T.eq(rb.prompts[#rb.prompts].player, a, "b is not downed: no prompt")
		local _, d = coroutine.resume(coroutine.create(function()
			return receipt(rb, a, "R1", "revive")
		end))
		T.eq(tostring(d), GRANTED)
		T.eq(pa.state, "active", "revived by the receipt")
		local prof = rb.deps.Profiles.get(a)
		T.eq(prof.reviveTokens, 0, "token consumed")
		T.eq(rb.storeData.p_201.receipts.R1 ~= nil, true)
		-- duplicate delivery: no second token
		_, d = coroutine.resume(coroutine.create(function()
			return receipt(rb, a, "R1", "revive")
		end))
		T.eq(tostring(d), GRANTED)
		T.eq(prof.reviveTokens, 0)
		-- second death: no offer any more; a bought token would be kept
		rb:advance(4, true)
		pa.iframe, pa.wardT = 0, 0
		K.hurtPlayer(run, pa, 1e6, "test")
		rb:advance(0.1, true)
		T.ok(not rb:lastUi(a, "reviveOffer").buy, "max 1 per run")
		_, d = coroutine.resume(coroutine.create(function()
			return receipt(rb, a, "R2", "revive")
		end))
		T.eq(tostring(d), GRANTED)
		T.eq(prof.reviveTokens, 1, "kept for the next run")
		T.eq(pa.state, "downed")
		-- b gives up -> last chance for b only (a used his revive), then the run is over
		cmd(rb, b, { op = "giveup" })
		rb:advance(0.5, true)
		T.eq(run.state, "lastchance")
		T.ok(rb:lastUi(b, "reviveOffer").buy, "b may still buy")
		T.ok(not rb:lastUi(a, "reviveOffer").buy)
		rb:advance(11, true)
		rb:advance(1)
		noErrors(rb)
		T.ok(not rb.deps.RunHost.running(), "run over")
		local ra, rbRes = rb:lastUi(a, "results"), rb:lastUi(b, "results")
		T.ok(ra and rbRes)
		T.ok(ra.summary.pass2x > 0, "double gold for a")
		T.eq(ra.summary.pass2x, ra.summary.collected + ra.summary.timeBonus + ra.summary.bossBonus)
		T.eq(rbRes.summary.pass2x, 0, "b has no pass")
		T.ok(ra.summary.timeBonus >= 6)
		T.eq(rb.storeData.p_201.gold, prof.gold, "results saved")
	end)
end)

suite:test("solo last chance waits while the revive prompt is open", function()
	Ids.with(IDS, function()
		local rb = boot()
		local a = rb:join(301)
		rb:advance(1)
		cmd(rb, a, { op = "start" })
		rb:advance(0.1)
		local run = rb.deps.RunHost.current()
		T.ok(run, "solo starts at once")
		rb:advance(2, true)
		local p = run.players[1]
		p.iframe, p.revivals = 0, 0
		K.hurtPlayer(run, p, 1e6, "test")
		T.eq(run.state, "lastchance")
		rb:advance(0.1, true)
		cmd(rb, a, { op = "buy", key = "revive" })
		rb:advance(20, true)
		T.eq(run.state, "lastchance", "held while the prompt is open")
		rb.Market.PromptProductPurchaseFinished:Fire(a.UserId, IDS.revive, false)
		rb:advance(11, true)
		rb:advance(1)
		noErrors(rb)
		T.ok(not rb.deps.RunHost.running(), "closed prompt -> the last chance runs out")
	end)
end)

suite:test("unconfigured products are invisible and cannot be prompted or granted", function()
	local rb = boot()
	local a = rb:join(401)
	rb:advance(1)
	local lobby = rb:lastUi(a, "lobby")
	T.eq(#lobby.profile.shop.items, 0)
	cmd(rb, a, { op = "buy", key = "gold_s" })
	T.eq(#rb.prompts, 0)
	local _, d = coroutine.resume(coroutine.create(function()
		return rb.Market.ProcessReceipt({ PlayerId = 401, PurchaseId = "X", ProductId = 9002 })
	end))
	T.eq(tostring(d), NOT_YET)
	T.eq(rb.deps.Profiles.get(a).gold, 0)
	noErrors(rb)
end)

suite:test("a session taken over by another server is kicked at the next autosave and stops writing", function()
	local rb = boot()
	local a = rb:join(501)
	rb:advance(1)
	rb.deps.Profiles.get(a).gold = 50
	rb.storeData.p_501._lock = { job = "other-server", t = 1700000000 }
	rb.storeData.p_501.gold = 7
	rb:advance(61)
	noErrors(rb)
	T.ok(rb.kicked[501], "kicked")
	T.eq(rb.storeData.p_501.gold, 7, "the other server's data is untouched")
	T.eq(rb.storeData.p_501._lock.job, "other-server")
end)

suite:test("profile load failure kicks; a profile from a newer version kicks without touching it", function()
	local rb = boot()
	rb.storeFail = 20
	rb:join(601)
	rb:advance(30)
	T.ok(rb.kicked[601], "kicked after the retries")
	local rb2 = boot()
	rb2.storeData.p_602 = { v = 99, gold = 5 }
	rb2:join(602)
	rb2:advance(1)
	T.ok(rb2.kicked[602])
	T.eq(rb2.storeData.p_602.v, 99)
	noErrors(rb)
	noErrors(rb2)
end)

return suite
