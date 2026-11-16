-- Owns the running sim (docs/DESIGN.md §3.2): fixed 1/30 s steps from a Heartbeat accumulator (at most 3 per frame),
-- network moves and commands into the sim, achievements every second, results into the profiles at the end.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Players = game:GetService("Players")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Tuning = require(Shared.Config.Tuning)
local Run = require(Shared.Sim.Run)
local Results = require(Shared.Sim.Results)
local Codec = require(Shared.Net.Codec)

local Replicator = require(script.Parent.Replicator)

local RunHost = {}

local deps: any = nil
local run: any = nil
local slots: { [Player]: number } = {}
local seqs: { [Player]: { last: number, full: number } } = {}
local spectators: { [Player]: boolean } = {}
local acc = 0
local step = 0
local achT = 0
local cleared = false
local nextSeed = os.time() % 100000

function RunHost.running(): boolean
	return run ~= nil
end

local function setAnchored(player: Player, on: boolean)
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		root.Anchored = on
	end
end

function RunHost.start(parts: { { player: Player, hero: string } }, stageId: string, heat: number)
	if run then
		return
	end
	local players = {}
	table.clear(slots)
	table.clear(seqs)
	table.clear(spectators)
	for i, p in parts do
		local prof = deps.Profiles.get(p.player)
		slots[p.player] = i
		table.insert(players, {
			slot = i,
			userId = p.player.UserId,
			heroId = p.hero,
			forge = table.clone(prof.shop),
			inputMode = "pos",
		})
	end
	nextSeed += 7919
	run = Run.new({ seed = nextSeed, stageId = stageId, heat = heat, players = players, reviveOffer = false })
	acc, step, achT, cleared = 0, 0, 1, false
	Replicator.begin(run, slots, deps.Net)
	for player, slot in slots do
		setAnchored(player, true)
		local pl = run.players[slot]
		deps.Net.ui(player, {
			t = "runStart",
			slot = slot,
			x = pl.x,
			y = pl.y,
			stage = stageId,
			heat = heat,
			solo = run.solo,
			hero = pl.heroId,
		})
	end
end

function RunHost.addSpectator(player: Player)
	if not run then
		return
	end
	spectators[player] = true
	Replicator.addSpectator(player)
	deps.Net.ui(player, { t = "spectate", stage = run.stage.id, time = run.t })
end

local function finishPlayer(player: Player, slot: number)
	local prof = deps.Profiles.get(player)
	local summary = Results.finish(run, slot, prof, { gold2x = false })
	deps.Profiles.save(player)
	deps.Net.ui(player, { t = "results", summary = summary, profile = deps.Profiles.view(player) })
end

local function endRun()
	for player, slot in slots do
		if player.Parent and run.players[slot].state ~= "left" then
			finishPlayer(player, slot)
			setAnchored(player, false)
		end
	end
	Replicator.finish()
	run = nil
	table.clear(slots)
	table.clear(spectators)
	deps.Lobby.onRunEnded()
end

local function onStep()
	-- victory: land cleared for everyone in the run (web recordClear at the moment of the kill)
	if run.won and not cleared then
		cleared = true
		for player, slot in slots do
			if run.players[slot].state ~= "left" then
				local clear = Results.recordClear(run, slot, deps.Profiles.get(player))
				deps.Net.ui(player, { t = "clear", clear = clear })
			end
		end
	end
	achT -= Tuning.SIM_DT
	if achT <= 0 then
		achT = 1
		for player, slot in slots do
			if run.players[slot].state ~= "left" then
				local new = Results.checkAchievements(run, slot, deps.Profiles.get(player))
				for _, id in new do
					deps.Net.ui(player, { t = "achievement", id = id })
				end
			end
		end
	end
end

local function heartbeat(dt: number)
	if not run then
		return
	end
	acc += dt
	local n = 0
	while acc >= Tuning.SIM_DT and n < Tuning.MAX_STEPS_PER_FRAME do
		acc -= Tuning.SIM_DT
		n += 1
		Run.step(run, Tuning.SIM_DT)
		step += 1
		onStep()
		Replicator.afterStep(run, step)
		table.clear(run.events)
		if run.state == "over" then
			endRun()
			return
		end
	end
	if acc > Tuning.SIM_DT * Tuning.MAX_STEPS_PER_FRAME then
		acc = 0 -- the game slows down instead of spiralling
	end
end

local function onMove(player: Player, m)
	if not run then
		return
	end
	local slot = slots[player]
	if not slot then
		return
	end
	-- unwrap the 16-bit sequence into a monotonic number
	local s = seqs[player]
	if not s then
		s = { last = m.seq, full = m.seq }
		seqs[player] = s
	elseif Codec.seqNewer(m.seq, s.last) then
		s.full += (m.seq - s.last) % 65536
		s.last = m.seq
	else
		return
	end
	Run.setInput(run, slot, m.x, m.y, s.full, m.dirX, m.dirY, m.moving)
end

local RUN_OPS = {
	pick = true,
	reroll = true,
	skip = true,
	banish = true,
	chestClose = true,
	pause = true,
	resume = true,
	vote = true,
	giveup = true,
}

local function onCommand(player: Player, c)
	if RUN_OPS[c.op] then
		local slot = run and slots[player]
		if slot then
			Run.command(run, slot, c)
		end
		return
	end
	deps.Lobby.command(player, c)
end

function RunHost.init(d)
	deps = d
	deps.Net.handlers.move = onMove
	deps.Net.handlers.command = onCommand
	deps.Net.handlers.query = function(player: Player, what: string)
		if what == "profile" then
			return deps.Profiles.view(player)
		end
		return nil
	end
	RunService.Heartbeat:Connect(heartbeat)
	Players.PlayerRemoving:Connect(function(player)
		spectators[player] = nil
		Replicator.removeSpectator(player)
		local slot = slots[player]
		if run and slot then
			-- leaving mid-run: booked as a defeat at this moment (§2.8 point 9)
			Run.removePlayer(run, slot)
			Results.finish(run, slot, deps.Profiles.get(player), { gold2x = false })
			deps.Profiles.save(player)
			slots[player] = nil
			Replicator.removePlayer(player)
			if run.state == "over" then
				endRun()
			end
		end
	end)
end

return RunHost
