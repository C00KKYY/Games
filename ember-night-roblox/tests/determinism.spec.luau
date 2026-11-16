-- Same seed + same inputs -> identical event stream (docs/DESIGN.md §0).
local T = require("./lib/T")
local Run = require("../src/shared/Sim/Run")
local Bot = require("./lib/Bot")

local suite = T.new("determinism")

local function hashRun(seed: number, n: number, seconds: number): (string, number)
	local players = {}
	for s = 1, n do
		players[s] = { slot = s, heroId = ({ "aron", "nyx", "ignis", "kael" })[s] }
	end
	local run = Run.new({ seed = seed, stageId = "ruins", heat = 1, players = players })
	local bots = {}
	for s = 1, n do
		bots[s] = Bot.new(run, s, seed + s)
	end
	local h = 0
	local count = 0
	local function mix(v: number)
		h = (h * 31 + math.floor(v * 1000) % 1000003) % 2147483647
	end
	while run.t < seconds and run.state ~= "over" do
		for _, b in bots do
			b:choose()
		end
		if run.state == "chest" then
			Run.command(run, 1, { op = "chestClose" })
		end
		for _, b in bots do
			b:move()
		end
		Run.step(run, 1 / 30)
		for _, e in run.events do
			count += 1
			mix(#e.k)
			mix(e.x or 0)
			mix(e.y or 0)
			mix(e.id or 0)
		end
		table.clear(run.events)
	end
	for _, p in run.plist do
		mix(p.x)
		mix(p.y)
		mix(p.hp)
		mix(p.level)
	end
	return tostring(h) .. ":" .. run.rng:state(), count
end

suite:test("solo: identical after 3 simulated minutes", function()
	local a, n = hashRun(77, 1, 180)
	local b = hashRun(77, 1, 180)
	T.eq(a, b)
	T.ok(n > 1000, "events " .. n)
	local c = hashRun(78, 1, 180)
	T.ok(a ~= c, "other seed differs")
end)

suite:test("4 players: identical after 2 simulated minutes", function()
	local a = hashRun(5, 4, 120)
	local b = hashRun(5, 4, 120)
	T.eq(a, b)
end)

return suite
