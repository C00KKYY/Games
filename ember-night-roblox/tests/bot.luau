-- Headless balance runs (docs/DESIGN.md §10.3). Runs end at --tmax (default 1500 s = 25 min, like the web batch).
--   lune run tests/bot.luau -- --land graveyard --forge none --heat 0 --players 1 --runs 24 --seed 1 [--tmax 1080] [--json]
-- Heroes rotate through all 9 per run (like the web balance batch). Output: win rate with Wilson 95 % interval,
-- median death time, first-hit median, level at 1/4/8 minutes, kills/min, enemies alive at 5:00, ms per sim step.
local process = require("@lune/process")
local serde = require("@lune/serde")
local Run = require("../src/shared/Sim/Run")
local Bot = require("./lib/Bot")
local Forge = require("../src/shared/Sim/Data/Forge")
local Heroes = require("../src/shared/Sim/Data/Heroes")

local args = {}
do
	local a = process.args
	local i = 1
	while i <= #a do
		local k = a[i]
		if string.sub(k, 1, 2) == "--" then
			local v = a[i + 1]
			if v == nil or string.sub(v, 1, 2) == "--" then
				args[string.sub(k, 3)] = "1"
				i += 1
			else
				args[string.sub(k, 3)] = v
				i += 2
			end
		else
			i += 1
		end
	end
end

local land = args.land or "graveyard"
local forgeName = args.forge or "none"
local heat = tonumber(args.heat) or 0
local nPlayers = tonumber(args.players) or 1
local runs = tonumber(args.runs) or 12
local seed0 = tonumber(args.seed) or 1
local tmax = tonumber(args.tmax) or 1500 -- 25 min like the web balance batch (TMAX); alive then = "open"
local DT = 1 / 30

local PRESETS = {
	none = {},
	light = { might = 2, maxhp = 1, armor = 1, regen = 2, greed = 2 },
	mid = { might = 4, armor = 2, maxhp = 2, regen = 3, greed = 3, growth = 2, magnet = 1, speed = 1, reroll = 2, cd = 1, area = 1, skip = 1 },
}
local forge = PRESETS[forgeName]
if forgeName == "max" then
	forge = {}
	for _, it in Forge.list do
		forge[it.id] = it.max
	end
end
assert(forge, "unknown forge preset " .. forgeName)

local function median(t)
	if #t == 0 then
		return 0 / 0
	end
	local s = table.clone(t)
	table.sort(s)
	local n = #s
	return if n % 2 == 1 then s[(n + 1) / 2] else (s[n / 2] + s[n / 2 + 1]) / 2
end

local function wilson(k, n)
	if n == 0 then
		return 0, 0
	end
	local z = 1.96
	local p = k / n
	local den = 1 + z * z / n
	local c = (p + z * z / (2 * n)) / den
	local h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
	return math.max(0, c - h), math.min(1, c + h)
end

local opens = 0
local wins, deaths, firstHits, lv1, lv4, lv8, kpm, alive5 = 0, {}, {}, {}, {}, {}, {}, {}
local stepMs = {}
local results = {}
local clock = os.clock
local tAll = clock()
for ri = 1, runs do
	local seed = seed0 + ri - 1
	local players = {}
	for s = 1, nPlayers do
		local hero = Heroes.ORDER[((ri - 1) * nPlayers + s - 1) % #Heroes.ORDER + 1]
		players[s] = { slot = s, userId = s, heroId = hero, forge = forge }
	end
	local run = Run.new({ seed = seed * 7919, stageId = land, heat = heat, players = players })
	local bots = {}
	for s = 1, nPlayers do
		bots[s] = Bot.new(run, s, seed * 104729 + s)
	end
	local steps, simT = 0, 0
	local rec = { seed = seed, heroes = {}, lv = {}, alive5 = nil }
	for s = 1, nPlayers do
		rec.heroes[s] = players[s].heroId
	end
	local nextMin = 1
	while run.state ~= "over" and run.t < tmax do
		if run.state == "levelup" or not run.solo then
			for _, b in bots do
				b:choose()
			end
		end
		if run.state == "chest" then
			Run.command(run, 1, { op = "chestClose" })
		elseif run.state == "victory" then
			for s = 1, nPlayers do
				Run.command(run, s, { op = "vote", endless = false })
			end
		elseif run.state == "play" then
			for _, b in bots do
				b:move()
			end
			local c0 = clock()
			Run.step(run, DT)
			simT += clock() - c0
			steps += 1
		else
			Run.step(run, DT)
		end
		table.clear(run.events)
		if run.t >= nextMin * 60 then
			local lv = 0
			for _, p in run.plist do
				lv = math.max(lv, p.level)
			end
			rec.lv[nextMin] = lv
			if nextMin == 5 then
				local n = 0
				for _, e in run.enemies do
					if not e.dead and not e.boss then
						n += 1
					end
				end
				rec.alive5 = n
			end
			nextMin += 1
		end
	end
	rec.won = run.won
	rec.t = run.t
	rec.kills = run.kills
	rec.ms = if steps > 0 then simT * 1000 / steps else 0
	local fh = math.huge
	for _, p in run.plist do
		if p.firstHit then
			fh = math.min(fh, p.firstHit)
		end
	end
	rec.firstHit = if fh < math.huge then fh else nil
	if run.won then
		wins += 1
	elseif run.t >= tmax - 1 then
		opens += 1
	else
		table.insert(deaths, run.t / 60)
	end
	if rec.firstHit then
		table.insert(firstHits, rec.firstHit)
	end
	if rec.lv[1] then
		table.insert(lv1, rec.lv[1])
	end
	if rec.lv[4] then
		table.insert(lv4, rec.lv[4])
	end
	if rec.lv[8] then
		table.insert(lv8, rec.lv[8])
	end
	if rec.alive5 then
		table.insert(alive5, rec.alive5)
	end
	table.insert(kpm, run.kills / math.max(1, run.t / 60))
	table.insert(stepMs, rec.ms)
	table.insert(results, rec)
	if not args.quiet then
		print(
			string.format(
				"run %2d seed %d %-28s %s t=%5.1f min kills=%d lv=%s ms/step=%.2f",
				ri,
				seed,
				table.concat(rec.heroes, ","),
				if run.won then "WIN " else "lost",
				run.t / 60,
				run.kills,
				tostring(rec.lv[math.min(#rec.lv, 15)] or "-"),
				rec.ms
			)
		)
	end
end
local lo, hi = wilson(wins, runs)
local summary = {
	land = land,
	forge = forgeName,
	heat = heat,
	players = nPlayers,
	runs = runs,
	wins = wins,
	open = opens,
	winRate = wins / runs,
	ci95 = { lo, hi },
	medianDeathMin = median(deaths),
	medianFirstHit = median(firstHits),
	level1 = median(lv1),
	level4 = median(lv4),
	level8 = median(lv8),
	killsPerMin = median(kpm),
	alive5 = median(alive5),
	msPerStep = median(stepMs),
	wallSec = clock() - tAll,
}
print(
	string.format(
		"== %s/%s/heat %d, %d player(s): %d/%d wins = %.0f %% (95 %%: %.0f-%.0f %%), open %d, median death %.1f min, first hit %.0f s, level @1/4/8 min %s/%s/%s, kills/min %.0f, alive@5:00 %s, %.2f ms/step, %.0f s wall",
		land,
		forgeName,
		heat,
		nPlayers,
		wins,
		runs,
		100 * wins / runs,
		100 * lo,
		100 * hi,
		opens,
		summary.medianDeathMin,
		summary.medianFirstHit,
		tostring(summary.level1),
		tostring(summary.level4),
		tostring(summary.level8),
		summary.killsPerMin,
		tostring(summary.alive5),
		summary.msPerStep,
		summary.wallSec
	)
)
if args.json then
	print(serde.encode("json", summary))
end
