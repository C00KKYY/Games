-- Sound effects (docs/DESIGN.md §9): executes Shared/Audio/Mix plans with a few pooled Sound objects per recording
-- in one SoundGroup. Positional sounds fade with the distance to the own hero. A recording whose id is 0 stays
-- silent: no Sound is created for it and nothing errors (Studio prints one note listing the missing ids).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Mix = require(Shared.Audio.Mix)
local AudioIds = require(Shared.Config.AudioIds)

local Sfx = {}

local group: SoundGroup? = nil
local pools: { [string]: { sounds: { Sound }, next: number } } = {}
local state = Mix.new(function()
	return math.random()
end)
local enabled = true
local gemCombo, gemAt = 0, -1
local noted = false

local function note()
	if noted then
		return
	end
	noted = true
	local missing = Mix.missing(AudioIds.sfx)
	local ok, studio = pcall(function()
		return RunService:IsStudio()
	end)
	if ok and studio and #missing > 0 then
		local total = 0
		for _ in AudioIds.sfx do
			total += 1
		end
		warn(
			string.format(
				"[EmberNight] %d of %d sound effect ids are 0 (silent): upload assets/audio/sfx, fill Config/AudioIds.luau",
				#missing,
				total
			)
		)
	end
end

function Sfx.init()
	if group then
		return
	end
	local g = Instance.new("SoundGroup")
	g.Name = "EN_Sfx"
	g.Volume = Mix.MASTER
	g.Parent = SoundService
	group = g
	note()
end

function Sfx.setEnabled(on: boolean)
	enabled = on
	if group then
		group.Volume = if on then Mix.MASTER else 0
	end
end

local function pool(key: string)
	local p = pools[key]
	if p then
		return p
	end
	local id = AudioIds.sfx[key]
	p = { sounds = {}, next = 1 }
	pools[key] = p
	if type(id) ~= "number" or id <= 0 or not group then
		return p
	end
	for i = 1, Mix.MAX_COPIES do
		local s = Instance.new("Sound")
		s.Name = key .. i
		s.SoundId = "rbxassetid://" .. id
		s.SoundGroup = group
		s.Parent = group
		table.insert(p.sounds, s)
	end
	return p
end

local function start(v)
	local p = pool(v.key)
	local n = #p.sounds
	if n == 0 then
		return
	end
	local s = p.sounds[p.next]
	p.next = p.next % n + 1
	s.Volume = math.min(v.vol, 3)
	s.PlaybackSpeed = v.rate
	s.TimePosition = 0
	s:Play()
end

-- play a sound name; dist = studs from the own hero for positional sounds (nil = everywhere)
function Sfx.play(name: string, dist: number?)
	if not enabled then
		return
	end
	local now = os.clock()
	local combo = nil
	if name == "gem" then
		if now - gemAt > 0.6 then
			gemCombo = 0
		end
		gemCombo += 1
		gemAt = now
		combo = gemCombo
	end
	local plan = Mix.plan(state, name, now, { combo = combo, dist = dist })
	if not plan then
		return
	end
	for _, v in plan do
		if v.delay > 0 then
			task.delay(v.delay, start, v)
		else
			start(v)
		end
	end
end

-- how many voices the limits dropped (for the debug overlay and tests)
function Sfx.dropped(): number
	return state.dropped
end

return Sfx
