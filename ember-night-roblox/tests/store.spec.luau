-- Profile sessions (Shared/Server/ProfileStore.luau, docs/DESIGN.md §6.2): load with session lock, migration,
-- saves that respect the lock, retries, failures before and after a write, two servers.
local T = require("./lib/T")
local FakeStore = require("./lib/FakeStore")
local ProfileStore = require("../src/shared/Server/ProfileStore")
local Profile = require("../src/shared/Sim/Profile")

local suite = T.new("store")
local UID = 42
local KEY = ProfileStore.key(UID)

suite:test("new profile: defaults, created, lock written, memory without lock", function()
	local fs = FakeStore.new()
	local st = ProfileStore.new(fs:opts("jobA"))
	local p = assert(st:load(UID))
	T.eq(p.gold, 0)
	T.eq(p.v, Profile.VERSION)
	T.eq(p.created, fs.clock)
	T.eq(p._lock, nil)
	T.eq(fs.data[KEY]._lock.job, "jobA")
	T.eq(st:load(UID), p, "second load returns the same session")
end)

suite:test("played profile survives a JSON round trip", function()
	local fs = FakeStore.new()
	local st = ProfileStore.new(fs:opts("jobA"))
	local p = assert(st:load(UID))
	p.gold = 1234
	Profile.forgeBuy(p, "might")
	p.stages.graveyard = 2
	p.stageHeat.graveyard = 1
	p.achievements.t1 = true
	table.insert(p.chars, "kael")
	p.cosmetics.owned.skin_frost = true
	p.cosmetics.equipped.skin = "skin_frost"
	p.receipts["r-1"] = 99
	p.settings.lang = "de"
	p.stats.kills = 777
	T.ok(st:save(UID, true))
	T.eq(fs.data[KEY]._lock, nil, "released")
	local st2 = ProfileStore.new(fs:opts("jobB"))
	local q = assert(st2:load(UID))
	T.eq(q.gold, p.gold)
	T.eq(q.shop.might, 1)
	T.eq(q.shopSpent, p.shopSpent)
	T.eq(q.stages.graveyard, 2)
	T.eq(q.stageHeat.graveyard, 1)
	T.ok(q.achievements.t1)
	T.eq(q.chars[3], "kael")
	T.ok(q.cosmetics.owned.skin_frost)
	T.eq(q.cosmetics.equipped.skin, "skin_frost")
	T.eq(q.receipts["r-1"], 99)
	T.eq(q.settings.lang, "de")
	T.eq(q.stats.kills, 777)
	T.eq(fs.slept, 0, "no waiting after a release")
end)

suite:test("live lock: second server waits 5 x 6 s, takes over; the first server stops saving", function()
	local fs = FakeStore.new()
	local a = ProfileStore.new(fs:opts("jobA"))
	local pa = assert(a:load(UID))
	pa.gold = 10
	local b = ProfileStore.new(fs:opts("jobB"))
	local t0 = fs.clock
	local pb = assert(b:load(UID))
	T.eq(fs.clock - t0, 30, "5 waits of 6 s")
	T.eq(fs.data[KEY]._lock.job, "jobB")
	T.eq(pb.gold, 0, "A never saved its 10 gold")
	pa.gold = 999
	local ok, why = a:save(UID)
	T.ok(not ok)
	T.eq(why, "lost")
	T.ok(a:isLost(UID))
	T.eq(fs.data[KEY].gold, 0, "A's write was refused")
	local ok2 = a:save(UID, true)
	T.ok(not ok2, "still lost on release")
	T.eq(fs.data[KEY]._lock.job, "jobB", "B keeps the lock")
	T.ok(b:save(UID))
end)

suite:test("a lock released while waiting is taken at the next try", function()
	local fs = FakeStore.new()
	local a = ProfileStore.new(fs:opts("jobA"))
	assert(a:load(UID))
	local b = ProfileStore.new(fs:opts("jobB"))
	local n = 0
	fs.during = function()
		n += 1
		if n == 3 then
			fs.during = nil
			a:save(UID, true) -- A releases while B is waiting
		end
	end
	local t0 = fs.clock
	assert(b:load(UID))
	T.ok(fs.clock - t0 < 30, "did not wait for all tries")
	T.eq(fs.data[KEY]._lock.job, "jobB")
end)

suite:test("stale lock (crashed server) is taken at once", function()
	local fs = FakeStore.new()
	fs.data[KEY] = { v = 2, gold = 5, _lock = { job = "dead", t = fs.clock - 1801 } }
	local st = ProfileStore.new(fs:opts("jobA"))
	local p = assert(st:load(UID))
	T.eq(p.gold, 5)
	T.eq(fs.slept, 0)
end)

suite:test("load retries failing calls with backoff 1/2/4 s, gives up after 4 attempts", function()
	local fs = FakeStore.new()
	fs.failBefore = 2
	local st = ProfileStore.new(fs:opts("jobA"))
	assert(st:load(UID))
	T.eq(fs.slept, 3, "1 + 2 s")
	local fs2 = FakeStore.new()
	fs2.failBefore = 4
	local st2 = ProfileStore.new(fs2:opts("jobA"))
	local p, why = st2:load(UID)
	T.eq(p, nil)
	T.eq(why, "error")
	T.eq(st2:get(UID), nil, "no half session left behind")
	T.eq(fs2.data[KEY], nil)
end)

suite:test("load that wrote before failing: the retry sees its own lock", function()
	local fs = FakeStore.new()
	fs.failAfter = 1
	local st = ProfileStore.new(fs:opts("jobA"))
	assert(st:load(UID))
	T.eq(fs.slept, 1, "one retry, no lock wait")
	T.eq(fs.data[KEY]._lock.job, "jobA")
end)

suite:test("profile from a newer server version is not loaded and not touched", function()
	local fs = FakeStore.new()
	fs.data[KEY] = { v = Profile.VERSION + 1, gold = 77, future = { x = 1 } }
	local st = ProfileStore.new(fs:opts("jobA"))
	local p, why = st:load(UID)
	T.eq(p, nil)
	T.eq(why, "newer")
	T.eq(fs.data[KEY].future.x, 1)
	T.eq(fs.data[KEY]._lock, nil, "no lock written")
	T.eq(fs.writes, 0)
end)

suite:test("migration: v1 crimson weapon colour becomes solar, missing version = 1, garbage = default", function()
	local fs = FakeStore.new()
	fs.data[KEY] = {
		v = 1,
		gold = 50,
		cosmetics = {
			owned = { fx_crimson = true, trail_star = true, nope = true },
			equipped = { fx = "fx_crimson", trail = "skin_frost" },
		},
	}
	local st = ProfileStore.new(fs:opts("jobA"))
	local p = assert(st:load(UID))
	T.eq(p.v, 2)
	T.eq(p.gold, 50)
	T.ok(p.cosmetics.owned.fx_solar)
	T.eq(p.cosmetics.owned.fx_crimson, nil)
	T.eq(p.cosmetics.owned.nope, nil)
	T.ok(p.cosmetics.owned.trail_star)
	T.eq(p.cosmetics.equipped.fx, "fx_solar")
	T.eq(p.cosmetics.equipped.trail, nil, "a skin in the trail slot is dropped")
	T.eq(fs.data[KEY].v, 2, "stored as v2 with the lock")
	-- no version field
	local m = assert(Profile.migrate({ gold = 3, cosmetics = { equipped = { fx = "fx_crimson" } } }))
	T.eq(m.v, 2)
	T.eq(m.cosmetics.equipped.fx, "fx_solar")
	-- garbage
	T.eq(Profile.migrate("oops").gold, 0)
	T.eq(Profile.migrate({ v = "x", gold = "y" }).gold, 0)
	-- migrate never mutates its input
	local raw = { v = 1, cosmetics = { owned = { fx_crimson = true } } }
	Profile.migrate(raw)
	T.ok(raw.cosmetics.owned.fx_crimson)
end)

suite:test("save that wrote before failing is recognised by its stamp (no false 'lost')", function()
	local fs = FakeStore.new()
	local st = ProfileStore.new(fs:opts("jobA"))
	local p = assert(st:load(UID))
	p.gold = 300
	fs.failAfter = 1
	T.ok(st:save(UID))
	T.eq(fs.data[KEY].gold, 300)
	-- same for the release save: the first attempt removed the lock, the retry must not call that 'lost'
	p.gold = 400
	fs.failAfter = 1
	local ok, why = st:save(UID, true)
	T.ok(ok, tostring(why))
	T.eq(fs.data[KEY].gold, 400)
	T.eq(fs.data[KEY]._lock, nil)
	T.eq(st:get(UID), nil, "session dropped")
end)

suite:test("UpdateAsync calling the transform twice changes nothing", function()
	local fs = FakeStore.new()
	fs.twice = true
	local st = ProfileStore.new(fs:opts("jobA"))
	local p = assert(st:load(UID))
	p.gold = 12
	T.ok(st:save(UID))
	T.eq(fs.data[KEY].gold, 12)
	T.eq(fs.data[KEY]._lock.job, "jobA")
end)

suite:test("saves of different players do not block each other; users() lists loaded sessions", function()
	local fs = FakeStore.new()
	local st = ProfileStore.new(fs:opts("jobA"))
	assert(st:load(1))
	assert(st:load(2))
	T.eq(#st:users(), 2)
	T.ok(st:save(1, true))
	T.eq(#st:users(), 1)
	T.eq(st:users()[1], 2)
end)

return suite
