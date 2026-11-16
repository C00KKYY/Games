local T = require("./lib/T")
local Sim = require("./lib/Sim")
local Run = require("../src/shared/Sim/Run")
local Weapons = require("../src/shared/Sim/Data/Weapons")
local K = Run.K

local suite = T.new("levelup")

suite:test("options: count, no duplicates, early new weapon rule", function()
	local run = Sim.new({})
	local pl = run.plist[1]
	for _ = 1, 300 do
		local opts = K.buildOptions(run, pl, 3)
		T.eq(#opts, 3)
		local seen, newW = {}, false
		for _, o in opts do
			T.ok(not seen[o.kind .. o.id], "duplicate")
			seen[o.kind .. o.id] = true
			if o.kind == "weapon" and o.isNew then
				newW = true
			end
		end
		T.ok(newW, "level <= 4 with one weapon offers a new weapon")
	end
end)

suite:test("weights 10/8/7/6 roughly", function()
	local run = Sim.new({})
	local pl = run.plist[1]
	pl.level = 10
	table.insert(pl.passives, { id = "might", level = 1 })
	local cnt = { up = 0, pup = 0, nw = 0, np = 0 }
	for _ = 1, 4000 do
		local o = K.buildOptions(run, pl, 1)[1]
		if o.kind == "weapon" then
			if o.isNew then
				cnt.nw += 1
			else
				cnt.up += 1
			end
		else
			if o.isNew then
				cnt.np += 1
			else
				cnt.pup += 1
			end
		end
	end
	-- candidates: 1 weapon upgrade (10), 1 passive upgrade (8), 8 new weapons (7 each), 11 new passives (6 each)
	local total = 10 + 8 + 56 + 66
	T.near(cnt.up / 4000, 10 / total, 0.02, "weapon upgrade")
	T.near(cnt.nw / 4000, 56 / total, 0.03, "new weapon")
	T.near(cnt.np / 4000, 66 / total, 0.03, "new passive")
end)

suite:test("solo pauses for level-up; reroll, skip, banish counters", function()
	local run = Sim.new({ forge = { reroll = 2, skip = 1, banish = 1 } })
	local pl = run.plist[1]
	T.eq(pl.rerolls, 2)
	T.eq(pl.skips, 1)
	T.eq(pl.banishes, 1)
	K.gainXp(run, pl, 1000)
	T.ok(pl.pendingLevels > 1)
	Run.step(run, 1 / 30)
	T.eq(run.state, "levelup")
	local t0 = run.t
	Run.step(run, 1 / 30)
	T.eq(run.t, t0, "world paused")
	T.ok(Run.command(run, 1, { op = "reroll" }))
	T.eq(pl.rerolls, 1)
	local bi = nil
	for i, o in pl.offer do
		if o.isNew then
			bi = i
		end
	end
	if bi then
		local id = pl.offer[bi].id
		T.ok(Run.command(run, 1, { op = "banish", i = bi }))
		T.ok(pl.banished[id])
		T.eq(pl.banishes, 0)
	end
	local pend = pl.pendingLevels
	T.ok(Run.command(run, 1, { op = "skip" }))
	T.eq(pl.pendingLevels, pend - 1)
	T.ok(not Run.command(run, 1, { op = "skip" }), "no skips left")
	T.ok(Run.command(run, 1, { op = "pick", i = 1 }))
end)

suite:test("chest evolves a max weapon with its partner passive", function()
	local run = Sim.new({ hero = "mira" })
	local pl = run.plist[1]
	local w = pl.weapons[1]
	T.eq(w.id, "wand")
	w.level = Weapons.WEAPON_MAX
	table.insert(pl.passives, { id = "hourglass", level = 1 })
	K.refreshStats(run, pl)
	pl.pendingChests = 1
	local res = K.openChest(run, pl)
	T.eq(res.evolved, "wand")
	T.ok(w.evo)
	T.eq(pl.evolvedCount, 1)
	T.ok(pl.bank.evolved.wand)
	T.ok(res.gold >= 15 and res.gold <= 40)
	T.eq(run.state, "chest")
	Run.command(run, 1, { op = "chestClose" })
	T.eq(run.state, "play")
end)

suite:test("chest without evolution gives 1, 3 or 5 items", function()
	local run = Sim.new({})
	local pl = run.plist[1]
	local n = { [1] = 0, [3] = 0, [5] = 0 }
	for _ = 1, 400 do
		pl.weapons[1].level = 1
		K.refreshStats(run, pl)
		local res = K.openChest(run, pl)
		n[#res.items] = (n[#res.items] or 0) + 1
	end
	T.ok(n[1] > 250 and n[3] > 40 and n[5] > 5, string.format("%d/%d/%d", n[1], n[3], n[5]))
end)

return suite
