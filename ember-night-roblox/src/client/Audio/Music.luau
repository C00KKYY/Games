-- Music (docs/DESIGN.md §9): one looping Sound per track, cross-faded over Mix.FADE with TweenService; intensity 0 =
-- hub, 1-2 = battle (1 muffled by an EqualizerSoundEffect), 3 = boss; victory and game-over are stings that pause the
-- loops for their length. A track whose id is 0 is silent (nothing is created for it, nothing errors).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Mix = require(Shared.Audio.Mix)
local AudioIds = require(Shared.Config.AudioIds)

local Music = {}

local group: SoundGroup? = nil
local sounds: { [string]: Sound } = {}
local playing: { [string]: boolean } = {}
local eq: EqualizerSoundEffect? = nil
local current: string? = nil
local intensity = 0
local enabled = true
local holdUntil = 0
local STING_HOLD = 6

local function fade(s: Sound, to: number, sec: number, stopAfter: boolean)
	local tw =
		TweenService:Create(s, TweenInfo.new(sec, Enum.EasingStyle.Sine, Enum.EasingDirection.Out), { Volume = to })
	if stopAfter then
		tw.Completed:Connect(function()
			if current == nil or sounds[current] ~= s then
				s:Stop()
				for k, v in sounds do
					if v == s then
						playing[k] = nil
					end
				end
			end
		end)
	end
	tw:Play()
end

local function sound(id: string): Sound?
	if sounds[id] then
		return sounds[id]
	end
	local asset = AudioIds.music[id]
	if type(asset) ~= "number" or asset <= 0 or not group then
		return nil
	end
	local s = Instance.new("Sound")
	s.Name = "music_" .. id
	s.SoundId = "rbxassetid://" .. asset
	s.Looped = not Mix.STINGS[id]
	s.Volume = 0
	s.SoundGroup = group
	if id == "battle" then
		local e = Instance.new("EqualizerSoundEffect")
		e.LowGain = 0
		e.MidGain = 0
		e.HighGain = Mix.muffle(intensity)
		e.Parent = s
		eq = e
	end
	s.Parent = group
	sounds[id] = s
	return s
end

function Music.init()
	if group then
		return
	end
	local g = Instance.new("SoundGroup")
	g.Name = "EN_Music"
	g.Volume = Mix.MASTER * Mix.MUSIC
	g.Parent = SoundService
	group = g
end

function Music.setEnabled(on: boolean)
	enabled = on
	if group then
		group.Volume = if on then Mix.MASTER * Mix.MUSIC else 0
	end
end

local function crossTo(id: string)
	if current == id then
		return
	end
	local old = current and sounds[current]
	current = id
	if old then
		fade(old, 0, Mix.FADE, true)
	end
	local s = sound(id)
	if s then
		if not playing[id] then
			playing[id] = true
			s.TimePosition = 0
			s:Play()
		end
		fade(s, Mix.TRACK_VOL[id] or 0.6, Mix.FADE, false)
	end
end

function Music.setIntensity(v: number)
	intensity = v
	if eq then
		local target = Mix.muffle(v)
		if eq.HighGain ~= target then
			TweenService:Create(eq, TweenInfo.new(0.8), { HighGain = target }):Play()
		end
	end
	if os.clock() < holdUntil then
		return
	end
	crossTo(Mix.trackFor(v))
end

function Music.intensity(): number
	return intensity
end

-- a short closing piece (victory / gameover): the loops fade out, the sting plays once
function Music.sting(id: string)
	if current then
		local old = sounds[current]
		if old then
			fade(old, 0, 0.6, true)
		end
		current = nil
	end
	holdUntil = os.clock() + STING_HOLD
	local s = sound(id)
	if s and enabled then
		s.Volume = Mix.TRACK_VOL[id] or 0.7
		s.TimePosition = 0
		s:Play()
	end
end

-- release the sting hold (back to the hub)
function Music.release()
	holdUntil = 0
	Music.setIntensity(intensity)
end

return Music
