-- Player profiles. R1: kept in memory for the session (Sim/Profile.luau defaults, sanitized). The DataStore
-- persistence with session locks (docs/DESIGN.md §6.2) replaces the storage part in milestone R2; the API stays.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Profile = require(Shared.Sim.Profile)
local Lang = require(Shared.Lang.Lang)

local Profiles = {}

local data: { [Player]: any } = {}

function Profiles.init()
	Players.PlayerRemoving:Connect(function(player)
		-- deferred: other PlayerRemoving handlers (RunHost books the results) still need the profile
		task.defer(function()
			data[player] = nil
		end)
	end)
end

function Profiles.get(player: Player)
	local p = data[player]
	if not p then
		p = Profile.default()
		p.created = os.time()
		data[player] = p
	end
	return p
end

-- language of the player: profile setting, else his Roblox locale
function Profiles.lang(player: Player): string
	local p = Profiles.get(player)
	return p.settings.lang or Lang.fromLocale(player.LocaleId)
end

-- a compact view for the client UI
function Profiles.view(player: Player)
	local p = Profiles.get(player)
	return {
		gold = p.gold,
		chars = Profile.unlockedHeroes(p, nil),
		stars = Profile.totalStars(p),
		stages = p.stages,
		lang = Profiles.lang(player),
		lastChar = p.lastChar,
		stats = p.stats,
	}
end

function Profiles.save(_player: Player)
	-- R2: DataStore UpdateAsync with session lock
end

return Profiles
