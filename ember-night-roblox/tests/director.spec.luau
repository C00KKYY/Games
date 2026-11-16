local T = require("./lib/T")
local Sim = require("./lib/Sim")
local Run = require("../src/shared/Sim/Run")
local Enemies = require("../src/shared/Sim/Data/Enemies")
local K = Run.K

local suite = T.new("director")

suite:test("waves by minute, rangedCap, cdMul", function()
	local run = Sim.new({ stage = "graveyard" })
	T.eq(K.wave(run), run.stage.waves[1])
	run.t = 61
	T.eq(K.wave(run), run.stage.waves[2])
	run.t = 9999
	T.eq(K.wave(run), run.stage.waves[#run.stage.waves])
	run.t = 0
	T.eq(K.rangedCap(run), 3)
	run.t = 300
	T.eq(K.rangedCap(run), 8)
	run.t = 0
	T.near(K.cdMul(run), 1)
	local ash = Sim.new({ stage = "ashwood", heat = 2 })
	ash.t = 600
	T.near(K.cdMul(ash), 0.75 * (1 - 0.08) * 1.6)
end)

suite:test("no ranged enemies before rangedFrom", function()
	local run = Sim.new({ stage = "graveyard" })
	run.t = 10
	for _ = 1, 500 do
		T.ok(not Enemies.byId[K.pickType(run, K.wave(run))].ranged)
	end
	run.t = 41
	local ranged = 0
	for _ = 1, 500 do
		if Enemies.byId[K.pickType(run, K.wave(run))].ranged then
			ranged += 1
		end
	end
	T.ok(ranged > 20, "ranged after rangedFrom: " .. ranged)
end)

suite:test("first elite at 0:30, events, first boss on time, countdown phases and surge gold", function()
	local run = Sim.new({ stage = "graveyard", seed = 5 })
	local log = {}
	local eliteAt, bossAt
	Sim.advance(run, 200, {
		god = true,
		log = log,
		onStep = function(r)
			for _, e in r.enemies do
				if e.elite and not eliteAt then
					eliteAt = r.t
				end
				if e.boss and not bossAt then
					bossAt = r.t
				end
			end
		end,
	})
	T.ok(eliteAt and eliteAt >= 30 and eliteAt < 30.1, "elite at " .. tostring(eliteAt))
	T.ok(bossAt and bossAt >= 180 and bossAt < 180.1, "boss at " .. tostring(bossAt))
	local cds = Sim.filter(log, "countdown")
	-- surge: warn (1:30), on (2:00), off (2:25); boss countdown: warn (2:40), off (3:00)
	T.eq(cds[1].kind, "surge")
	T.eq(cds[1].phase, "warn")
	T.eq(cds[2].phase, "on")
	T.eq(cds[3].phase, "off")
	T.eq(cds[4].kind, "boss")
	T.eq(cds[4].phase, "warn")
	local ready = false
	for _, b in Sim.filter(log, "banner") do
		if b.text == "Mach dich bereit!" then
			ready = true
		end
	end
	T.ok(ready, "T-10 banner")
	local surgeBanner = nil
	for _, b in Sim.filter(log, "banner") do
		if b.text == "Ansturm überstanden!" then
			surgeBanner = b
		end
	end
	T.ok(surgeBanner, "surge end banner")
	-- god mode keeps iframes up, so no hit -> double gold (15 x greed 1 x heat gold 1 x 2)
	T.eq(surgeBanner.args[1], 30)
	-- events up to 3:00 all ran
	local evs = 0
	for _, e in run.stage.events do
		if e.t <= 200 then
			evs += 1
		end
	end
	T.eq(run.eventIdx - 1, evs)
end)

suite:test("endless mode spawns a boss every 120 s", function()
	local run = Sim.new({ stage = "graveyard" })
	run.t = run.length + 1
	run.bossIdx = #run.bossList + 1
	run.eventIdx = #run.stage.events + 1
	run.cdIdx = #run.cdList + 1
	run.endless = true
	run.endlessBossT = 120
	local bosses = 0
	Sim.advance(run, 245, {
		god = true,
		onStep = function(r)
			bosses = #r.bosses
		end,
	})
	T.eq(bosses, 2)
	T.ok(not run.bosses[1].boss.final)
end)

suite:test("global enemy cap", function()
	local run = Sim.new({ stage = "nightheart", n = 4, heat = 5 })
	local maxN = 0
	Sim.advance(run, 120, {
		god = true,
		onStep = function(r)
			local n = 0
			for _, e in r.enemies do
				if not e.boss and not e.dead then
					n += 1
				end
			end
			maxN = math.max(maxN, n)
		end,
	})
	T.ok(maxN <= 450 + 12, "non-boss enemies " .. maxN)
end)

return suite
