-- Client snapshot interpolation (src/client/Net/Interp.luau is pure and runs under Lune).
local T = require("./lib/T")
local Interp = require("../src/client/Net/Interp")

local suite = T.new("interp")

local function snap(tick, part, parts, enemies, heroes)
	return { tick = tick, part = part, parts = parts, enemies = enemies or {}, heroes = heroes or {} }
end

suite:test("interpolates between snapshots at latest - delay", function()
	local it = Interp.new(4, 30)
	it:push(snap(10, 0, 1, { { id = 1, x = 0, y = 0 } }, { { slot = 2, x = 0, y = 0 } }))
	it:push(snap(12, 0, 1, { { id = 1, x = 20, y = 0 } }, { { slot = 2, x = 10, y = 0 } }))
	it:push(snap(14, 0, 1, { { id = 1, x = 40, y = 0 } }, { { slot = 2, x = 20, y = 0 } }))
	it:update(0)
	T.eq(it.renderTick, 10)
	it.renderTick = 11
	local got = nil
	it:eachEnemy(function(id, x)
		if id == 1 then
			got = x
		end
	end)
	T.near(got, 10, 1e-9)
	local hx = it:hero(2)
	T.near(hx, 5, 1e-9)
end)

suite:test("multi-part snapshots merge; tick wrap", function()
	local it = Interp.new(4, 30)
	it:push(snap(65534, 0, 2, { { id = 1, x = 0, y = 0 } }))
	it:push(snap(65534, 1, 2, { { id = 2, x = 5, y = 5 } }))
	it:push(snap(0, 0, 1, { { id = 1, x = 10, y = 0 }, { id = 2, x = 5, y = 5 } }))
	T.eq(it.latest, 65536, "unwrapped")
	local f = it.frames[1]
	T.ok(f.enemies[1] and f.enemies[2], "both parts")
	it:update(0)
	it.renderTick = 65535
	local n = 0
	it:eachEnemy(function()
		n += 1
	end)
	T.eq(n, 2)
end)

suite:test("render clock follows the stream", function()
	local it = Interp.new(4, 30)
	for t = 0, 40, 2 do
		it:push(snap(t, 0, 1, {}))
	end
	it:update(0)
	T.eq(it.renderTick, 36)
	for _ = 1, 10 do
		it:update(1 / 60)
	end
	T.ok(it.renderTick > 36 and it.renderTick <= 41, tostring(it.renderTick))
end)

return suite
