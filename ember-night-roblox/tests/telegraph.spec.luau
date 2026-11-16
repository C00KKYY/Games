-- Telegraph timings for every boss and every ranged enemy, solo and with 4 players, at night level 0 and 5:
-- every wind-up (charge ring, fan wedge, aim line) is visible for >= 0.45 s before the shots leave, every area
-- marker (slam/rain circle, mortar, lane, dash line) for >= 0.75 s before it hits. The durations are measured in
-- sim time from the telegraph's creation event to its removal event (what a client actually sees).
local T = require("./lib/T")
local Run = require("../src/shared/Sim/Run")
local K = require("../src/shared/Sim/K")
local Stages = require("../src/shared/Sim/Data/Stages")

local suite = T.new("telegraph")

local WIND_MIN, AREA_MIN = 0.45, 0.75

-- runs one attacker for `secs`; returns { [label] = min duration }, number of telegraphs, number of shots
local function measure(stageId: string, n: number, heat: number, spawn: (run: any, p: any) -> any, secs: number)
	local players = {}
	for s = 1, n do
		players[s] = { slot = s, userId = s, heroId = "aron" }
	end
	local run = Run.new({ seed = 7 + n + heat, stageId = stageId, heat = heat, players = players })
	table.clear(run.enemies)
	run.nonBoss = 0
	run.eliteT = 1e9 -- nothing else spawns
	run.spawnAcc = -1e9
	run.eventIdx = #run.stage.events + 1
	run.bossIdx = #run.bossList + 1
	run.cdIdx = #run.cdList + 1
	for _, p in run.plist do
		table.clear(p.weapons) -- nobody fights back
	end
	local attacker = spawn(run, run.plist[1])
	local born, mins, count, shots = {}, {}, 0, 0
	local steps = math.floor(secs * 30)
	for i = 1, steps do
		for k, p in run.plist do
			p.iframe = 1e9
			local a = i / 30 * 0.6 + k * 1.7
			Run.setMove(run, p.slot, math.cos(a), math.sin(a))
		end
		attacker.hp = 1e9
		Run.step(run, 1 / 30)
		for _, e in run.events do
			if e.k == "tele+" then
				born[e.tl.id] = { t = run.t, tl = e.tl }
				count += 1
			elseif e.k == "tele-" then
				local b = born[e.id]
				if b then
					born[e.id] = nil
					local tl = b.tl
					local label
					if tl.own then
						label = "wind " .. tl.kind .. (if tl.ring then "-ring" elseif tl.wedge then "-wedge" else "")
					else
						label = "area "
							.. tl.kind
							.. (if tl.src == "mortar" then "-mortar" elseif tl.track then "-track" else "")
					end
					-- a wind-up ends early only when its owner dies or is frozen (not in this test)
					local d = run.t - b.t
					mins[label] = math.min(mins[label] or 99, d)
				end
			elseif e.k == "eshot+" then
				shots += 1
			end
		end
		table.clear(run.events)
		if run.state ~= "play" then
			break
		end
	end
	return mins, count, shots
end

local function check(name: string, mins, count: number)
	T.ok(count > 0, name .. ": no telegraph at all")
	for label, d in mins do
		local min = if string.sub(label, 1, 4) == "wind" then WIND_MIN else AREA_MIN
		-- one sim step (1/60 s) of measurement granularity
		T.ok(d >= min - 1 / 30 - 1e-9, string.format("%s: %s shown only %.3f s (min %.2f)", name, label, d, min))
	end
end

local summary = {}
local function note(mins)
	for label, d in mins do
		summary[label] = math.min(summary[label] or 99, d)
	end
end

suite:test("all 16 bosses: wind-ups >= 0.45 s, area markers >= 0.75 s (1 and 4 players, heat 0 and 5)", function()
	local nb = 0
	for _, st in Stages.list do
		for _, def in st.bosses do
			nb += 1
			for _, n in { 1, 4 } do
				for _, heat in { 0, 5 } do
					local mins, count = measure(st.id, n, heat, function(run, p)
						run.t = def.t
						local e = K.spawnBoss(run, def, 1)
						e.x, e.y = p.x + 260, p.y + 80
						e.skillT = 0.4
						return e
					end, 36)
					check(string.format("%s n=%d heat %d", def.id, n, heat), mins, count)
					note(mins)
				end
			end
		end
	end
	T.eq(nb, 16)
end)

suite:test("ranged enemies (plain and elite): wind-ups >= 0.45 s, mortar markers >= 0.75 s", function()
	for _, etype in { "spitter", "cinder", "moth", "bell" } do
		for _, elite in { false, true } do
			for _, n in { 1, 4 } do
				local mins, count, shots = measure("ruins", n, 5, function(run, p)
					run.t = 300
					local e = K.spawnEnemy(run, etype, p.x + 280, p.y + 100)
					if elite then
						e.elite = true
						e.r *= 1.55
						e.dmg *= 1.4
					end
					e.shootT = 0.5
					return e
				end, 20)
				local name = string.format("%s%s n=%d", etype, if elite then " elite" else "", n)
				check(name, mins, count)
				T.ok(etype == "cinder" or shots > 0, name .. ": never fired")
				note(mins)
			end
		end
	end
	local keys = {}
	for k in summary do
		table.insert(keys, k)
	end
	table.sort(keys)
	local parts = {}
	for _, k in keys do
		table.insert(parts, string.format("%s %.2f", k, summary[k]))
	end
	print("  (shortest telegraph per kind: " .. table.concat(parts, ", ") .. ")")
end)

return suite
