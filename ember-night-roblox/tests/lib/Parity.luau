-- Runs the scripted parity scenarios of tests/ref/parity.json (written by tools/ref-sim.js from the web game's code)
-- with the Luau sim and compares the per-step digests. See tools/ref-sim.js for the scenario definitions.
local Run = require("../../src/shared/Sim/Run")
local K = require("../../src/shared/Sim/K")
local Stats = require("../../src/shared/Sim/Stats")
local Ref = require("./Ref")
local Tuning = require("../../src/shared/Config/Tuning")

local Parity = {}

-- the scripted "random" sequence shared with tools/ref-sim.js (web formulas for rand, randi, pick, weightedPick)
local Scripted = {}
Scripted.__index = Scripted
function Scripted.new()
	return setmetatable({ n = 0 }, Scripted)
end
function Scripted:next(): number
	local x = 0.137 + self.n * 0.6180339887498949
	self.n += 1
	return x - math.floor(x)
end
function Scripted:range(a: number, b: number): number
	return a + self:next() * (b - a)
end
function Scripted:int(a: number, b: number): number
	return math.floor(a + self:next() * (b - a + 1))
end
function Scripted:pick(t)
	return t[math.floor(self:next() * #t) + 1]
end
function Scripted:weighted(entries)
	local sum = 0
	for _, e in entries do
		sum += e.w
	end
	local r = self:next() * sum
	for _, e in entries do
		r -= e.w
		if r <= 0 then
			return e.k
		end
	end
	return entries[#entries].k
end
Parity.Scripted = Scripted

local function input(i: number, dt: number): (number, number)
	local t = i * dt
	if t % 5 > 4.2 then
		return 0, 0
	end
	local a = t * 0.55
	return math.cos(a), math.sin(a)
end

local function newRun(stageId: string, heat: number)
	local run = Run.new({ seed = 1, stageId = stageId, heat = heat, players = { { slot = 1, userId = 1, heroId = "aron" } } })
	table.clear(run.enemies)
	run.nonBoss = 0
	local pl = run.plist[1]
	pl.hp = 1e6
	run.rng = Scripted.new()
	return run, pl
end

local function step(run, pl, i: number, dt: number, weapons: boolean)
	run.t += dt
	run.tick += 1
	K.refreshPlayers(run)
	local ix, iy = input(i, dt)
	Run.setMove(run, pl.slot, ix, iy)
	K.movePlayers(run, dt)
	local g = run.grid
	g:clear()
	for _, e in run.enemies do
		if not e.dead then
			g:insert(e)
		end
	end
	K.updateEnemies(run, dt)
	if weapons then
		K.updateWeapons(run, pl, dt)
	end
	K.updateShots(run, dt)
	K.updateEnemyShots(run, dt)
	K.updateFx(run, dt)
	local en = run.enemies
	for k = #en, 1, -1 do
		if en[k].dead then
			en[k] = en[#en]
			en[#en] = nil
		end
	end
	table.clear(run.events)
	table.clear(run.sfxSeen)
	run.dmgEvN = 0
end

local function digest(run, pl): { number }
	local ex, ey, eh, sx, sy, tl, tx = 0, 0, 0, 0, 0, 0, 0
	for _, e in run.enemies do
		ex += e.x
		ey += e.y
		eh += math.max(0, e.hp)
	end
	for _, s in run.eshots do
		sx += s.x
		sy += s.y
	end
	for _, t in run.tele do
		tl += t.life
		tx += t.x
	end
	return {
		pl.x,
		pl.y,
		pl.hp,
		#run.enemies,
		ex,
		ey,
		eh,
		#run.eshots,
		sx,
		sy,
		#run.tele,
		tl,
		tx,
		#run.haz,
		#run.shots,
	}
end

Parity.FIELDS = {
	"hero x",
	"hero y",
	"hero hp",
	"enemies",
	"Σ enemy x",
	"Σ enemy y",
	"Σ enemy hp",
	"enemy shots",
	"Σ shot x",
	"Σ shot y",
	"telegraphs",
	"Σ tele life",
	"Σ tele x",
	"hazards",
	"hero shots",
}

local function findBoss(stage, id: string)
	for _, b in stage.bosses do
		if b.id == id then
			return b
		end
	end
	error("boss " .. id)
end

-- runs one scenario; returns nil when it matches, else a description of the first difference and, as second and
-- third result, the index of the differing digest field and the absolute difference, fourth the time in seconds
function Parity.check(sc, dt: number, recEvery: number, tol: number?): (string?, number?, number?, number?)
	local eps = tol or 1e-5
	local run, pl
	local weapons = false
	if sc.kind == "boss" then
		run, pl = newRun(sc.stage, sc.heat)
		run.t = sc.t0
		local e = K.spawnBoss(run, findBoss(run.stage, sc.boss), 1)
		e.x, e.y = pl.x + 260, pl.y + 80
		e.hp, e.maxHp = 1e9, 1e9
		e.skillT = 0.4
		run.rng = Scripted.new()
	elseif sc.kind == "ranged" then
		run, pl = newRun(sc.stage, 0)
		run.t = sc.t0
		run.rng = Scripted.new()
		local e = K.spawnEnemy(run, sc.type, pl.x + 300, pl.y + 120)
		if sc.elite then
			e.elite = true
			e.r *= 1.55
			e.xp *= 8
			e.kb *= 0.3
			e.dmg *= 1.4
			e.speed *= 0.95
		end
		e.hp, e.maxHp = 1e9, 1e9
		e.shootT = 0.5
		run.rng = Scripted.new()
	else
		weapons = true
		run, pl = newRun(sc.stage, 0)
		table.clear(pl.weapons)
		local w = K.addWeapon(run, pl, sc.weapon)
		w.level = sc.level
		w.evo = sc.evo
		Stats.weapon(w, pl.stats)
		run.t = sc.t0
		for _, d in sc.dummies do
			local e = K.spawnEnemy(run, "golem", pl.x + d[1], pl.y + d[2])
			e.speed = 0
			e.hp, e.maxHp = 1e7, 1e7
			e.dmg = 0
		end
		run.rng = Scripted.new()
	end
	local n = #sc.rec * recEvery
	local r = 0
	for i = 0, n - 1 do
		step(run, pl, i, dt, weapons)
		if Parity.dump and Parity.dump[1] == sc.name and i + 1 >= Parity.dump[2] and i + 1 <= Parity.dump[3] then
			local f3 = function(v)
				return string.format("%.3f", math.round(v * 1000) / 1000)
			end
			local b = run.bosses[1]
			print(
				string.format(
					"step %d rn=%d boss mode=%s skillIdx=%d skillT=%s x=%s y=%s hero %s,%s hp=%s if=%s",
					i + 1,
					run.rng.n,
					b and b.mode or "-",
					b and b.skillIdx or 0,
					b and f3(b.skillT) or "0",
					b and f3(b.x) or "0",
					b and f3(b.y) or "0",
					f3(pl.x),
					f3(pl.y),
					f3(pl.hp),
					f3(pl.iframe)
				)
			)
			local t = {}
			for _, e in run.enemies do
				table.insert(t, e.type .. f3(e.x) .. "," .. f3(e.y))
			end
			print("  E " .. table.concat(t, " "))
			t = {}
			for _, e in run.eshots do
				table.insert(t, f3(e.x) .. "," .. f3(e.y))
			end
			print("  S " .. table.concat(t, " "))
			t = {}
			for _, e in run.tele do
				table.insert(t, e.kind .. f3(e.x) .. "," .. f3(e.y) .. " " .. f3(e.t) .. "/" .. f3(e.life))
			end
			print("  T " .. table.concat(t, " "))
		end
		if (i + 1) % recEvery == 0 then
			r += 1
			local got, want = digest(run, pl), sc.rec[r]
			for f = 1, #want do
				local a, b = got[f], want[f]
				local tolf = eps * math.max(1, math.abs(b) * 1e-6)
				if math.abs(a - b) > tolf then
					return string.format(
						"%s: t=%.2f s (step %d): %s = %.6f, web %.6f",
						sc.name,
						(i + 1) * dt,
						i + 1,
						Parity.FIELDS[f],
						a,
						b
					),
						f,
						math.abs(a - b),
						(i + 1) * dt
				end
			end
		end
	end
	return nil
end

local function directorDigest(run): { number }
	local x, y, hp, sp, xp, dmg, rr, el, bo, sw, ra, ph = 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
	for _, e in run.enemies do
		x += e.x
		y += e.y
		hp += e.maxHp
		sp += e.speed
		xp += e.xp
		dmg += e.dmg
		rr += e.r
		if e.elite then
			el += 1
		end
		if e.boss then
			bo += 1
		end
		if e.swarm then
			sw += 1
		end
		if e.ranged and not e.boss then
			ra += 1
		end
	end
	for _, c in run.cdList do
		ph += c.ph
	end
	return {
		#run.enemies,
		x,
		y,
		hp,
		sp,
		xp,
		dmg,
		rr,
		el,
		bo,
		sw,
		ra,
		run.cdIdx - 1,
		ph,
		run.eventIdx - 1,
		run.bossIdx - 1,
		run.spawnAcc,
		run.eliteN,
	}
end

Parity.DIRECTOR_FIELDS = {
	"enemies",
	"Σ x",
	"Σ y",
	"Σ max hp",
	"Σ speed",
	"Σ xp",
	"Σ dmg",
	"Σ radius",
	"elites",
	"bosses",
	"swarm",
	"ranged",
	"countdown index",
	"Σ countdown phase",
	"event index",
	"boss index",
	"spawn accumulator",
	"elite count",
}

-- director scenario (see tools/ref-sim.js): returns nil or the first difference
function Parity.checkDirector(sc, dt: number, tol: number?): string?
	local eps = tol or 1e-5
	local run, pl = newRun(sc.stage, sc.heat)
	local born = {}
	local r = 0
	local n = #sc.rec * sc.every
	for i = 0, n - 1 do
		run.t += dt
		run.tick += 1
		if sc.endless and not run.endless and run.t >= run.length then
			run.endless = true
			run.endlessBossT = 120
		end
		local ix, iy = input(i, dt)
		Run.setMove(run, pl.slot, ix, iy)
		K.movePlayers(run, dt)
		local ra, nb = 0, 0
		for _, e in run.enemies do
			if e.ranged and not e.boss then
				ra += 1
			end
			if not e.boss then
				nb += 1
			end
		end
		run.rangedAlive = ra
		run.nonBoss = nb
		K.director(run, dt)
		local en = run.enemies
		for _, e in en do
			if born[e] == nil then
				born[e] = run.t
			end
		end
		for k = #en, 1, -1 do
			local e = en[k]
			if run.t - born[e] >= 6 then
				e.dead = true
				born[e] = nil
				en[k] = en[#en]
				en[#en] = nil
			end
		end
		table.clear(run.events)
		if (i + 1) % sc.every == 0 then
			r += 1
			local got, want = directorDigest(run), sc.rec[r]
			for f = 1, #want do
				local a, b = got[f], want[f]
				if math.abs(a - b) > eps * math.max(1, math.abs(b) * 1e-6) then
					return string.format(
						"%s: t=%.2f s: %s = %.6f, web %.6f",
						sc.name,
						run.t,
						Parity.DIRECTOR_FIELDS[f],
						a,
						b
					)
				end
			end
		end
	end
	return nil
end

local function runDigest(run, pl): { number }
	local ex, ey, eh, wl, pa = 0, 0, 0, 0, 0
	for _, e in run.enemies do
		ex += e.x
		ey += e.y
		eh += math.max(0, e.hp)
	end
	for _, w in pl.weapons do
		wl += w.level + (if w.evo then 10 else 0)
	end
	for _, p in pl.passives do
		pa += p.level
	end
	return {
		pl.x,
		pl.y,
		pl.hp,
		pl.level,
		pl.xp,
		pl.gold,
		run.kills,
		#run.enemies,
		ex,
		ey,
		eh,
		#run.gems,
		#run.pickups,
		wl,
		pa,
		#run.shots,
		#run.eshots,
		#run.tele,
		#pl.weapons,
	}
end

Parity.RUN_FIELDS = {
	"hero x",
	"hero y",
	"hero hp",
	"level",
	"xp",
	"gold",
	"kills",
	"enemies",
	"Σ enemy x",
	"Σ enemy y",
	"Σ enemy hp",
	"gems",
	"pickups",
	"Σ weapon levels",
	"Σ passive levels",
	"hero shots",
	"enemy shots",
	"telegraphs",
	"weapons",
}

-- whole solo run (Run.step at 1/60 s without half steps, dialogs answered with the first card); returns nil, or the
-- first difference with field index, absolute difference and time
function Parity.checkRun(sc, dt: number, _rec: number, tol: number?): (string?, number?, number?, number?)
	local eps = tol or 1e-5
	local sub = Tuning.SIM_SUBSTEPS
	Tuning.SIM_SUBSTEPS = 1
	local run = Run.new({ seed = 1, stageId = sc.stage, heat = sc.heat, players = { { slot = 1, userId = 1, heroId = sc.hero } } })
	local pl = run.plist[1]
	-- the web run draws its opening group from the scripted sequence too: rebuild it
	table.clear(run.enemies)
	run.nonBoss = 0
	run.nextId = 1
	run.rng = Scripted.new()
	K.openingGroup(run)
	local r = 0
	local result = nil
	for i = 0, #sc.rec * sc.every - 1 do
		if run.state == "over" then
			break
		end
		local ix, iy = input(i, dt)
		Run.setMove(run, 1, ix, iy)
		if sc.god then
			pl.iframe = 1e9
		end
		if run.state == "levelup" then
			Run.command(run, 1, { op = "pick", i = 1 })
		elseif run.state == "chest" then
			Run.command(run, 1, { op = "chestClose" })
		else
			Run.step(run, dt)
		end
		table.clear(run.events)
		if Parity.dump and Parity.dump[1] == sc.name and i + 1 >= Parity.dump[2] and i + 1 <= Parity.dump[3] then
			local f3 = function(v)
				return string.format("%.3f", math.round(v * 1000) / 1000)
			end
			local d = {}
			for _, v in runDigest(run, pl) do
				table.insert(d, f3(v))
			end
			print(string.format("step %d st=%s rn=%d t=%s ", i + 1, run.state, run.rng.n, f3(run.t)) .. table.concat(d, " "))
			d = {}
			for _, e in run.pickups do
				table.insert(d, e.kind .. f3(e.x) .. "," .. f3(e.y))
			end
			print("  P " .. table.concat(d, " "))
			if Parity.full then
				d = {}
				for _, e in run.enemies do
					table.insert(d, string.format("%d:%.17g,%.17g", e.id, e.x, e.y))
				end
				print("  E " .. table.concat(d, " "))
			end
		end
		if (i + 1) % sc.every == 0 then
			r += 1
			local got, want = runDigest(run, pl), sc.rec[r]
			for f = 1, #want do
				local a, b = got[f], want[f]
				if math.abs(a - b) > eps * math.max(1, math.abs(b) * 1e-6) then
					result = {
						string.format("%s: t=%.2f s: %s = %.6f, web %.6f", sc.name, (i + 1) * dt, Parity.RUN_FIELDS[f], a, b),
						f,
						math.abs(a - b),
						(i + 1) * dt,
					}
					break
				end
			end
			if result then
				break
			end
		end
	end
	Tuning.SIM_SUBSTEPS = sub
	if result then
		return result[1], result[2], result[3], result[4]
	end
	return nil
end

function Parity.load()
	return Ref.load("parity")
end

return Parity
