-- The party on this server (docs/DESIGN.md §2.1, §2.3): members in join order, leader, hero/land/heat selection,
-- ready state, start countdown, spectators while a run is in progress.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Tuning = require(Shared.Config.Tuning)
local Profile = require(Shared.Sim.Profile)
local Stages = require(Shared.Sim.Data.Stages)

local Lobby = {}

type Member = { player: Player, hero: string, ready: boolean, joined: number }

local members: { Member } = {}
local stageId = "graveyard"
local heat = 0
local countdownToken = 0
local countdownEnd = 0
local deps: any = nil
local joinCounter = 0

local function find(player: Player): Member?
	for _, m in members do
		if m.player == player then
			return m
		end
	end
	return nil
end

function Lobby.leader(): Player?
	local m = members[1]
	return m and m.player
end

local function stageIndex(id: string): number
	for i, s in Stages.list do
		if s.id == id then
			return i
		end
	end
	return 1
end

-- keep the chosen land/heat valid for the current leader's profile
local function clampSelection()
	local leader = Lobby.leader()
	if not leader then
		return
	end
	local prof = deps.Profiles.get(leader)
	if not Profile.stageUnlocked(prof, stageIndex(stageId)) then
		stageId = "graveyard"
	end
	heat = math.clamp(heat, 0, Profile.stageMaxHeat(prof, stageId))
end

function Lobby.broadcast()
	clampSelection()
	local list = {}
	local leader = Lobby.leader()
	for _, m in members do
		table.insert(list, {
			userId = m.player.UserId,
			name = m.player.DisplayName,
			hero = m.hero,
			ready = m.ready,
			leader = m.player == leader,
		})
	end
	local running = deps.RunHost.running()
	for _, m in members do
		local prof = deps.Profiles.get(m.player)
		local lprof = if leader then deps.Profiles.get(leader) else prof
		local stages = {}
		for i, s in Stages.list do
			table.insert(stages, {
				id = s.id,
				unlocked = Profile.stageUnlocked(lprof, i),
				maxHeat = Profile.stageMaxHeat(lprof, s.id),
				stars = Profile.stageStars(prof, s.id),
			})
		end
		deps.Net.ui(m.player, {
			t = "lobby",
			members = list,
			you = m.player.UserId,
			isLeader = m.player == leader,
			stage = stageId,
			heat = heat,
			stages = stages,
			heroes = Profile.unlockedHeroes(prof, nil),
			running = running,
			countdown = if countdownEnd > 0 then math.max(0, countdownEnd - os.clock()) else nil,
			profile = deps.Profiles.view(m.player),
		})
	end
end

local function cancelCountdown()
	if countdownEnd > 0 then
		countdownToken += 1
		countdownEnd = 0
	end
end

local function startNow()
	countdownEnd = 0
	if deps.RunHost.running() or #members == 0 then
		return
	end
	local parts = {}
	for i, m in members do
		if i > Tuning.MAX_PLAYERS then
			break
		end
		table.insert(parts, { player = m.player, hero = m.hero })
		m.ready = false
	end
	deps.RunHost.start(parts, stageId, heat)
	Lobby.broadcast()
end

function Lobby.command(player: Player, c)
	local m = find(player)
	if not m then
		return
	end
	local isLeader = player == Lobby.leader()
	local running = deps.RunHost.running()
	if c.op == "selectHero" then
		local prof = deps.Profiles.get(player)
		if table.find(Profile.unlockedHeroes(prof, nil), c.hero) then
			m.hero = c.hero
			prof.lastChar = c.hero
		end
	elseif c.op == "selectStage" then
		if not isLeader or running then
			return
		end
		local prof = deps.Profiles.get(player)
		local idx = stageIndex(c.stage)
		if Profile.stageUnlocked(prof, idx) and c.heat <= Profile.stageMaxHeat(prof, c.stage) then
			stageId = c.stage
			heat = c.heat
			prof.stageSel = c.stage
			prof.stageHeat[c.stage] = c.heat
			cancelCountdown()
		end
	elseif c.op == "ready" then
		m.ready = c.on
		if not c.on then
			cancelCountdown()
		end
	elseif c.op == "start" then
		if not isLeader or running or countdownEnd > 0 then
			return
		end
		m.ready = true
		for _, o in members do
			o.ready = true
		end
		if #members <= 1 then
			startNow()
			return
		end
		countdownToken += 1
		local token = countdownToken
		countdownEnd = os.clock() + Tuning.START_COUNTDOWN
		task.delay(Tuning.START_COUNTDOWN, function()
			if token == countdownToken then
				startNow()
			end
		end)
	elseif c.op == "lang" then
		deps.Profiles.get(player).settings.lang = c.lang
	end
	Lobby.broadcast()
end

function Lobby.onRunEnded()
	Lobby.broadcast()
end

function Lobby.init(d)
	deps = d
	local function add(player: Player)
		if find(player) then
			return
		end
		joinCounter += 1
		local prof = deps.Profiles.get(player)
		table.insert(members, { player = player, hero = prof.lastChar, ready = false, joined = joinCounter })
		Lobby.broadcast()
		if deps.RunHost.running() then
			deps.RunHost.addSpectator(player)
		end
	end
	Players.PlayerAdded:Connect(add)
	for _, p in Players:GetPlayers() do
		add(p)
	end
	Players.PlayerRemoving:Connect(function(player)
		for i, m in members do
			if m.player == player then
				table.remove(members, i)
				break
			end
		end
		cancelCountdown()
		Lobby.broadcast()
	end)
end

return Lobby
