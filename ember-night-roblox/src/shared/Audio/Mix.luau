-- Sound mixing rules ported from the web game's audio.js (docs/DESIGN.md §9). Pure (no Instances): which recordings
-- a sound name plays, at which volume, speed and delay, the minimum gap per sound, the copy and voice limits, the
-- distance fade, and the music track per intensity. The client players (src/client/Audio) only execute the plans.
local Mix = {}

Mix.MASTER = 0.8
Mix.MUSIC = 0.5
Mix.FADE = 1.5
Mix.MAX_COPIES = 6
Mix.MAX_VOICES = 40
-- a voice counts as busy this long after it started (Roblox reports no end time for unloaded sounds)
Mix.VOICE_TIME = 0.35

-- volume per recording (audio.js VOL; measured level -> target level by role)
Mix.VOL = {
	hit = 0.33,
	kill = 0.27,
	gem = 0.32,
	coin = 0.2,
	shoot = 0.15,
	knife = 0.1,
	slash = 0.22,
	throw = 0.13,
	zap = 0.22,
	["break"] = 0.31,
	hurt = 0.28,
	flask = 0.56,
	orbit = 0.22,
	dash = 0.35,
	nova = 1.5,
	magnet = 0.31,
	chestpick = 0.54,
	click = 0.83,
	deny = 0.26,
	item = 0.22,
	buy = 1.33,
	chest_open = 0.5,
	summon = 0.37,
	slam = 0.45,
	levelup = 0.39,
	chest = 1.5,
	evolve = 0.46,
	boss = 0.45,
	bomb = 0.48,
	death = 0.36,
	revive = 0.5,
	alarm = 0.79,
	achievement = 0.55,
	heal = 0.44,
	warn = 0.5,
	tick = 1.4,
	surge = 0.7,
}
-- music tracks brought to about -20 LUFS
Mix.TRACK_VOL = { menu = 1.7, battle = 0.47, boss = 0.89, victory = 0.77, gameover = 0.45 }
-- minimum gap in seconds between two plays of a name (audio.js GATE, ms)
Mix.GATE = {
	hit = 0.035,
	kill = 0.028,
	gem = 0.03,
	coin = 0.05,
	shoot = 0.07,
	knife = 0.045,
	slash = 0.06,
	zap = 0.05,
	throw = 0.08,
	flask = 0.09,
	["break"] = 0.06,
	hurt = 0.12,
	ewind = 0.09,
	efire = 0.08,
	eimpact = 0.12,
	tick = 0.5,
}
-- random detune in cents so fast repeats do not sound mechanical
Mix.DETUNE = {
	hit = 40,
	kill = 40,
	shoot = 20,
	knife = 30,
	slash = 25,
	throw = 25,
	zap = 30,
	["break"] = 30,
	flask = 20,
	coin = 10,
	hurt = 25,
	dash = 20,
	summon = 30,
}
-- gem combo: pentatonic, at most +12 semitones
Mix.GEM_STEPS = { 0, 2, 4, 7, 9, 12 }

local function cents(c: number): number
	return 2 ^ (c / 1200)
end
Mix.cents = cents

local VOL = Mix.VOL
-- names that play other recordings (audio.js SAMPLED); everything else plays the recording of the same name
Mix.COMPOSITE = {
	chest = { { key = "chest_open" }, { key = "chest", delay = 0.12 } },
	bossdown = { { key = "bomb" }, { key = "boss", rate = 0.75, delay = 0.05 } },
	ewind = { { key = "zap", vol = VOL.zap * 0.6, rate = cents(-300) } },
	efire = { { key = "throw", vol = VOL.throw * 0.75 } },
	eimpact = { { key = "slam", vol = VOL.slam * 0.6 } },
	warn = { { key = "summon", rate = 0.7, vol = VOL.warn } },
	tick = { { key = "click", rate = cents(300), vol = VOL.tick } },
	surge = {
		{ key = "slam", vol = VOL.slam * VOL.surge / 0.7 },
		{ key = "alarm", delay = 0.05, vol = VOL.alarm * VOL.surge / 0.7 },
	},
}
-- names that are music stings, not effects
Mix.STINGS = { victory = true, gameover = true }

-- positional sounds: full volume within NEAR studs of the own hero, silent beyond FAR
Mix.NEAR = 40
Mix.FAR = 120
function Mix.distanceGain(studs: number): number
	if studs <= Mix.NEAR then
		return 1
	end
	if studs >= Mix.FAR then
		return 0
	end
	return 1 - (studs - Mix.NEAR) / (Mix.FAR - Mix.NEAR)
end

export type Voice = { key: string, vol: number, rate: number, delay: number }
export type State = {
	last: { [string]: number },
	busy: { [string]: { number } },
	rng: () -> number,
	dropped: number,
}

-- rng: () -> [0, 1); the players use Random, tests a fixed sequence
function Mix.new(rng: (() -> number)?): State
	return { last = {}, busy = {}, rng = rng or math.random, dropped = 0 }
end

local function liveVoices(st: State, key: string?, now: number): number
	local n = 0
	for k, list in st.busy do
		for i = #list, 1, -1 do
			if now - list[i] >= Mix.VOICE_TIME then
				table.remove(list, i)
			end
		end
		if key == nil or k == key then
			n += #list
		end
	end
	return n
end

-- the voices to start for `name` at time `now` (seconds); nil when gated, muted by distance or over a limit.
-- opts.combo = gem combo, opts.dist = distance to the own hero in studs (nil = not positional)
function Mix.plan(st: State, name: string, now: number, opts: { combo: number?, dist: number? }?): { Voice }?
	if Mix.STINGS[name] then
		return nil
	end
	local o = opts or {}
	local gain = if o.dist then Mix.distanceGain(o.dist) else 1
	if gain <= 0 then
		return nil
	end
	local gate = Mix.GATE[name]
	if gate then
		local l = st.last[name]
		if l and now - l < gate then
			return nil
		end
		st.last[name] = now
	end
	local parts = Mix.COMPOSITE[name]
	if not parts then
		local rate = 1
		if name == "gem" then
			local steps = Mix.GEM_STEPS
			rate = 2 ^ (steps[math.min(#steps, math.floor((o.combo or 0) / 2) + 1)] / 12)
		end
		parts = { { key = name, rate = rate } }
	end
	local total = liveVoices(st, nil, now)
	local out = {}
	for _, p in parts do
		local key = p.key
		local copies = liveVoices(st, key, now)
		if copies >= Mix.MAX_COPIES or total >= Mix.MAX_VOICES then
			st.dropped += 1
			continue
		end
		local det = Mix.DETUNE[key]
		local rate = (p.rate or 1) * (if det then cents((st.rng() * 2 - 1) * det) else 1)
		local vol = (p.vol or VOL[key] or 0.4) * (1 + (st.rng() * 2 - 1) * 0.08) * gain
		table.insert(out, { key = key, vol = vol, rate = rate, delay = p.delay or 0 })
		st.busy[key] = st.busy[key] or {}
		table.insert(st.busy[key], now + (p.delay or 0))
		total += 1
	end
	return if #out > 0 then out else nil
end

-- every recording a name can play (for id checks)
function Mix.keys(name: string): { string }
	if Mix.STINGS[name] then
		return {}
	end
	local parts = Mix.COMPOSITE[name]
	if not parts then
		return { name }
	end
	local out = {}
	for _, p in parts do
		table.insert(out, p.key)
	end
	return out
end

-- music: 0 = hub/menu, 1 = early battle (muffled), 2 = battle, 3 = boss (main.js setIntensity)
function Mix.intensity(inRun: boolean, boss: boolean, t: number, surge: boolean): number
	if not inRun then
		return 0
	end
	if boss or t > 600 then
		return 3
	end
	if t > 240 or surge then
		return 2
	end
	return 1
end

function Mix.trackFor(intensity: number): string
	if intensity <= 0 then
		return "menu"
	elseif intensity >= 3 then
		return "boss"
	end
	return "battle"
end

-- high-frequency cut for the battle loop at intensity 1 (EqualizerSoundEffect.HighGain, dB)
function Mix.muffle(intensity: number): number
	return if intensity <= 1 then -18 else 0
end

-- keys whose id is 0 (sorted), for the one Studio note
function Mix.missing(ids: { [string]: number }): { string }
	local out = {}
	for k, v in ids do
		if type(v) ~= "number" or v <= 0 then
			table.insert(out, k)
		end
	end
	table.sort(out)
	return out
end

return Mix
