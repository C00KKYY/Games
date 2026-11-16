-- Audio (docs/DESIGN.md §9): the mixing rules ported from audio.js (Shared/Audio/Mix.luau), the id table against the
-- exported files, and the client players on Lune's Instances with ids 0 (silent, nothing created, no error) and with
-- ids set (sounds created, limits respected).
local T = require("./lib/T")
local fs = require("@lune/fs")
local Mix = require("../src/shared/Audio/Mix")
local AudioIds = require("../src/shared/Config/AudioIds")
local Protocol = require("../src/shared/Net/Protocol")
local Arena = require("./lib/Arena")

local suite = T.new("audio")
local ROOT = if fs.isDir("src") then "" else "../"

local function seq()
	local i = 0
	return function()
		i += 1
		return (i * 0.618034) % 1
	end
end

suite:test("every sound name the server sends and every id key has a recording", function()
	for _, name in Protocol.SFX do
		for _, key in Mix.keys(name) do
			T.ok(AudioIds.sfx[key] ~= nil, "no id slot for " .. key .. " (" .. name .. ")")
		end
	end
	for _, key in { "click", "item", "buy", "evolve", "hurt", "deny" } do
		T.ok(AudioIds.sfx[key] ~= nil, "client sound " .. key)
	end
	for key in AudioIds.sfx do
		T.ok(fs.isFile(ROOT .. "assets/audio/sfx/" .. key .. ".mp3"), "file for " .. key)
		T.ok(Mix.VOL[key] ~= nil, "volume for " .. key)
	end
	for key in AudioIds.music do
		T.ok(fs.isFile(ROOT .. "assets/audio/music/" .. key .. ".mp3"), "file for music " .. key)
		T.ok(Mix.TRACK_VOL[key] ~= nil, "track volume for " .. key)
	end
	T.ok(fs.isFile(ROOT .. "assets/audio/CREDITS-audio.txt"), "credits")
	T.eq(#Mix.missing(AudioIds.sfx), 34, "all sfx ids are 0 in the repository")
	T.eq(#Mix.missing(AudioIds.music), 5)
end)

suite:test("gates, composites, copy and voice limits, distance", function()
	local st = Mix.new(seq())
	T.ok(Mix.plan(st, "hit", 0), "first hit")
	T.eq(Mix.plan(st, "hit", 0.02), nil, "gated (35 ms)")
	T.ok(Mix.plan(st, "hit", 0.04), "after the gate")
	local chest = assert(Mix.plan(st, "chest", 1))
	T.eq(#chest, 2)
	T.eq(chest[1].key, "chest_open")
	T.eq(chest[2].key, "chest")
	T.near(chest[2].delay, 0.12, 1e-9)
	local w = assert(Mix.plan(st, "ewind", 1))
	T.eq(w[1].key, "zap")
	T.ok(w[1].rate < 1, "wind-up is pitched down")
	-- six copies of one recording at once, the seventh is dropped; free again after VOICE_TIME
	local st2 = Mix.new(seq())
	for i = 1, 6 do
		T.ok(Mix.plan(st2, "nova", 5), "copy " .. i)
	end
	T.eq(Mix.plan(st2, "nova", 5), nil, "7th copy dropped")
	T.eq(st2.dropped, 1)
	T.ok(Mix.plan(st2, "nova", 5 + Mix.VOICE_TIME + 0.01), "free again")
	-- global voice limit
	local st3 = Mix.new(seq())
	local n = 0
	for _, key in { "nova", "levelup", "bomb", "boss", "heal", "magnet", "revive", "death", "alarm" } do
		for _ = 1, 6 do
			if Mix.plan(st3, key, 0) then
				n += 1
			end
		end
	end
	T.eq(n, Mix.MAX_VOICES)
	-- distance
	T.eq(Mix.distanceGain(10), 1)
	T.near(Mix.distanceGain(80), 0.5, 1e-9)
	T.eq(Mix.plan(Mix.new(seq()), "kill", 0, { dist = 130 }), nil, "too far")
	local near = assert(Mix.plan(Mix.new(seq()), "slam", 0, { dist = 80 }))
	T.ok(near[1].vol < Mix.VOL.slam * 0.6, "fades with distance")
	-- gem combo climbs, capped at +12 semitones
	local g1 = assert(Mix.plan(Mix.new(seq()), "gem", 0, { combo = 0 }))
	local g9 = assert(Mix.plan(Mix.new(seq()), "gem", 0, { combo = 40 }))
	T.near(g1[1].rate, 1, 1e-9)
	T.near(g9[1].rate, 2, 1e-9)
	T.eq(Mix.plan(Mix.new(seq()), "victory", 0), nil, "victory is a music sting")
end)

suite:test("music intensity and tracks", function()
	T.eq(Mix.intensity(false, false, 0, false), 0)
	T.eq(Mix.intensity(true, false, 30, false), 1)
	T.eq(Mix.intensity(true, false, 30, true), 2)
	T.eq(Mix.intensity(true, false, 300, false), 2)
	T.eq(Mix.intensity(true, true, 30, false), 3)
	T.eq(Mix.intensity(true, false, 700, false), 3)
	T.eq(Mix.trackFor(0), "menu")
	T.eq(Mix.trackFor(2), "battle")
	T.eq(Mix.trackFor(3), "boss")
	T.ok(Mix.muffle(1) < 0 and Mix.muffle(2) == 0)
end)

local function soundsIn(a)
	local n = 0
	for _, d in a.rb.SoundService:GetDescendants() do
		if d:IsA("Sound") then
			n += 1
		end
	end
	return n
end

suite:test("ids 0: a whole run is silent, creates no Sound and raises nothing", function()
	Arena.Roblox.counters.played = 0
	local a = Arena.new(1)
	a.rb.deps.RunHost.start({ { player = a.me, hero = "aron" } }, "graveyard", 0)
	a:frames(40, true)
	T.eq(#a:errors(), 0, table.concat(a:errors(), "\n"))
	T.eq(soundsIn(a), 0)
	T.eq(Arena.Roblox.counters.played, 0)
end)

suite:test("ids set: effects and music play within the limits", function()
	local saved = { sfx = table.clone(AudioIds.sfx), music = table.clone(AudioIds.music) }
	local id = 1000
	for k in AudioIds.sfx do
		id += 1
		AudioIds.sfx[k] = id
	end
	for k in AudioIds.music do
		id += 1
		AudioIds.music[k] = id
	end
	local ok, err = pcall(function()
		Arena.Roblox.counters.played = 0
		local a = Arena.new(1)
		a.rb.deps.RunHost.start({ { player = a.me, hero = "aron" } }, "graveyard", 0)
		a:frames(40, true)
		T.eq(#a:errors(), 0, table.concat(a:errors(), "\n"))
		local plays = Arena.Roblox.counters.played
		T.ok(plays > 50, "sounds played: " .. plays)
		T.ok(plays < 40 * 120, "bounded: " .. plays)
		local per = {}
		for _, d in a.rb.SoundService:GetDescendants() do
			if d:IsA("Sound") then
				local key = string.gsub(d.Name, "%d+$", "")
				per[key] = (per[key] or 0) + 1
				T.ok(string.find(d.SoundId, "rbxassetid://", 1, true) == 1)
			end
		end
		for key, c in per do
			T.ok(c <= Mix.MAX_COPIES, key .. " has " .. c .. " Sounds")
		end
		T.ok(per.music_battle == 1 or per.music_menu == 1, "a music loop exists")
	end)
	for k, v in saved.sfx do
		AudioIds.sfx[k] = v
	end
	for k, v in saved.music do
		AudioIds.music[k] = v
	end
	assert(ok, err)
end)

return suite
