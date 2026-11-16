local T = require("./lib/T")
local Sim = require("./lib/Sim")
local Run = require("../src/shared/Sim/Run")
local Results = require("../src/shared/Sim/Results")
local Profile = require("../src/shared/Sim/Profile")
local Achievements = require("../src/shared/Sim/Data/Achievements")
local K = Run.K

local suite = T.new("results")

suite:test("every achievement has a check", function()
	for _, a in Achievements.list do
		T.ok(Results.CHECK[a.id], "check for " .. a.id)
	end
end)

suite:test("endRun gold: time bonus, boss bonus, heat multiplier, gift, 2x pass", function()
	local run = Sim.new({ heat = 2 })
	local pl = run.plist[1]
	run.t = 125
	run.bossKills = 1
	pl.gold = 40
	local prof = Profile.default()
	local s = Results.finish(run, 1, prof, {})
	-- heat 2 gold x1.6: time 2 min x 6 x 1.6 = 19.2 -> 19; boss 25 x 1.6 = 40
	T.eq(s.timeBonus, 19)
	T.eq(s.bossBonus, 40)
	-- first run gift: cheapest forge item costs 120
	T.eq(s.gift, 120 - (40 + 19 + 40))
	T.eq(prof.gold, 120 + 20, "t1 achievement adds 20 gold")
	T.ok(prof.giftGiven)
	T.eq(prof.stats.runs, 1)
	local run2 = Sim.new({ heat = 0 })
	run2.plist[1].gold = 100
	run2.t = 30
	local prof2 = Profile.default()
	prof2.giftGiven = true
	local s2 = Results.finish(run2, 1, prof2, { gold2x = true })
	T.eq(s2.pass2x, 100)
	T.eq(s2.total, 200)
end)

suite:test("achievements, hero unlocks and banking", function()
	local run = Sim.new({})
	local pl = run.plist[1]
	local prof = Profile.default()
	pl.level = 20
	run.t = 601
	pl.bank.kills = 3000
	pl.bank.evolutions = 1
	pl.bank.evolved.wand = true
	pl.bank.bosses.bonelord = true
	local new = Results.checkAchievements(run, 1, prof)
	local has = {}
	for _, id in new do
		has[id] = true
	end
	T.ok(has.lvl20 and has.t10 and has.kills3000 and has.evo1 and has.boss_bonelord)
	for _, h in { "kael", "sela", "brom", "nyx", "eira" } do
		T.ok(table.find(prof.chars, h), h .. " unlocked")
	end
	T.eq(prof.stats.kills, 3000)
	T.eq(pl.bank.kills, 0, "banked once")
	T.eq(#Results.checkAchievements(run, 1, prof), 0, "no double award")
end)

suite:test("victory: recordClear unlocks the next land and heat for every player", function()
	local run = Sim.new({ n = 2 })
	local p1, p2 = Profile.default(), Profile.default()
	run.won = true
	run.t = 650
	local c = Results.recordClear(run, 1, p1)
	T.eq(c.stars, 1)
	T.eq(c.newStage, "ashwood")
	T.eq(c.newHeat, 1)
	Results.finish(run, 1, p1, {})
	Results.finish(run, 2, p2, {})
	T.eq(p1.stats.wins, 1, "recordClear not counted twice")
	T.eq(p2.stages.graveyard, 0, "carried player also gets the clear")
	T.ok(p2.achievements.win)
	T.eq(p2.stats.coopRuns, 1)
end)

suite:test("a final boss kill triggers victory", function()
	local run = Sim.new({})
	local def = run.bossList[#run.bossList]
	local b = K.spawnBoss(run, def, 1)
	K.kill(run, b, 1)
	T.eq(run.state, "victory")
	T.ok(run.won)
	T.ok(run.plist[1].bank.bosses[def.id])
end)

return suite
