-- Snapshot buffer and interpolation (docs/DESIGN.md §3.5). Pure (no Roblox services): collects decoded snapshot
-- packets per tick, keeps the last few complete ticks and samples entity positions at
-- renderTick = latest - delay (linear between the two surrounding snapshots, held at the edges).
local Interp = {}
Interp.__index = Interp

local KEEP = 6

function Interp.new(delayTicks: number, tickRate: number)
	return setmetatable({
		delay = delayTicks,
		rate = tickRate,
		frames = {}, -- sorted by tick: { tick, parts, got, enemies = { [id] = e }, heroes = { [slot] = h } }
		lastRaw = -1,
		full = 0,
		latest = nil,
		renderTick = nil,
	}, Interp)
end

-- 16-bit tick -> monotonically increasing tick
function Interp.unwrap(self, raw: number): number
	if self.lastRaw < 0 then
		self.lastRaw = raw
		self.full = raw
		return raw
	end
	local d = (raw - self.lastRaw) % 65536
	if d >= 32768 then
		d -= 65536
	end
	local full = self.full + d
	if d > 0 then
		self.lastRaw = raw
		self.full = full
	end
	return full
end

function Interp.push(self, s)
	local tick = self:unwrap(s.tick)
	local frames = self.frames
	local f = nil
	for _, x in frames do
		if x.tick == tick then
			f = x
			break
		end
	end
	if not f then
		if self.latest and tick < self.latest - KEEP * 4 then
			return -- far too old
		end
		f = { tick = tick, parts = s.parts, got = 0, enemies = {}, heroes = {} }
		local i = #frames + 1
		while i > 1 and frames[i - 1].tick > tick do
			i -= 1
		end
		table.insert(frames, i, f)
		while #frames > KEEP do
			table.remove(frames, 1)
		end
	end
	f.got += 1
	for _, e in s.enemies do
		f.enemies[e.id] = e
	end
	for _, h in s.heroes do
		f.heroes[h.slot] = h
	end
	if not self.latest or tick > self.latest then
		self.latest = tick
	end
end

function Interp.update(self, dt: number)
	if not self.latest then
		return
	end
	local target = self.latest - self.delay
	if not self.renderTick or math.abs(self.renderTick - target) > 8 then
		self.renderTick = target
	else
		self.renderTick += dt * self.rate
		self.renderTick += (target - self.renderTick) * math.min(1, dt * 2)
	end
end

-- the two frames around renderTick and the blend factor
function Interp.bracket(self)
	local frames = self.frames
	local rt = self.renderTick
	if not rt or #frames == 0 then
		return nil, nil, 0
	end
	local a, b = nil, nil
	for i = #frames, 1, -1 do
		if frames[i].tick <= rt then
			a = frames[i]
			b = frames[i + 1]
			break
		end
	end
	if not a then
		return frames[1], nil, 0
	end
	if not b then
		return a, nil, 0
	end
	return a, b, (rt - a.tick) / (b.tick - a.tick)
end

-- calls fn(id, x, y, e) for every enemy at render time
function Interp.eachEnemy(self, fn: (number, number, number, any) -> ())
	local a, b, k = self:bracket()
	if not a then
		return
	end
	for id, e in a.enemies do
		local e2 = b and b.enemies[id]
		if e2 then
			fn(id, e.x + (e2.x - e.x) * k, e.y + (e2.y - e.y) * k, e2)
		else
			fn(id, e.x, e.y, e)
		end
	end
	if b then
		-- enemies that only exist in the newer frame (just spawned or entered the region)
		for id, e in b.enemies do
			if not a.enemies[id] then
				fn(id, e.x, e.y, e)
			end
		end
	end
end

function Interp.hero(self, slot: number)
	local a, b, k = self:bracket()
	if not a then
		return nil
	end
	local h = a.heroes[slot]
	local h2 = b and b.heroes[slot]
	if h and h2 then
		return h.x + (h2.x - h.x) * k, h.y + (h2.y - h.y) * k, h2
	elseif h2 then
		return h2.x, h2.y, h2
	elseif h then
		return h.x, h.y, h
	end
	return nil
end

-- newest known hero data (not delayed): for teammates' HUD and the leash
function Interp.latestHeroes(self)
	local f = self.frames[#self.frames]
	return f and f.heroes or {}
end

function Interp.reset(self)
	table.clear(self.frames)
	self.lastRaw = -1
	self.full = 0
	self.latest = nil
	self.renderTick = nil
end

return Interp
