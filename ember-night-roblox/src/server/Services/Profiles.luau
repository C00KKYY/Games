-- Player profiles in the DataStore (docs/DESIGN.md §6.2): load with session lock on join (kick when it cannot be
-- loaded), autosave every Tuning.AUTOSAVE seconds, save after runs and purchases, release on leave, save all on
-- shutdown. The logic lives in Shared/Server/ProfileStore.luau (Lune-tested); this module adds Roblox services.
local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Tuning = require(Shared.Config.Tuning)
local Profile = require(Shared.Sim.Profile)
local Lang = require(Shared.Lang.Lang)
local ProfileStore = require(Shared.Server.ProfileStore)
local DataStoreAdapter = require(script.Parent.DataStoreAdapter)

local Profiles = {}

local store: any = nil
local loaded: { [Player]: boolean } = {}
local loadedCallbacks: { (Player) -> () } = {}
local SHUTDOWN_WAIT = 25

local function kickText(player: Player, de: string, en: string): string
	return if Lang.fromLocale(player.LocaleId) == "de" then de else en
end

local function onLost(player: Player)
	if player.Parent then
		player:Kick(
			kickText(
				player,
				"Dein Profil wurde auf einem anderen Server geöffnet. Bitte tritt erneut bei.",
				"Your profile was opened on another server. Please rejoin."
			)
		)
	end
end

local function load(player: Player)
	local data, err = store:load(player.UserId)
	if not player.Parent then
		-- left while loading: give the lock back at once
		if data then
			store:save(player.UserId, true)
		end
		return
	end
	if not data then
		if err == "newer" then
			player:Kick(
				kickText(
					player,
					"Dieser Server ist veraltet. Bitte tritt erneut bei.",
					"This server is out of date. Please rejoin."
				)
			)
		else
			player:Kick(
				kickText(
					player,
					"Dein Profil konnte nicht geladen werden. Bitte versuche es gleich noch einmal.",
					"Your profile could not be loaded. Please try again in a moment."
				)
			)
		end
		return
	end
	loaded[player] = true
	for _, f in loadedCallbacks do
		task.spawn(f, player)
	end
end

function Profiles.init()
	DataStoreAdapter.init()
	local jobId = game.JobId
	if jobId == "" then
		jobId = "studio-" .. HttpService:GenerateGUID(false)
	end
	store = ProfileStore.new({
		backend = DataStoreAdapter.backend,
		now = os.time,
		sleep = task.wait,
		jobId = jobId,
		lockStale = Tuning.LOCK_STALE,
		log = function(msg)
			warn("[EmberNight] " .. msg)
		end,
	})
	Players.PlayerAdded:Connect(function(player)
		load(player)
	end)
	for _, p in Players:GetPlayers() do
		task.spawn(load, p)
	end
	-- autosave
	task.spawn(function()
		while true do
			task.wait(Tuning.AUTOSAVE)
			for player in loaded do
				task.spawn(Profiles.save, player)
			end
		end
	end)
	game:BindToClose(function()
		local pending = 0
		for _, uid in store:users() do
			pending += 1
			task.spawn(function()
				store:save(uid, true)
				pending -= 1
			end)
		end
		local t0 = os.clock()
		while pending > 0 and os.clock() - t0 < SHUTDOWN_WAIT do
			task.wait(0.1)
		end
	end)
	DataStoreAdapter.onMemory(function()
		for player in loaded do
			Profiles.changed(player)
		end
	end)
end

-- run f(player) for every player whose profile is loaded (now and later)
function Profiles.onLoaded(f: (Player) -> ())
	table.insert(loadedCallbacks, f)
	for player in loaded do
		task.spawn(f, player)
	end
end

function Profiles.isLoaded(player: Player): boolean
	return loaded[player] == true
end

-- wait (yielding) until the profile is loaded; false after `timeout` seconds or when the player left
function Profiles.waitLoaded(player: Player, timeout: number): boolean
	local t0 = os.clock()
	while not loaded[player] and player.Parent and os.clock() - t0 < timeout do
		task.wait(0.25)
	end
	return loaded[player] == true
end

-- the in-memory profile (nil while loading); mutate it, it is saved by autosave / Profiles.save
function Profiles.get(player: Player): any
	if not loaded[player] then
		return nil
	end
	return store:get(player.UserId)
end

function Profiles.store()
	return store
end

-- language of the player: profile setting, else his Roblox locale
function Profiles.lang(player: Player): string
	local p = Profiles.get(player)
	return (p and p.settings.lang) or Lang.fromLocale(player.LocaleId)
end

-- hook for "the profile changed, refresh the client" (set by Meta)
Profiles.changed = function(_player: Player) end

function Profiles.save(player: Player)
	if not loaded[player] then
		return
	end
	local ok, why = store:save(player.UserId)
	if not ok and why == "lost" then
		onLost(player)
	end
end

-- leaving: save and release the lock (called by Main after the run booked the player's results)
function Profiles.release(player: Player)
	if not loaded[player] then
		return
	end
	loaded[player] = nil
	store:save(player.UserId, true)
end

-- the yellow "not saved" label in Studio
function Profiles.memoryOnly(): boolean
	return DataStoreAdapter.isMemory()
end

-- the profile as the client sees it (passes = confirmed game pass keys, from Passes)
function Profiles.baseView(player: Player)
	local p = Profiles.get(player)
	if not p then
		return nil
	end
	return {
		gold = p.gold,
		stars = Profile.totalStars(p),
		stages = p.stages,
		stageHeat = p.stageHeat,
		lang = Profiles.lang(player),
		lastChar = p.lastChar,
		stats = p.stats,
		forge = p.shop, -- forge levels (`shop` in the profile, web name)
		shopSpent = p.shopSpent,
		achievements = p.achievements,
		evolved = p.evolved,
		bosses = p.bosses,
		settings = p.settings,
		reviveTokens = p.reviveTokens,
		memoryOnly = DataStoreAdapter.isMemory(),
		studio = RunService:IsStudio(),
	}
end

return Profiles
