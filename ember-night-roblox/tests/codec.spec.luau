local T = require("./lib/T")
local Sim = require("./lib/Sim")
local Codec = require("../src/shared/Net/Codec")
local Run = require("../src/shared/Sim/Run")
local K = Run.K

local suite = T.new("codec")

suite:test("move packet round trip and validation", function()
	local b = Codec.encodeMove(65535 + 7, 123.5, -42.25, 0.6, -0.8, true)
	T.eq(buffer.len(b), 14)
	local m = Codec.decodeMove(b)
	T.eq(m.seq, 6, "wraps at 65536")
	T.near(m.x, 123.5, 1e-4)
	T.near(m.y, -42.25, 1e-4)
	T.near(m.dirX, 0.6, 0.01)
	T.ok(m.moving)
	T.eq(Codec.decodeMove("nope"), nil)
	T.eq(Codec.decodeMove(buffer.create(13)), nil)
	local bad = Codec.encodeMove(1, 0 / 0, 0, 0, 0, false)
	T.eq(Codec.decodeMove(bad), nil, "NaN rejected")
	T.ok(Codec.seqNewer(2, 65530))
	T.ok(not Codec.seqNewer(65530, 2))
end)

suite:test("snapshot round trip, packet sizes and interest", function()
	local run = Sim.new({ n = 2 })
	for i = 1, 330 do
		local e = K.spawnEnemy(run, "bat", (i % 30) * 50 - 700, math.floor(i / 30) * 40 - 200)
		if i == 5 then
			e.elite = true
		end
	end
	local far = K.spawnEnemy(run, "skel", 5000, 0)
	local boss = K.spawnBoss(run, run.bossList[1], 1)
	boss.x, boss.y = 3000, 3000
	local pk = Codec.encodeSnapshot(run, 1234, 0, 0)
	T.ok(#pk >= 2 and #pk <= 3)
	local got, ids = 0, {}
	for _, b in pk do
		T.ok(buffer.len(b) <= 900, "packet " .. buffer.len(b))
		local s = Codec.decodeSnapshot(b)
		T.eq(s.tick, 1234)
		if s.part == 0 then
			T.eq(#s.heroes, 2)
		end
		for _, e in s.enemies do
			got += 1
			ids[e.id] = e
		end
	end
	T.eq(got, 260 + 1, "cap + boss")
	T.ok(ids[boss.id] and ids[boss.id].boss, "boss always sent")
	T.ok(not ids[far.id], "outside interest")
	local e1 = run.enemies[1]
	if ids[e1.id] then
		T.near(ids[e1.id].x, e1.x, 0.51)
		T.eq(ids[e1.id].type, e1.type)
	end
end)

suite:test("event round trip from a real run", function()
	local run = Sim.new({ n = 2, stage = "nightheart", heat = 3 })
	local kinds = {}
	Sim.advance(run, 240, {
		god = true,
		onStep = function(r)
			local b = Codec.encodeEvents(r.events, 1, r.tick, r.plist[1].x, r.plist[1].y)
			if b then
				local evs, tick = Codec.decodeEvents(b)
				T.eq(tick, r.tick % 65536)
				for _, e in evs do
					kinds[e.k] = (kinds[e.k] or 0) + 1
				end
			end
		end,
	})
	for _, k in { "kill", "dmg", "fire", "gem+", "gemGot", "sfx", "tele+", "tele-", "eshot+" } do
		T.ok(kinds[k] and kinds[k] > 0, "kind " .. k)
	end
end)

return suite
