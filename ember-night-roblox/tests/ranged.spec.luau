-- Ranged enemies and bosses: caps never exceeded, every shot is announced, wind-up and area warnings long enough.
local T = require("./lib/T")
local Run = require("../src/shared/Sim/Run")
local Bot = require("./lib/Bot")
local Coop = require("../src/shared/Sim/Coop")

local suite = T.new("ranged")

local function scenario(stage: string, n: number, seconds: number, startT: number?)
	local players = {}
	for s = 1, n do
		players[s] = { slot = s, heroId = "aron", forge = { might = 5, armor = 3, maxhp = 3, regen = 5 } }
	end
	local run = Run.new({ seed = 11, stageId = stage, heat = 3, players = players })
	local bots = {}
	for s = 1, n do
		bots[s] = Bot.new(run, s, 100 + s)
	end
	local stats = { maxE = 0, maxT = 0, shots = 0, unannounced = 0, minCircle = 99, minWind = 99, bossShots = 0 }
	local announced = {}
	while run.t < seconds and run.state ~= "over" do
		for _, p in run.plist do
			if p.state == "active" then
				p.iframe = 1e9
				p.hp = p.stats.maxHp
			end
		end
		for _, b in bots do
			b:choose()
		end
		if run.state == "chest" then
			Run.command(run, 1, { op = "chestClose" })
		end
		if run.state == "victory" then
			break
		end
		for _, b in bots do
			b:move()
		end
		Run.step(run, 1 / 30)
		stats.maxE = math.max(stats.maxE, #run.eshots)
		stats.maxT = math.max(stats.maxT, #run.tele)
		for _, e in run.events do
			if e.k == "tele+" then
				local tl = e.tl
				if tl.follow then
					announced[tl.follow] = run.t
				end
				if tl.kind == "circle" and not tl.track then
					stats.minCircle = math.min(stats.minCircle, tl.life)
				end
				if tl.own then
					stats.minWind = math.min(stats.minWind, tl.life)
				end
			elseif e.k == "eshot+" then
				stats.shots += 1
				if e.s.src == "bossShot" then
					stats.bossShots += 1
				end
			end
		end
		table.clear(run.events)
	end
	stats.capE = Coop.f(Coop.eshotCapBoss, n)
	stats.capT = Coop.f(Coop.teleCap, n)
	return stats
end

suite:test("solo ruins heat 3: caps, warnings", function()
	local s = scenario("ruins", 1, 300)
	T.ok(s.shots > 50, "enemies fired " .. s.shots)
	T.ok(s.maxE <= s.capE, "eshots " .. s.maxE)
	T.ok(s.maxT <= s.capT, "telegraphs " .. s.maxT)
	T.ok(s.minCircle >= 0.75, "area warning " .. s.minCircle)
	T.ok(s.minWind >= 0.45, "wind-up " .. s.minWind)
	T.ok(s.bossShots > 0, "boss attacked")
end)

suite:test("4 players nightheart heat 3: caps", function()
	local s = scenario("nightheart", 4, 260)
	T.ok(s.maxE <= s.capE, "eshots " .. s.maxE)
	T.ok(s.maxT <= s.capT, "telegraphs " .. s.maxT)
end)

return suite
