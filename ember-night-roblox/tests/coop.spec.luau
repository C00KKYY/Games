local T = require("./lib/T")
local Sim = require("./lib/Sim")
local Run = require("../src/shared/Sim/Run")
local Coop = require("../src/shared/Sim/Coop")
local Tuning = require("../src/shared/Config/Tuning")
local K = Run.K

local suite = T.new("coop")

suite:test("scaling tables have 4 entries and grow with N", function()
	for _, name in
		{ "spawnRate", "spawnCap", "enemyHp", "eliteHp", "bossHp", "eventCount", "rangedCap", "eshotCap", "teleCap" }
	do
		local t = Coop[name]
		T.eq(#t, 4, name)
		for i = 2, 4 do
			T.ok(t[i] >= t[i - 1], name .. " grows")
		end
	end
	T.ok(Coop.xpShare[4] < Coop.xpShare[1] and Coop.goldShare[4] < Coop.goldShare[1])
end)

suite:test("team XP and team gold", function()
	local run = Sim.new({
		n = 2,
		players = {
			{ slot = 1, heroId = "aron" },
			{ slot = 2, heroId = "lio", forge = { growth = 5 } },
		},
	})
	local a, b = run.players[1], run.players[2]
	K.teamXp(run, 4)
	T.near(a.xp, 4 * Coop.xpShare[2] * a.stats.growth, 1e-9)
	T.near(b.xp, 4 * Coop.xpShare[2] * b.stats.growth, 1e-9)
	local it = K.drop(run, a.x, a.y, "bag", 20)
	K.collect(run, it, a)
	T.eq(a.gold, math.floor(20 * 0.7 * a.stats.greed + 0.5))
	T.eq(b.gold, math.floor(20 * 0.7 * b.stats.greed + 0.5), "lio greed 1.25")
end)

suite:test("elites drop one chest per player, only the owner opens it", function()
	local run = Sim.new({ n = 3 })
	local e = K.spawnEnemy(run, "bat", 300, 0)
	e.elite = true
	K.kill(run, e, 1)
	local chests = {}
	for _, it in run.pickups do
		if it.kind == "chest" then
			table.insert(chests, it)
		end
	end
	T.eq(#chests, 3)
	local owners = {}
	for _, c in chests do
		owners[c.owner] = true
	end
	T.ok(owners[1] and owners[2] and owners[3])
	-- player 1 walks onto the chest of player 2: nothing happens; onto his own: opened at once (co-op)
	local c2 = nil
	for _, c in chests do
		if c.owner == 2 then
			c2 = c
		end
	end
	local p1 = run.players[1]
	p1.x, p1.y = c2.x, c2.y
	local before = p1.chestsOpened
	K.refreshPlayers(run)
	K.updatePickups(run, 1 / 60)
	T.eq(p1.chestsOpened, before, "foreign chest ignored")
	local own = nil
	for _, c in run.pickups do
		if c.kind == "chest" and c.owner == 1 then
			own = c
		end
	end
	p1.x, p1.y = own.x, own.y
	K.updatePickups(run, 1 / 60)
	T.eq(p1.chestsOpened, before + 1)
	T.eq(run.state, "play", "co-op never pauses for a chest")
end)

suite:test("co-op level-up: tray, ward with cooldown, auto-pick after 15 s, world keeps running", function()
	local run = Sim.new({ n = 2 })
	local a = run.players[1]
	K.gainXp(run, a, 30) -- several levels
	T.ok(a.pendingLevels >= 2)
	local log = {}
	Sim.advance(run, 0.1, { autopick = false, log = log })
	T.eq(run.state, "play")
	T.ok(a.offer ~= nil, "tray open")
	T.ok(a.wardT > 0, "ward granted")
	T.eq(#Sim.filter(log, "ward"), 1)
	local log2 = {}
	Sim.advance(run, Tuning.AUTO_PICK_TIME + 0.2, { autopick = false, god = true, log = log2 })
	local picked = 0
	for _, e in Sim.filter(log2, "build") do
		if e.slot == 1 then
			picked += 1
		end
	end
	T.ok(picked >= 1, "auto-picked")
	-- the second tray directly after does not grant a second ward (cooldown 6 s and tray stays open)
	T.ok(a.wardT <= 0)
end)

suite:test("downed -> teammate revive -> bleed-out -> fallen -> run ends", function()
	local run = Sim.new({ n = 2 })
	local a, b = run.players[1], run.players[2]
	a.revivals = 0
	b.revivals = 0
	a.iframe = 0
	K.hurtPlayer(run, a, 1e6, "test")
	T.eq(a.state, "downed")
	T.eq(run.state, "play")
	-- b stands next to a: revived after REVIVE_TIME
	b.x, b.y = a.x + 10, a.y
	Sim.advance(run, Tuning.REVIVE_TIME + 0.2, {
		onStep = function()
			b.x, b.y = a.x + 10, a.y
			b.iframe = 1e9
		end,
	})
	T.eq(a.state, "active")
	T.near(a.hp / a.stats.maxHp, 0.4, 0.05)
	T.eq(a.revives, 1)
	-- down again, nobody helps: fallen after BLEED_OUT
	a.iframe = 0
	K.hurtPlayer(run, a, 1e6, "test")
	T.eq(a.state, "downed")
	b.x, b.y = a.x + 600, a.y
	Sim.advance(run, Tuning.BLEED_OUT + 0.5, {
		onStep = function()
			b.iframe = 1e9
			b.hp = b.stats.maxHp
		end,
	})
	T.eq(a.state, "fallen")
	-- last active player goes down without a revive offer: the run ends
	b.iframe = 0
	b.wardT = 0
	K.hurtPlayer(run, b, 1e6, "test")
	T.eq(run.state, "over")
end)

suite:test("last chance with the Robux revive, max 1 per run", function()
	local run = Sim.new({ n = 1, reviveOffer = true })
	local a = run.players[1]
	a.revivals = 0
	K.hurtPlayer(run, a, 1e6, "test")
	T.eq(run.state, "lastchance")
	Run.step(run, 1)
	T.eq(run.state, "lastchance")
	T.ok(Run.command(run, 1, { op = "revive" }))
	T.eq(run.state, "play")
	T.eq(a.state, "active")
	T.near(a.hp, a.stats.maxHp * 0.5, 1e-6)
	T.ok(a.iframe > 2.9)
	a.iframe = 0
	K.hurtPlayer(run, a, 1e6, "test")
	T.eq(run.state, "over", "second death: no more revives")
	T.ok(not Run.command(run, 1, { op = "revive" }))
end)

suite:test("last chance times out", function()
	local run = Sim.new({ n = 1, reviveOffer = true })
	local a = run.players[1]
	a.revivals = 0
	K.hurtPlayer(run, a, 1e6, "test")
	for _ = 1, 11 do
		Run.step(run, 1)
	end
	T.eq(run.state, "over")
end)

suite:test("forge revival still works first", function()
	local run = Sim.new({ n = 1, forge = { revival = 1 } })
	local a = run.players[1]
	T.eq(a.revivals, 1)
	K.hurtPlayer(run, a, 1e6, "test")
	T.eq(a.state, "active")
	T.near(a.hp, a.stats.maxHp * 0.5, 1e-6)
end)

suite:test("leash keeps players near the centroid", function()
	local run = Sim.new({ n = 2 })
	local a, b = run.players[1], run.players[2]
	Sim.advance(run, 12, {
		god = true,
		onStep = function()
			Run.setMove(run, 1, 1, 0)
			Run.setMove(run, 2, -1, 0)
		end,
	})
	local d = math.abs(a.x - b.x)
	T.ok(d <= 2 * Tuning.LEASH_RADIUS + 10, "distance " .. d)
end)

suite:test("network moves are validated (speed clamp, corrections)", function()
	local run = Sim.new({ n = 2 })
	local a = run.players[1]
	a.x, a.y = 0, 0
	local log = {}
	Sim.advance(run, 0.1, { god = true })
	Run.setInput(run, 1, 5000, 0, 1, 1, 0, true)
	Sim.advance(run, 1 / 30, { god = true, log = log })
	T.ok(a.x < 60, "clamped: " .. a.x)
	T.eq(#Sim.filter(log, "correct"), 1)
	-- older seq is ignored
	Run.setInput(run, 1, -100, 0, 0, -1, 0, true)
	T.eq(a.net.seq, 1)
end)

suite:test("targets: enemies chase the nearest active player", function()
	local run = Sim.new({ n = 2 })
	local a, b = run.players[1], run.players[2]
	a.x, a.y = 0, 0
	b.x, b.y = 800, 0
	local e = K.spawnEnemy(run, "skel", 700, 0)
	e.tgt = a
	Sim.advance(run, 1, { god = true })
	T.eq(e.tgt, b)
end)

suite:test("leaving mid-run and the endless vote", function()
	local run = Sim.new({ n = 3 })
	local view = Run.removePlayer(run, 3)
	T.ok(view and view.t >= 0)
	T.eq(run.nPlayers, 2)
	T.eq(run.players[3].state, "left")
	K.enterVictory(run)
	T.eq(run.state, "victory")
	T.ok(Run.command(run, 1, { op = "vote", endless = true }))
	T.eq(run.state, "victory")
	T.ok(Run.command(run, 2, { op = "vote", endless = true }))
	T.eq(run.state, "play")
	T.ok(run.endless)
	K.enterVictory(run)
	Run.command(run, 1, { op = "vote", endless = true })
	Run.command(run, 2, { op = "vote", endless = false })
	T.eq(run.state, "over", "tie means finish")
	local r2 = Sim.new({ n = 2 })
	K.enterVictory(r2)
	for _ = 1, 21 do
		Run.step(r2, 1)
	end
	T.eq(r2.state, "over", "timeout means finish")
end)

return suite
