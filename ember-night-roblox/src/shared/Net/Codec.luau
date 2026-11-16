--!native
-- Binary wire formats (docs/DESIGN.md Appendix B): snapshot packets (Snap, unreliable, <= 900 bytes each), move
-- packets (Move, 14 bytes) and per-step event buffers (Ev, reliable). Little-endian `buffer`. Pure: used by the
-- server, the client and the Lune tests.
local Protocol = if script then require(script.Parent.Protocol) else require("./Protocol")
local Tuning = if script then require(script.Parent.Parent.Config.Tuning) else require("../Config/Tuning")

local Codec = {}

local floor, clamp, pi = math.floor, math.clamp, math.pi
local TAU = pi * 2
local EV = Protocol.EV
local TYPE_INDEX = Protocol.TYPE_INDEX
local NONE = 0x7fff

-- ---------- growable writer ----------
local Writer = {}
Writer.__index = Writer

function Codec.writer(cap: number?)
	return setmetatable({ b = buffer.create(cap or 256), n = 0 }, Writer)
end

local function ensure(w, k: number)
	local len = buffer.len(w.b)
	if w.n + k > len then
		local nb = buffer.create(math.max(len * 2, w.n + k))
		buffer.copy(nb, 0, w.b, 0, w.n)
		w.b = nb
	end
end

local function u8(w, v: number)
	ensure(w, 1)
	buffer.writeu8(w.b, w.n, clamp(floor(v + 0.5), 0, 255))
	w.n += 1
end
local function i8(w, v: number)
	ensure(w, 1)
	buffer.writei8(w.b, w.n, clamp(floor(v + 0.5), -128, 127))
	w.n += 1
end
local function u16(w, v: number)
	ensure(w, 2)
	buffer.writeu16(w.b, w.n, clamp(floor(v + 0.5), 0, 65535))
	w.n += 2
end
local function i16(w, v: number)
	ensure(w, 2)
	buffer.writei16(w.b, w.n, clamp(floor(v + 0.5), -32768, 32767))
	w.n += 2
end
local function i32(w, v: number)
	ensure(w, 4)
	buffer.writei32(w.b, w.n, clamp(floor(v + 0.5), -2147483648, 2147483647))
	w.n += 4
end
local function f32(w, v: number)
	ensure(w, 4)
	buffer.writef32(w.b, w.n, v)
	w.n += 4
end
local function str(w, s: string)
	local n = math.min(#s, 255)
	u8(w, n)
	ensure(w, n)
	buffer.writestring(w.b, w.n, s, n)
	w.n += n
end
local function angle(a: number): number
	a = (a + pi) % TAU - pi
	return a * 1000
end

function Writer.finish(self): buffer
	local out = buffer.create(self.n)
	buffer.copy(out, 0, self.b, 0, self.n)
	return out
end

-- ---------- reader ----------
local Reader = {}
Reader.__index = Reader
function Codec.reader(b: buffer)
	return setmetatable({ b = b, n = 0, len = buffer.len(b) }, Reader)
end
local function ru8(r)
	local v = buffer.readu8(r.b, r.n)
	r.n += 1
	return v
end
local function ru16(r)
	local v = buffer.readu16(r.b, r.n)
	r.n += 2
	return v
end
local function ri16(r)
	local v = buffer.readi16(r.b, r.n)
	r.n += 2
	return v
end
local function ri32(r)
	local v = buffer.readi32(r.b, r.n)
	r.n += 4
	return v
end
local function rf32(r)
	local v = buffer.readf32(r.b, r.n)
	r.n += 4
	return v
end
local function rstr(r)
	local n = ru8(r)
	local s = buffer.readstring(r.b, r.n, n)
	r.n += n
	return s
end

-- ---------- move packet (B.2) ----------
function Codec.encodeMove(seq: number, x: number, y: number, dirX: number, dirY: number, moving: boolean): buffer
	local b = buffer.create(14)
	buffer.writeu8(b, 0, Protocol.MSG_MOVE)
	buffer.writeu16(b, 1, seq % 65536)
	buffer.writef32(b, 3, x)
	buffer.writef32(b, 7, y)
	buffer.writei8(b, 11, clamp(floor(dirX * 127 + 0.5), -127, 127))
	buffer.writei8(b, 12, clamp(floor(dirY * 127 + 0.5), -127, 127))
	buffer.writeu8(b, 13, if moving then 1 else 0)
	return b
end

-- returns nil for anything malformed (server input: never trusted)
function Codec.decodeMove(b: any)
	if typeof(b) ~= "buffer" or buffer.len(b) ~= 14 or buffer.readu8(b, 0) ~= Protocol.MSG_MOVE then
		return nil
	end
	local x, y = buffer.readf32(b, 3), buffer.readf32(b, 7)
	if x ~= x or y ~= y or math.abs(x) > 1e7 or math.abs(y) > 1e7 then
		return nil
	end
	return {
		seq = buffer.readu16(b, 1),
		x = x,
		y = y,
		dirX = math.max(-1, buffer.readi8(b, 11) / 127), -- -128 would be -1.008
		dirY = math.max(-1, buffer.readi8(b, 12) / 127),
		moving = bit32.band(buffer.readu8(b, 13), 1) == 1,
	}
end

-- sequence numbers wrap at 65536: is a newer than b?
function Codec.seqNewer(a: number, b: number): boolean
	local d = (a - b) % 65536
	return d ~= 0 and d < 32768
end

-- ---------- snapshot (B.1) ----------
local HEADER = 13
local HERO_B = 12
local ENEMY_B = 8
-- ~100 bytes of margin under the 900-byte unreliable limit for the remote's own overhead (buffer type tag, length,
-- event id); 90 + 2 x 98 = 286 >= SNAP_ENEMY_CAP, so a snapshot still fits in 3 packets
local PART0_MAX = 90 -- packet 0: 13 + 1 + 4 x 12 + 1 + 90 x 8 = 783 bytes
local PART_MAX = 98 -- other packets: 13 + 1 + 98 x 8 = 798 bytes

local function enemyTypeFlags(e): number
	local t = TYPE_INDEX[e.type] or 0
	if e.elite then
		t += 16
	end
	if e.boss then
		t += 32
	end
	if e.swarm then
		t += 64
	end
	return t
end

local function enemyState(e): number
	local s = 0
	if e.flash > 0 then
		s += 1
	end
	if e.slowF < 1 then
		s += 2
	end
	if e.freezeT > 0 then
		s += 4
	end
	if e.windT > 0 or (e.boss and (e.mode == "windup" or e.mode == "cast")) then
		s += 8
	end
	if e.face < 0 then
		s += 16
	end
	if e.elite or e.boss then
		s += clamp(floor(e.hp / e.maxHp * 7 + 0.5), 0, 7) * 32
	end
	return s
end

local function heroFlags(p): number
	local f = 0
	if p.state == "downed" then
		f += 1
	end
	if p.state == "fallen" or p.state == "left" then
		f += 2
	end
	if p.wardT > 0 then
		f += 4
	end
	if p.iframe > 0 then
		f += 8
	end
	if p.moving then
		f += 16
	end
	if p.face < 0 then
		f += 32
	end
	return f
end

-- select the enemies one client sees: interest rectangle around (ox, oy), nearest first, cap; bosses always
function Codec.selectEnemies(run, ox: number, oy: number, cap: number, out: { any }?): { any }
	local list = out or {}
	table.clear(list)
	local hw, hh = Tuning.INTEREST_HW, Tuning.INTEREST_HH
	local bosses = {}
	for _, e in run.enemies do
		if not e.dead then
			local dx, dy = e.x - ox, e.y - oy
			if e.boss then
				table.insert(bosses, e)
			elseif math.abs(dx) <= hw and math.abs(dy) <= hh then
				e._sd = dx * dx + dy * dy
				list[#list + 1] = e
			end
		end
	end
	if #list > cap then
		table.sort(list, function(a, b)
			return a._sd < b._sd
		end)
		for i = #list, cap + 1, -1 do
			list[i] = nil
		end
	end
	for _, b in bosses do
		table.insert(list, 1, b)
	end
	return list
end

-- encode the snapshot for one recipient; returns an array of buffers (1..3 packets, each <= UR_MAX_BYTES)
function Codec.encodeSnapshot(run, tick: number, ox: number, oy: number, cap: number?)
	ox, oy = floor(ox + 0.5), floor(oy + 0.5)
	local enemies = Codec.selectEnemies(run, ox, oy, cap or Tuning.SNAP_ENEMY_CAP)
	local n = #enemies
	local parts = 1
	if n > PART0_MAX then
		parts = 1 + math.ceil((n - PART0_MAX) / PART_MAX)
	end
	parts = math.min(parts, 3)
	local out = {}
	local idx = 1
	for part = 0, parts - 1 do
		local maxE = if part == 0 then PART0_MAX else PART_MAX
		local cnt = math.min(maxE, n - idx + 1)
		local heroes = if part == 0 then run.plist else {}
		local size = HEADER + 1 + cnt * ENEMY_B
		if part == 0 then
			size += 1 + #heroes * HERO_B
		end
		local w = { b = buffer.create(size), n = 0 }
		u8(w, Protocol.MSG_SNAP)
		u16(w, tick % 65536)
		u8(w, part)
		u8(w, parts)
		f32(w, ox)
		f32(w, oy)
		if part == 0 then
			u8(w, #heroes)
			for _, p in heroes do
				u8(w, p.slot)
				f32(w, p.x)
				f32(w, p.y)
				u8(w, heroFlags(p))
				u8(w, if p.stats then p.hp / p.stats.maxHp * 255 else 0)
				u8(w, (p.reviveFrac or 0) * 255)
			end
		end
		u8(w, cnt)
		for _ = 1, cnt do
			local e = enemies[idx]
			idx += 1
			u16(w, e.id)
			i16(w, e.x - ox)
			i16(w, e.y - oy)
			u8(w, enemyTypeFlags(e))
			u8(w, enemyState(e))
		end
		out[#out + 1] = w.b
	end
	return out
end

function Codec.decodeSnapshot(b: buffer)
	local r = Codec.reader(b)
	if ru8(r) ~= Protocol.MSG_SNAP then
		return nil
	end
	local s = { tick = ru16(r), part = ru8(r), parts = ru8(r) }
	s.ox = rf32(r)
	s.oy = rf32(r)
	s.heroes = {}
	if s.part == 0 then
		for _ = 1, ru8(r) do
			local h = { slot = ru8(r), x = rf32(r), y = rf32(r) }
			local f = ru8(r)
			h.downed = bit32.btest(f, 1)
			h.fallen = bit32.btest(f, 2)
			h.ward = bit32.btest(f, 4)
			h.iframe = bit32.btest(f, 8)
			h.moving = bit32.btest(f, 16)
			h.faceLeft = bit32.btest(f, 32)
			h.hp = ru8(r) / 255
			h.revive = ru8(r) / 255
			table.insert(s.heroes, h)
		end
	end
	s.enemies = {}
	for _ = 1, ru8(r) do
		local id = ru16(r)
		local x, y = s.ox + ri16(r), s.oy + ri16(r)
		local tf, st = ru8(r), ru8(r)
		table.insert(s.enemies, {
			id = id,
			x = x,
			y = y,
			type = Protocol.TYPE_NAME[bit32.band(tf, 15) + 1],
			elite = bit32.btest(tf, 16),
			boss = bit32.btest(tf, 32),
			swarm = bit32.btest(tf, 64),
			flash = bit32.btest(st, 1),
			slowed = bit32.btest(st, 2),
			frozen = bit32.btest(st, 4),
			winding = bit32.btest(st, 8),
			faceLeft = bit32.btest(st, 16),
			hpBucket = bit32.rshift(st, 5),
		})
	end
	return s
end

-- ---------- events (B.3) ----------
local DMG_PER_STEP = 24
local SHOT_KIND = Protocol.SHOT_KINDS
local COLOR = Protocol.COLOR_INDEX
local PICK = Protocol.PICK_INDEX
local SFX = Protocol.SFX_INDEX

local function teleKind(tl): number
	local k = tl.kind
	if k == "circle" then
		return 1
	elseif k == "lane" then
		return 2
	elseif k == "line" then
		return 3
	elseif k == "aim" then
		return 4
	elseif k == "charge" and tl.wedge then
		return 5
	end
	return 6
end

local function encodeTele(w, tl, ox, oy)
	local kind = teleKind(tl)
	u16(w, tl.id)
	u8(w, kind)
	u8(w, tl.life * 20)
	u16(w, if tl.follow then tl.follow.id else 0)
	i16(w, tl.x - ox)
	i16(w, tl.y - oy)
	if kind == 1 then
		u16(w, tl.rad)
		local f = 0
		if tl.small then
			f += 1
		end
		if tl.track then
			f += 2
		end
		if tl.onImpact == "ember" then
			f += 4
		elseif tl.onImpact == "slow" then
			f += 8
		end
		u8(w, f)
	elseif kind == 2 or kind == 3 then
		i16(w, angle(tl.a))
		u16(w, tl.len)
		u8(w, tl.w)
	elseif kind == 4 then
		i16(w, angle(tl.a))
		u16(w, tl.len)
		u8(w, tl.hr)
		u8(w, tl.lockAt * 20)
	elseif kind == 5 then
		i16(w, angle(tl.a))
		local n = #tl.shots
		u8(w, n)
		local spread = if n > 1 then tl.shots[n].o - tl.shots[1].o else 0
		i16(w, spread * 1000)
		u8(w, tl.wedge)
		u8(w, tl.sr)
		u8(w, tl.lockAt * 20)
	else
		local shots = tl.shots
		local rings = 1
		for _, sh in shots do
			if sh.d and sh.d > 0 then
				rings = math.max(rings, floor(sh.d / 0.3 + 0.5) + 1)
			end
		end
		local n = floor(#shots / rings)
		u8(w, n)
		u8(w, rings)
		i16(w, angle(shots[1].a))
		u8(w, tl.sr)
		u8(w, (if tl.boss then 1 else 0) + (if tl.arms then 2 else 0))
	end
end

-- encode the events of one step for the client in `slot`; nil when nothing is relevant
function Codec.encodeEvents(events, slot: number, tick: number, ox: number, oy: number): buffer?
	ox, oy = floor(ox + 0.5), floor(oy + 0.5)
	local w = Codec.writer(256)
	u8(w, Protocol.MSG_EV)
	u16(w, tick % 65536)
	f32(w, ox)
	f32(w, oy)
	local head = w.n
	local dmgN = 0
	for _, e in events do
		local k = e.k
		local code = EV[k]
		if not code then
			continue
		end
		if k == "dmg" then
			local own = e.slot == slot
			if not (own or e.boss) or dmgN >= DMG_PER_STEP then
				continue
			end
			dmgN += 1
			u8(w, code)
			i16(w, e.x - ox)
			i16(w, e.y - oy)
			u16(w, e.amount)
			u8(w, (if e.crit then 1 else 0) + (if e.boss then 2 else 0) + (if own then 4 else 0))
		elseif k == "kill" then
			u8(w, code)
			u16(w, e.id)
			i16(w, e.x - ox)
			i16(w, e.y - oy)
			u8(w, (TYPE_INDEX[e.type] or 0) + (if e.elite then 16 else 0) + (if e.boss then 32 else 0))
		elseif k == "eshot+" then
			local s = e.s
			u8(w, code)
			u16(w, s.id)
			i16(w, s.x - ox)
			i16(w, s.y - oy)
			i16(w, s.vx)
			i16(w, s.vy)
			u8(w, s.r)
			u8(w, SHOT_KIND[s.kind] or 0)
			u8(w, s.life * 20)
		elseif k == "eshot-" or k == "tele-" or k == "haz-" or k == "shot-" or k == "despawn" or k == "warp" then
			u8(w, code)
			u16(w, e.id)
		elseif k == "tele+" then
			u8(w, code)
			encodeTele(w, e.tl, ox, oy)
		elseif k == "tele~" then
			local tl = e.tl
			u8(w, code)
			u16(w, tl.id)
			i16(w, angle(tl.a or 0))
			i16(w, tl.x - ox)
			i16(w, tl.y - oy)
		elseif k == "haz+" then
			local h = e.h
			u8(w, code)
			u16(w, h.id)
			u8(w, if h.kind == "ember" then 1 else 2)
			i16(w, h.x - ox)
			i16(w, h.y - oy)
			u8(w, h.rad)
			u8(w, h.life * 10)
		elseif k == "haz~" then
			u8(w, code)
			u16(w, e.id)
			u8(w, e.life * 10)
		elseif k == "pick+" then
			u8(w, code)
			u16(w, e.id)
			u8(w, PICK[e.kind] or 1)
			i16(w, e.x - ox)
			i16(w, e.y - oy)
			u8(w, e.owner or 0)
		elseif k == "pick~" or k == "pick-" or k == "gemPull" or k == "gemGot" then
			u8(w, code)
			u16(w, e.id)
			u8(w, e.slot or 0)
		elseif k == "gem+" then
			u8(w, code)
			u16(w, e.id)
			i16(w, e.x - ox)
			i16(w, e.y - oy)
			u16(w, math.max(1, e.v))
		elseif k == "fire" then
			u8(w, code)
			u8(w, e.slot)
			u8(w, Protocol.WEAPON_INDEX[e.weapon] or 0)
			u8(w, if e.evo then 1 else 0)
			i16(w, e.x - ox)
			i16(w, e.y - oy)
			i16(w, angle(e.a or 0))
			u16(w, e.speed or 0)
			u8(w, (e.area or 1) * 50)
			u16(w, e.extra or 0)
		elseif k == "orbit" then
			u8(w, code)
			u8(w, e.slot)
			u8(w, if e.active then 1 else 0)
			u8(w, e.amount)
			u16(w, e.radius)
			u8(w, e.speed * 20)
			u8(w, e.orb)
			i16(w, angle(e.ang))
			u8(w, if e.evo then 1 else 0)
		elseif k == "aura" then
			u8(w, code)
			u8(w, e.slot)
			u16(w, e.rad)
			u8(w, if e.evo then 1 else 0)
		elseif k == "sfx" then
			local si = SFX[e.name]
			if not si then
				continue
			end
			u8(w, code)
			u8(w, si)
			if e.x then
				i16(w, clamp(e.x - ox, -32000, 32000))
				i16(w, clamp(e.y - oy, -32000, 32000))
			else
				i16(w, NONE)
				i16(w, NONE)
			end
		elseif k == "shake" then
			if e.slot and e.slot ~= slot then
				continue
			end
			u8(w, code)
			u8(w, e.amount)
			if e.x then
				i16(w, clamp(e.x - ox, -32000, 32000))
				i16(w, clamp(e.y - oy, -32000, 32000))
			else
				i16(w, NONE)
				i16(w, NONE)
			end
		elseif k == "prop-" then
			u8(w, code)
			i16(w, e.cx)
			i16(w, e.cy)
		elseif k == "boom" then
			u8(w, code)
			i16(w, e.x - ox)
			i16(w, e.y - oy)
			u16(w, e.rad)
			u8(w, COLOR[e.color] or 1)
		elseif k == "burst" then
			u8(w, code)
			i16(w, e.x - ox)
			i16(w, e.y - oy)
			u8(w, COLOR[e.color] or 1)
			u8(w, e.n)
		elseif k == "arc" then
			u8(w, code)
			u8(w, e.slot)
			i16(w, e.x - ox)
			i16(w, e.y - oy)
			i16(w, e.x2 - ox)
			i16(w, e.y2 - oy)
		elseif k == "pool" then
			u8(w, code)
			u8(w, e.slot)
			i16(w, e.x - ox)
			i16(w, e.y - oy)
			u8(w, e.rad)
			u8(w, e.life * 10)
			u8(w, if e.evo then 1 else 0)
		elseif k == "flash" then
			u8(w, code)
			u8(w, e.slot)
			i16(w, e.x - ox)
			i16(w, e.y - oy)
		elseif k == "text" then
			if e.slot and e.slot ~= slot then
				continue
			end
			u8(w, code)
			i16(w, e.x - ox)
			i16(w, e.y - oy)
			u8(w, COLOR[e.color] or 9)
			u8(w, (e.scale or 1) * 20)
			str(w, e.text)
			i32(w, if e.args and type(e.args[1]) == "number" then e.args[1] else -2147483648)
		end
	end
	if w.n == head then
		return nil
	end
	return w:finish()
end

function Codec.decodeEvents(b: buffer)
	local r = Codec.reader(b)
	if ru8(r) ~= Protocol.MSG_EV then
		return nil
	end
	local tick = ru16(r)
	local ox, oy = rf32(r), rf32(r)
	local out = {}
	local NAME = Protocol.EV_NAME
	while r.n < r.len do
		local code = ru8(r)
		local k = NAME[code]
		local e = { k = k }
		if k == "dmg" then
			e.x, e.y = ox + ri16(r), oy + ri16(r)
			e.amount = ru16(r)
			local f = ru8(r)
			e.crit, e.boss, e.own = bit32.btest(f, 1), bit32.btest(f, 2), bit32.btest(f, 4)
		elseif k == "kill" then
			e.id = ru16(r)
			e.x, e.y = ox + ri16(r), oy + ri16(r)
			local tf = ru8(r)
			e.type = Protocol.TYPE_NAME[bit32.band(tf, 15) + 1]
			e.elite, e.boss = bit32.btest(tf, 16), bit32.btest(tf, 32)
		elseif k == "eshot+" then
			e.id = ru16(r)
			e.x, e.y = ox + ri16(r), oy + ri16(r)
			e.vx, e.vy = ri16(r), ri16(r)
			e.r = ru8(r)
			e.kind = Protocol.SHOT_KIND_NAME[ru8(r)] or "orb"
			e.life = ru8(r) / 20
		elseif k == "eshot-" or k == "tele-" or k == "haz-" or k == "shot-" or k == "despawn" or k == "warp" then
			e.id = ru16(r)
		elseif k == "tele+" then
			e.id = ru16(r)
			local kind = ru8(r)
			e.kind = Protocol.TELE_KINDS[kind]
			e.life = ru8(r) / 20
			e.follow = ru16(r)
			e.x, e.y = ox + ri16(r), oy + ri16(r)
			if kind == 1 then
				e.rad = ru16(r)
				local f = ru8(r)
				e.small, e.track = bit32.btest(f, 1), bit32.btest(f, 2)
				e.ember, e.slow = bit32.btest(f, 4), bit32.btest(f, 8)
			elseif kind == 2 or kind == 3 then
				e.a = ri16(r) / 1000
				e.len = ru16(r)
				e.w = ru8(r)
			elseif kind == 4 then
				e.a = ri16(r) / 1000
				e.len = ru16(r)
				e.hr = ru8(r)
				e.lockAt = ru8(r) / 20
			elseif kind == 5 then
				e.a = ri16(r) / 1000
				e.n = ru8(r)
				e.spread = ri16(r) / 1000
				e.wedge = ru8(r)
				e.sr = ru8(r)
				e.lockAt = ru8(r) / 20
			else
				e.n = ru8(r)
				e.rings = ru8(r)
				e.off = ri16(r) / 1000
				e.sr = ru8(r)
				local f = ru8(r)
				e.boss, e.arms = bit32.btest(f, 1), bit32.btest(f, 2)
			end
		elseif k == "tele~" then
			e.id = ru16(r)
			e.a = ri16(r) / 1000
			e.x, e.y = ox + ri16(r), oy + ri16(r)
		elseif k == "haz+" then
			e.id = ru16(r)
			e.kind = if ru8(r) == 1 then "ember" else "slow"
			e.x, e.y = ox + ri16(r), oy + ri16(r)
			e.rad = ru8(r)
			e.life = ru8(r) / 10
		elseif k == "haz~" then
			e.id = ru16(r)
			e.life = ru8(r) / 10
		elseif k == "pick+" then
			e.id = ru16(r)
			e.kind = Protocol.PICK_KINDS[ru8(r)]
			e.x, e.y = ox + ri16(r), oy + ri16(r)
			e.owner = ru8(r)
		elseif k == "pick~" or k == "pick-" or k == "gemPull" or k == "gemGot" then
			e.id = ru16(r)
			e.slot = ru8(r)
		elseif k == "gem+" then
			e.id = ru16(r)
			e.x, e.y = ox + ri16(r), oy + ri16(r)
			e.v = ru16(r)
		elseif k == "fire" then
			e.slot = ru8(r)
			e.weapon = Protocol.WEAPON_NAME[ru8(r) + 1]
			e.evo = ru8(r) == 1
			e.x, e.y = ox + ri16(r), oy + ri16(r)
			e.a = ri16(r) / 1000
			e.speed = ru16(r)
			e.area = ru8(r) / 50
			e.extra = ru16(r)
		elseif k == "orbit" then
			e.slot = ru8(r)
			e.active = ru8(r) == 1
			e.amount = ru8(r)
			e.radius = ru16(r)
			e.speed = ru8(r) / 20
			e.orb = ru8(r)
			e.ang = ri16(r) / 1000
			e.evo = ru8(r) == 1
		elseif k == "aura" then
			e.slot = ru8(r)
			e.rad = ru16(r)
			e.evo = ru8(r) == 1
		elseif k == "sfx" then
			e.name = Protocol.SFX[ru8(r)]
			local x, y = ri16(r), ri16(r)
			if x ~= NONE then
				e.x, e.y = ox + x, oy + y
			end
		elseif k == "shake" then
			e.amount = ru8(r)
			local x, y = ri16(r), ri16(r)
			if x ~= NONE then
				e.x, e.y = ox + x, oy + y
			end
		elseif k == "prop-" then
			e.cx, e.cy = ri16(r), ri16(r)
		elseif k == "boom" then
			e.x, e.y = ox + ri16(r), oy + ri16(r)
			e.rad = ru16(r)
			e.color = Protocol.COLORS[ru8(r)]
		elseif k == "burst" then
			e.x, e.y = ox + ri16(r), oy + ri16(r)
			e.color = Protocol.COLORS[ru8(r)]
			e.n = ru8(r)
		elseif k == "arc" then
			e.slot = ru8(r)
			e.x, e.y = ox + ri16(r), oy + ri16(r)
			e.x2, e.y2 = ox + ri16(r), oy + ri16(r)
		elseif k == "pool" then
			e.slot = ru8(r)
			e.x, e.y = ox + ri16(r), oy + ri16(r)
			e.rad = ru8(r)
			e.life = ru8(r) / 10
			e.evo = ru8(r) == 1
		elseif k == "flash" then
			e.slot = ru8(r)
			e.x, e.y = ox + ri16(r), oy + ri16(r)
		elseif k == "text" then
			e.x, e.y = ox + ri16(r), oy + ri16(r)
			e.color = Protocol.COLORS[ru8(r)]
			e.scale = ru8(r) / 20
			e.text = rstr(r)
			local a = ri32(r)
			if a ~= -2147483648 then
				e.arg = a
			end
		else
			error("unknown event code " .. tostring(code))
		end
		out[#out + 1] = e
	end
	return out, tick
end

Codec.i8 = i8
return Codec
