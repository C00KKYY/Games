-- Robux revive limits (Shared/Server/ReviveFlow.luau + sim, docs/DESIGN.md §2.8, §7.3): tokens, max one per player
-- and run, offers only while downed/fallen, last chance, unconfigured product.
local T = require("./lib/T")
local Sim = require("./lib/Sim")
local Run = require("../src/shared/Sim/Run")
local Profile = require("../src/shared/Sim/Profile")
local ReviveFlow = require("../src/shared/Server/ReviveFlow")
local Tuning = require("../src/shared/Config/Tuning")
local K = Run.K

local suite = T.new("revive")

local function kill(run, p)
	p.iframe = 0
	p.wardT = 0
	p.revivals = 0
	K.hurtPlayer(run, p, 1e6, "test")
end

suite:test("solo: last chance offers the purchase, a token revives once, the second death ends the run", function()
	local run = Sim.new({ n = 1 })
	local prof = Profile.default()
	ReviveFlow.sync(run, 1, prof, true)
	local a = run.players[1]
	local o = ReviveFlow.offer(run, 1, prof, true)
	T.ok(not o.buy and not o.use, "nothing offered while alive")
	kill(run, a)
	T.eq(run.state, "lastchance")
	o = ReviveFlow.offer(run, 1, prof, true)
	T.ok(o.buy, "buy offered")
	T.ok(not o.use)
	T.ok(not ReviveFlow.useToken(run, 1, prof), "no token yet")
	prof.reviveTokens = 2 -- receipt granted (and one spare)
	o = ReviveFlow.offer(run, 1, prof, true)
	T.ok(o.use and not o.buy, "a stored token is used instead of buying")
	T.ok(ReviveFlow.useToken(run, 1, prof))
	T.eq(prof.reviveTokens, 1)
	T.eq(run.state, "play")
	T.eq(a.state, "active")
	T.near(a.hp, a.stats.maxHp * 0.5, 1e-6)
	kill(run, a)
	T.eq(run.state, "over", "REVIVE_MAX_PER_RUN = 1: no second last chance")
	T.ok(not ReviveFlow.useToken(run, 1, prof))
	T.eq(prof.reviveTokens, 1, "the spare token is kept for a later run")
	T.eq(Tuning.REVIVE_MAX_PER_RUN, 1)
end)

suite:test("no product and no token: no last chance; a token alone still offers it", function()
	local run = Sim.new({ n = 1 })
	local prof = Profile.default()
	ReviveFlow.sync(run, 1, prof, false)
	kill(run, run.players[1])
	T.eq(run.state, "over")
	local run2 = Sim.new({ n = 1 })
	prof.reviveTokens = 1
	ReviveFlow.sync(run2, 1, prof, false)
	kill(run2, run2.players[1])
	T.eq(run2.state, "lastchance")
	local o = ReviveFlow.offer(run2, 1, prof, false)
	T.ok(o.use and not o.buy)
end)

suite:test("a token is not used while the player is active, or after the run ended", function()
	local run = Sim.new({ n = 1 })
	local prof = Profile.default()
	prof.reviveTokens = 1
	ReviveFlow.sync(run, 1, prof, true)
	T.ok(not ReviveFlow.useToken(run, 1, prof))
	T.eq(prof.reviveTokens, 1)
	kill(run, run.players[1])
	for _ = 1, 11 do
		Run.step(run, 1)
	end
	T.eq(run.state, "over", "last chance timed out")
	T.ok(not ReviveFlow.useToken(run, 1, prof))
	T.eq(prof.reviveTokens, 1)
end)

suite:test("an open purchase prompt holds the last chance; withdrawing the offer ends it", function()
	local run = Sim.new({ n = 1 })
	local prof = Profile.default()
	ReviveFlow.sync(run, 1, prof, true)
	kill(run, run.players[1])
	Run.command(run, 1, { op = "holdLast", on = true })
	for _ = 1, 20 do
		Run.step(run, 1)
	end
	T.eq(run.state, "lastchance")
	Run.command(run, 1, { op = "holdLast", on = false })
	Run.setReviveOffer(run, 1, false)
	T.eq(run.state, "over")
end)

suite:test("co-op: each player has his own limit; downed or fallen both count; the run keeps going", function()
	local run = Sim.new({ n = 2 })
	local pa, pb = Profile.default(), Profile.default()
	pa.reviveTokens, pb.reviveTokens = 3, 3
	ReviveFlow.sync(run, 1, pa, true)
	ReviveFlow.sync(run, 2, pb, true)
	local a, b = run.players[1], run.players[2]
	kill(run, a)
	T.eq(a.state, "downed")
	T.eq(run.state, "play", "b still fights")
	T.ok(not ReviveFlow.useToken(run, 2, pb), "b is active: nothing to revive")
	T.ok(ReviveFlow.useToken(run, 1, pa))
	T.eq(a.state, "active")
	kill(run, a)
	T.ok(not ReviveFlow.useToken(run, 1, pa), "a's revive for this run is used")
	T.eq(pa.reviveTokens, 2)
	Run.command(run, 2, { op = "giveup" })
	T.eq(b.state, "fallen")
	T.eq(run.state, "lastchance", "b can still be revived")
	T.ok(ReviveFlow.offer(run, 2, pb, true).use)
	T.ok(not ReviveFlow.offer(run, 1, pa, true).use, "a cannot")
	T.ok(ReviveFlow.useToken(run, 2, pb))
	T.eq(run.state, "play")
	T.eq(pb.reviveTokens, 2)
end)

suite:test("the sim's revive command never bypasses the limit", function()
	local run = Sim.new({ n = 1 })
	Run.setReviveOffer(run, 1, true)
	kill(run, run.players[1])
	T.ok(Run.command(run, 1, { op = "revive" }))
	kill(run, run.players[1])
	T.ok(not Run.command(run, 1, { op = "revive" }))
	T.ok(not Run.canRobuxRevive(run, 1))
end)

return suite
