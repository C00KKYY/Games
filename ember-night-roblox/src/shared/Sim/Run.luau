-- A run: creation, fixed-step update, commands and inputs (web Game.newRun, Game.update, UI actions).
-- docs/DESIGN.md §3.3:
--   local run = Run.new({ seed, stageId, heat, players = { { slot, userId, heroId, forge, inputMode } }, reviveOffer })
--   Run.setInput(run, slot, x, y, seq, dirX, dirY, moving)  -- validated hero position from the network
--   Run.setMove(run, slot, mx, my)                          -- move vector (bots, tests): the sim moves the hero
--   Run.command(run, slot, { op = "pick", i = 2 })           -- pick | reroll | skip | banish | chestClose | pause |
--                                                           -- resume | vote | revive | giveup
--   Run.step(run, dt)                                       -- advances the world (the server calls it with 1/30)
--   run.events                                              -- emitted events, cleared by the caller
--   run.state  -- "play" | "levelup" | "chest" | "paused" (solo) | "lastchance" | "victory" | "over"
local K = if script then require(script.Parent.K) else require("./K")
local Rng = if script then require(script.Parent.Rng) else require("./Rng")
local Grid = if script then require(script.Parent.Grid) else require("./Grid")
local Curves = if script then require(script.Parent.Curves) else require("./Curves")
local Stats = if script then require(script.Parent.Stats) else require("./Stats")
local Stages = if script then require(script.Parent.Data.Stages) else require("./Data/Stages")
local Heat = if script then require(script.Parent.Data.Heat) else require("./Data/Heat")
local Heroes = if script then require(script.Parent.Data.Heroes) else require("./Data/Heroes")
local Props = if script then require(script.Parent.Props) else require("./Props")
local Tuning = if script then require(script.Parent.Parent.Config.Tuning) else require("../Config/Tuning")
-- modules that register their functions in K
local _World = if script then require(script.Parent.World) else require("./World")
local _Countdown = if script then require(script.Parent.Countdown) else require("./Countdown")
local _Director = if script then require(script.Parent.Director) else require("./Director")
local _Enemies = if script then require(script.Parent.Enemies) else require("./Enemies")
local _Bosses = if script then require(script.Parent.Bosses) else require("./Bosses")
local _Combat = if script then require(script.Parent.Combat) else require("./Combat")
local _Fx = if script then require(script.Parent.Fx) else require("./Fx")
local _Shots = if script then require(script.Parent.Shots) else require("./Shots")
local _Weapons = if script then require(script.Parent.Weapons) else require("./Weapons")
local _Pickups = if script then require(script.Parent.Pickups) else require("./Pickups")
local _LevelUp = if script then require(script.Parent.LevelUp) else require("./LevelUp")
local _Party = if script then require(script.Parent.Party) else require("./Party")

local Run = {}
Run.K = K

local START_OFFSETS = { { 0, 0 }, { 40, 0 }, { -40, 0 }, { 0, 40 } }

function Run.stageById(id: string?)
	for i, s in Stages.list do
		if s.id == id then
			return s, i
		end
	end
	return Stages.list[1], 1
end

local function newPlayer(run, o, idx: number)
	local heroId = if Heroes.byId[o.heroId] then o.heroId else "aron"
	local off = START_OFFSETS[idx] or { 0, 0 }
	local solo = run.solo
	local pl = {
		slot = o.slot,
		userId = o.userId or 0,
		heroId = heroId,
		forge = o.forge or {},
		inputMode = o.inputMode or "dir",
		x = if solo then 0 else off[1],
		y = if solo then 0 else off[2],
		r = 12,
		hp = 100,
		dirX = 1,
		dirY = 0,
		face = 1,
		moving = false,
		iframe = 0,
		flash = 0,
		vx = 0,
		vy = 0,
		slowT = 0,
		inX = 0,
		inY = 0,
		net = nil,
		netApplied = -1,
		moveT = 0,
		clampTimes = {},
		stats = nil,
		weapons = {},
		passives = {},
		level = 1,
		xp = 0,
		xpNext = Curves.xpFor(1),
		pendingLevels = 0,
		pendingChests = 0,
		offer = nil,
		offerT = 0,
		trayOpen = false,
		rerolls = 0,
		skips = 0,
		banishes = 0,
		banished = {},
		revivals = 0,
		dmgBy = {},
		evolvedCount = 0,
		firstHit = nil,
		gold = 0,
		kills = 0,
		chestsOpened = 0,
		surgeHits = 0,
		lastHitSrc = nil,
		state = "active",
		bleedT = 0,
		reviveP = 0,
		reviveFrac = 0,
		revives = 0,
		robuxRevives = 0,
		wardT = 0,
		wardLast = -999,
		-- lifetime counters not yet booked into the profile (Results.bank)
		bank = { kills = 0, evolutions = 0, chests = 0, bossKills = 0, revivesGiven = 0, bosses = {}, evolved = {} },
	}
	K.refreshStats(run, pl)
	pl.hp = pl.stats.maxHp
	pl.rerolls = pl.stats.rerolls
	pl.skips = pl.stats.skips
	pl.banishes = pl.stats.banish
	pl.revivals = pl.stats.revival
	K.addWeapon(run, pl, Heroes.byId[heroId].weapon)
	return pl
end

function Run.new(opts)
	local stage, stageIdx = Run.stageById(opts.stageId)
	local heat = math.clamp(math.floor(opts.heat or 0), 0, #Heat.list - 1)
	local bossList = table.clone(stage.bosses)
	table.sort(bossList, function(a, b)
		return a.t < b.t
	end)
	local qbufs = {}
	for i = 1, 7 do
		qbufs[i] = {}
	end
	local plist = {}
	local run = {
		seed = opts.seed or 1,
		rng = Rng.new(opts.seed or 1),
		stage = stage,
		stageIdx = stageIdx,
		heat = heat,
		heatDef = Heat.list[heat + 1],
		length = stage.minutes * 60,
		bossList = bossList,
		solo = #opts.players <= 1,
		reviveOffer = opts.reviveOffer == true,
		t = 0,
		tick = 0,
		state = "play",
		players = {},
		plist = plist,
		act = {},
		nPlayers = #opts.players,
		enemies = {},
		shots = {},
		eshots = {},
		gems = {},
		pickups = {},
		fx = {},
		tele = {},
		haz = {},
		props = {},
		propList = {},
		propCount = 0,
		broken = {},
		propDrops = Props.DROPS,
		spawnAcc = 0,
		eliteT = 30,
		bossIdx = 1,
		eventIdx = 1,
		bosses = {},
		nextId = 1,
		nextOid = 1,
		vol = { active = 0, bells = 0, lastStart = -9 },
		rangedAlive = 0,
		nonBoss = 0,
		eliteN = 0,
		cdList = nil,
		cdIdx = 1,
		surgeWave = nil,
		surgeK = nil,
		eliteBanT = 0,
		kills = 0,
		bossKills = 0,
		won = false,
		endless = false,
		endlessBossT = 0,
		over = false,
		lastT = 0,
		voteT = 0,
		votes = {},
		resume = 0,
		anchorI = 0,
		retargetPeriod = 15 * (Tuning.SIM_SUBSTEPS or 1),
		hitShrink = if #opts.players <= 1 then 0 else 2,
		wardList = {},
		grid = Grid.new(64),
		qbufs = qbufs,
		qd = 0,
		dmgEvN = 0,
		sfxSeen = {},
		events = {},
	}
	run.cdList = K.buildCountdowns(run)
	for i, o in opts.players do
		local pl = newPlayer(run, o, i)
		run.players[pl.slot] = pl
		table.insert(plist, pl)
	end
	table.sort(plist, function(a, b)
		return a.slot < b.slot
	end)
	K.refreshPlayers(run)
	K.openingGroup(run)
	K.ev(run, { k = "start", stage = stage.id, heat = heat })
	return run
end

-- one play step of length dt (web Game.update)
local function playStep(run, dt: number)
	run.t += dt
	run.tick += 1
	K.refreshPlayers(run)
	K.movePlayers(run, dt)
	K.director(run, dt)
	local g = run.grid
	g:clear()
	for _, e in run.enemies do
		if not e.dead then
			g:insert(e)
		end
	end
	K.updateEnemies(run, dt)
	if run.state ~= "play" then
		return
	end
	for _, pl in run.act do
		K.updateWeapons(run, pl, dt)
	end
	K.updateShots(run, dt)
	K.updateEnemyShots(run, dt)
	K.updateFx(run, dt)
	K.updatePickups(run, dt)
	K.updateProps(run)
	local en = run.enemies
	for i = #en, 1, -1 do
		if en[i].dead then
			en[i] = en[#en]
			en[#en] = nil
		end
	end
	if run.state ~= "play" then
		return
	end
	if not run.solo then
		K.updateDowned(run, dt)
		K.updateTrays(run, dt)
	else
		local pl = run.plist[1]
		if pl.pendingLevels > 0 then
			K.openLevelUp(run, pl)
		elseif pl.pendingChests > 0 then
			K.openChest(run, pl)
		end
	end
end

function Run.step(run, dt: number)
	table.clear(run.sfxSeen)
	run.dmgEvN = 0
	local st = run.state
	if st == "play" then
		local n = Tuning.SIM_SUBSTEPS or 1
		local sdt = dt / n
		for _ = 1, n do
			if run.state ~= "play" then
				break
			end
			local gdt = sdt
			if run.resume > 0 then
				gdt = sdt * (0.3 + 0.7 * (1 - run.resume / 0.45))
				run.resume = math.max(0, run.resume - sdt)
			end
			playStep(run, gdt)
		end
	elseif st == "lastchance" then
		if not run.holdLast then
			run.lastT -= dt
		end
		if run.lastT <= 0 then
			K.endRun(run, false)
		end
	elseif st == "victory" then
		K.voteTick(run, dt)
	end
end

-- client move packet (pos mode); the newest seq wins
function Run.setInput(run, slot: number, x: number, y: number, seq: number, dirX: number?, dirY: number?, moving: boolean?)
	local pl = run.players[slot]
	if not pl then
		return
	end
	local m = pl.net
	if m and seq <= m.seq then
		return
	end
	pl.inputMode = "pos"
	pl.net = { x = x, y = y, seq = seq, dirX = dirX or 0, dirY = dirY or 0, moving = moving == true }
end

-- move vector (dir mode)
function Run.setMove(run, slot: number, mx: number, my: number)
	local pl = run.players[slot]
	if pl then
		pl.inputMode = "dir"
		pl.inX, pl.inY = mx, my
	end
end

function Run.command(run, slot: number, cmd): boolean
	local pl = run.players[slot]
	if not pl or pl.state == "left" or type(cmd) ~= "table" then
		return false
	end
	local op = cmd.op
	local st = run.state
	if op == "pick" or op == "reroll" or op == "skip" or op == "banish" then
		if not pl.offer or (run.solo and st ~= "levelup") then
			return false
		end
		if op == "pick" then
			return K.chooseLevel(run, pl, tonumber(cmd.i) or 1)
		elseif op == "reroll" then
			return K.reroll(run, pl)
		elseif op == "skip" then
			return K.skipLevel(run, pl)
		else
			return K.banish(run, pl, tonumber(cmd.i) or 0)
		end
	elseif op == "chestClose" then
		if run.solo and st == "chest" then
			K.closeChest(run)
			return true
		end
	elseif op == "pause" then
		if run.solo and st == "play" then
			run.state = "paused"
			K.ev(run, { k = "state", state = run.state })
			return true
		end
	elseif op == "resume" then
		if run.solo and st == "paused" then
			K.afterModal(run)
			return true
		end
	elseif op == "vote" then
		if st == "victory" then
			if run.solo then
				if cmd.endless then
					K.continueEndless(run)
				else
					K.endRun(run, true)
				end
				return true
			end
			return K.vote(run, pl, cmd.endless == true)
		end
	elseif op == "revive" then
		return K.robuxRevive(run, pl)
	elseif op == "holdLast" then
		-- server: a revive purchase prompt is open during last chance (§7.3 point 6)
		run.holdLast = cmd.on == true
		return true
	elseif op == "giveup" then
		if run.solo then
			if st ~= "over" then
				K.endRun(run, false)
				return true
			end
		elseif pl.state == "active" or pl.state == "downed" then
			pl.hp = 0
			pl.state = "fallen"
			K.ev(run, { k = "down", slot = pl.slot, state = pl.state })
			K.checkTeam(run)
			return true
		end
	end
	return false
end

-- a player leaves mid-run; returns his result view (booked by the caller as a defeat)
function Run.removePlayer(run, slot: number)
	local pl = run.players[slot]
	if not pl or pl.state == "left" then
		return nil
	end
	local view = Run.playerView(run, slot)
	pl.state = "left"
	pl.offer = nil
	K.ev(run, { k = "left", slot = slot })
	K.refreshPlayers(run)
	if run.nPlayers == 0 then
		K.endRun(run, false)
	elseif #run.act == 0 and run.state == "play" then
		K.checkTeam(run)
	end
	return view
end

-- the web game's `run` object as seen by one player (achievement checks, results)
function Run.playerView(run, slot: number)
	local pl = run.players[slot]
	return {
		t = run.t,
		won = run.won,
		heat = run.heat,
		stage = run.stage,
		stageIdx = run.stageIdx,
		level = pl.level,
		kills = run.kills,
		ownKills = pl.kills,
		gold = pl.gold,
		bossKills = run.bossKills,
		evolvedCount = pl.evolvedCount,
		firstHit = pl.firstHit,
		weapons = pl.weapons,
		passives = pl.passives,
		heroId = pl.heroId,
		coop = not run.solo,
		dmgBy = pl.dmgBy,
	}
end

Run.Stats = Stats
return Run
