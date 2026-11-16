-- Sim cost and snapshot size (docs/DESIGN.md §3.4).
--   lune run tests/bench.luau                 synthetic: 4 players, 300 enemies kept alive, 40 s
--   lune run tests/bench.luau -- --full       plus 4 bots on Herz der Nacht, heat 5, up to 12:00 (slow)
local process = require("@lune/process")
local Run = require("../src/shared/Sim/Run")
local Codec = require("../src/shared/Net/Codec")
local Bot = require("./lib/Bot")
local Forge = require("../src/shared/Sim/Data/Forge")
local K = Run.K

local full = table.find(process.args, "--full") ~= nil
local clock = os.clock

local function pct(t, q)
	local s = table.clone(t)
	table.sort(s)
	return s[math.max(1, math.ceil(#s * q))]
end

local maxForge = {}
for _, it in Forge.list do
	maxForge[it.id] = it.max
end

local function players4()
	local p = {}
	for s = 1, 4 do
		p[s] = { slot = s, heroId = ({ "nyx", "aron", "ignis", "kael" })[s], forge = maxForge }
	end
	return p
end

-- synthetic: exactly 300 enemies around the party, all weapons at level 8
do
	local run = Run.new({ seed = 9, stageId = "nightheart", heat = 3, players = players4() })
	run.t = 400
	for _, pl in run.plist do
		for _, id in { "lightning", "knives", "orbit", "fire", "sickle", "nova" } do
			local has = false
			for _, w in pl.weapons do
				if w.id == id then
					has = true
				end
			end
			if not has and #pl.weapons < 6 then
				K.addWeapon(run, pl, id)
			end
		end
		for _, w in pl.weapons do
			w.level = 8
		end
		K.refreshStats(run, pl)
	end
	local types = { "bat", "skel", "ghost", "ghoul", "wraith", "brute", "spitter", "moth" }
	local function refill()
		local n = 0
		for _, e in run.enemies do
			if not e.dead and not e.boss then
				n += 1
			end
		end
		local i = 0
		while n < 300 do
			i += 1
			local a = (i * 2.399) % (math.pi * 2)
			local d = 150 + (i * 37) % 500
			local e = K.spawnEnemy(run, types[i % #types + 1], math.cos(a) * d, math.sin(a) * d)
			e.hp *= 30
			e.maxHp = e.hp
			n += 1
		end
	end
	local times, snap = {}, {}
	local snapPk = 0
	for step = 1, 30 * 40 do
		refill()
		for _, p in run.plist do
			p.iframe = 1e9
			p.hp = p.stats.maxHp
			p.offer = nil
			p.pendingLevels = 0
			local a = step * 0.01 + p.slot
			Run.setMove(run, p.slot, math.cos(a), math.sin(a))
		end
		-- no director spawns: the bench keeps exactly 300 enemies itself
		run.eliteT = 1e9
		run.spawnAcc = -1e9
		run.eventIdx = 1e9
		run.bossIdx = 1e9
		run.cdIdx = 1e9
		local c0 = clock()
		Run.step(run, 1 / 30)
		local dt = (clock() - c0) * 1000
		if step > 60 then
			table.insert(times, dt)
		end
		if step % 2 == 0 then
			local total = 0
			for _, p in run.plist do
				local pk = Codec.encodeSnapshot(run, step, p.x, p.y)
				for _, b in pk do
					total += buffer.len(b)
				end
				snapPk = math.max(snapPk, #pk)
			end
			table.insert(snap, total / 4)
		end
		table.clear(run.events)
	end
	local alive = 0
	for _, e in run.enemies do
		if not e.dead then
			alive += 1
		end
	end
	print(
		string.format(
			"synthetic 4 players, 300 enemies (alive at end %d), eshots %d, player shots %d: step median %.2f ms, p99 %.2f ms, max %.2f ms",
			alive,
			#run.eshots,
			#run.shots,
			pct(times, 0.5),
			pct(times, 0.99),
			pct(times, 1)
		)
	)
	print(
		string.format(
			"snapshot per client: median %.0f B, max %.0f B, up to %d packets; at 15 Hz = %.1f KB/s per client",
			pct(snap, 0.5),
			pct(snap, 1),
			snapPk,
			pct(snap, 0.5) * 15 / 1024
		)
	)
end

if full then
	local run = Run.new({ seed = 21, stageId = "nightheart", heat = 5, players = players4() })
	local bots = {}
	for s = 1, 4 do
		bots[s] = Bot.new(run, s, 900 + s)
	end
	local times = {}
	local maxEn = 0
	while run.t < 720 and run.state ~= "over" do
		for _, p in run.plist do
			if p.state == "active" then
				p.iframe = 1e9
				p.hp = p.stats.maxHp
			end
		end
		for _, b in bots do
			b:choose()
		end
		for _, b in bots do
			b:move()
		end
		local c0 = clock()
		Run.step(run, 1 / 30)
		table.insert(times, (clock() - c0) * 1000)
		maxEn = math.max(maxEn, #run.enemies)
		table.clear(run.events)
	end
	print(
		string.format(
			"4 bots nightheart heat 5 to %.0f s: step median %.2f ms, p99 %.2f ms, max enemies %d",
			run.t,
			pct(times, 0.5),
			pct(times, 0.99),
			maxEn
		)
	)
end
