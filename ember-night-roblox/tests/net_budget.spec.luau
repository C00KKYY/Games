-- Bandwidth estimate from a 4-bot run through the encoder (docs/DESIGN.md §3.4): snapshots at 15 Hz, event buffers
-- every step. Prints the measured numbers; fails above the worst-case budget.
local T = require("./lib/T")
local Run = require("../src/shared/Sim/Run")
local Codec = require("../src/shared/Net/Codec")
local Bot = require("./lib/Bot")

local suite = T.new("net_budget")

local function measure(stage, heat, seconds, startAt)
	local players = {}
	for s = 1, 4 do
		players[s] = { slot = s, heroId = ({ "nyx", "aron", "ignis", "kael" })[s], forge = { might = 5, armor = 3, maxhp = 3, regen = 5, amount = 1 } }
	end
	local run = Run.new({ seed = 3, stageId = stage, heat = heat, players = players })
	local bots = {}
	for s = 1, 4 do
		bots[s] = Bot.new(run, s, 40 + s)
	end
	local snapBytes, snapN, evBytes, maxPkt, maxSnap, maxSec = 0, 0, 0, 0, 0, 0
	local secBytes, secT = 0, 0
	local measuring = false
	local step = 0
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
		if run.state == "victory" then
			break
		end
		for _, b in bots do
			b:move()
		end
		Run.step(run, 1 / 30)
		step += 1
		measuring = run.t >= (startAt or 0)
		if measuring then
			local p = run.plist[1]
			local b = Codec.encodeEvents(run.events, 1, step, p.x, p.y)
			local stepBytes = if b then buffer.len(b) else 0
			if step % 2 == 0 then
				local pk = Codec.encodeSnapshot(run, step, p.x, p.y)
				local sz = 0
				for _, q in pk do
					sz += buffer.len(q)
					maxPkt = math.max(maxPkt, buffer.len(q))
				end
				snapBytes += sz
				snapN += 1
				maxSnap = math.max(maxSnap, sz)
				stepBytes += sz
			end
			evBytes += stepBytes - 0
			secBytes += stepBytes
			if run.t - secT >= 1 then
				maxSec = math.max(maxSec, secBytes)
				secBytes = 0
				secT = run.t
			end
		end
		table.clear(run.events)
	end
	local dur = run.t - (startAt or 0)
	return {
		avgSnap = snapBytes / math.max(1, snapN),
		maxSnap = maxSnap,
		maxPkt = maxPkt,
		kbps = evBytes / dur / 1024,
		snapKbps = snapBytes / dur / 1024,
		maxSecKb = maxSec / 1024,
		enemies = #run.enemies,
		t = run.t,
	}
end

local function report(label, m)
	print(
		string.format(
			"  net %s: avg snapshot %.0f B (max %d B, max packet %d B), downstream avg %.1f KB/s (snapshots %.1f), worst second %.1f KB, enemies at end %d",
			label,
			m.avgSnap,
			m.maxSnap,
			m.maxPkt,
			m.kbps,
			m.snapKbps,
			m.maxSecKb,
			m.enemies
		)
	)
end

suite:test("4 players, nightheart heat 3, minutes 0-5", function()
	local m = measure("nightheart", 3, 300)
	report("0-5 min", m)
	T.ok(m.maxPkt <= 900, "packet size")
	T.ok(m.kbps <= 45, "average downstream " .. m.kbps)
end)

return suite
