-- Countdown bar and surge (web buildCountdowns, countdownTick, surgeStart, surgeEnd, countdownState; M10 spec).
local K = if script then require(script.Parent.K) else require("./K")
local Enemies = if script then require(script.Parent.Data.Enemies) else require("./Data/Enemies")
local Util = if script then require(script.Parent.Util) else require("./Util")

local Countdown = {}

function K.buildCountdowns(run)
	local list = {}
	for _, s in run.stage.surges or {} do
		table.insert(
			list,
			{ kind = "surge", s = s, b = nil, start = s.t - s.lead, at = s.t, ["end"] = s.t + s.dur, ph = 0, last = 0, t10 = false }
		)
	end
	local fb = nil
	for _, b in run.bossList do
		if not b.final then
			fb = b
			break
		end
	end
	if fb then
		table.insert(
			list,
			{ kind = "boss", s = nil, b = fb, start = fb.t - 20, at = fb.t, ["end"] = fb.t, ph = 0, last = 0, t10 = false }
		)
	end
	local out = {}
	for _, c in list do
		if c.start < run.length then
			table.insert(out, c)
		end
	end
	-- stable insertion sort by start (JS Array.sort is stable)
	for i = 2, #out do
		local c = out[i]
		local j = i - 1
		while j >= 1 and out[j].start > c.start do
			out[j + 1] = out[j]
			j -= 1
		end
		out[j + 1] = c
	end
	return out
end

function K.surgeNow(run)
	local c = run.cdList[run.cdIdx]
	if c and c.kind == "surge" and c.ph == 2 then
		return c
	end
	return nil
end

local function phaseEvent(run, c)
	local on = c.ph == 2
	K.ev(run, {
		k = "countdown",
		kind = c.kind,
		phase = if c.ph == 1 then "warn" elseif on then "on" else "off",
		start = c.start,
		at = c.at,
		["end"] = c["end"],
		icon = if c.kind == "surge" then c.s.icon else c.b.sprite,
		tint = if c.kind == "surge" then (run.stage.tints and run.stage.tints[c.s.icon]) else c.b.tint,
		label = if c.kind == "boss" then c.b.name else "",
	})
end

function K.countdownTick(run)
	local L = run.cdList
	while run.cdIdx <= #L do
		local c = L[run.cdIdx]
		if run.t < c.start then
			return
		end
		if c.ph == 0 and run.t >= c["end"] then
			c.ph = 3
			run.cdIdx += 1
			continue
		end
		if c.ph == 0 then
			c.ph = 1
			c.last = math.ceil(c.at - run.t)
			if c.kind == "surge" then
				K.sfx(run, "warn")
			end
			phaseEvent(run, c)
		end
		if c.ph == 1 then
			if run.t < c.at then
				local n = math.ceil(c.at - run.t)
				if n ~= c.last then
					c.last = n
					if n <= (if c.kind == "surge" then 5 else 3) then
						K.sfx(run, "tick")
					end
				end
				if c.kind == "surge" and not c.t10 and run.t >= c.at - 10 then
					c.t10 = true
					K.banner(run, "Mach dich bereit!", "event ready", c.s.hint, 2.6)
				end
				return
			end
			if c.kind == "boss" then
				c.ph = 3
				run.cdIdx += 1
				phaseEvent(run, c)
				continue
			end
			c.ph = 2
			K.surgeStart(run, c)
			phaseEvent(run, c)
		end
		if c.ph == 2 then
			if run.t < c["end"] then
				return
			end
			c.ph = 3
			run.cdIdx += 1
			phaseEvent(run, c)
			K.surgeEnd(run, c)
		end
	end
end

function K.surgeStart(run, c)
	local s = c.s
	local wv = K.wave(run)
	-- melee of the wave replaced by the surge mix; ranged keep their weights (order: surge pool, then ranged)
	local pool = {}
	for _, e in s.pool do
		table.insert(pool, { k = e.k, w = e.w })
	end
	for _, e in wv.pool do
		if Enemies.byId[e.k].ranged then
			local found = false
			for _, q in pool do
				if q.k == e.k then
					q.w = e.w
					found = true
				end
			end
			if not found then
				table.insert(pool, { k = e.k, w = e.w })
			end
		end
	end
	run.surgeWave = { pool = pool, rate = wv.rate, cap = wv.cap }
	for _, pl in run.plist do
		pl.surgeHits = 0
	end
	local hk = run.heat >= 3
	run.surgeK = { xp = if hk then 1 else s.xp, speed = if hk then 1 + (s.speed - 1) * 0.7 else s.speed }
	local ev = { text = s.text, quiet = true, surge = run.surgeK }
	for k, v in s.open do
		ev[k] = v
	end
	K.runEvent(run, ev)
	K.sfx(run, "surge")
	K.shake(run, 6)
end

function K.surgeEnd(run, c)
	run.surgeWave = nil
	if run.state == "over" then
		return
	end
	for _, pl in run.act do
		local g = Util.round(c.s.gold * pl.stats.greed * run.heatDef.gold) * (if pl.surgeHits > 0 then 1 else 2)
		pl.gold += g
		K.text(run, pl.x, pl.y - 26, "+{0} Gold", "#ffd23f", 1.4, pl.slot, { g })
		if pl.surgeHits > 0 then
			K.banner(run, "Ansturm überstanden!", "win", "+{0} Gold", nil, pl.slot, { g })
		else
			K.banner(run, "Ansturm überstanden!", "win", "Ohne Treffer! +{0} Gold", nil, pl.slot, { g })
		end
	end
	K.sfx(run, "achievement")
end

-- read access for UI/tools: nil or { kind, phase, left, frac, since, icon, tint, label }
function K.countdownState(run)
	local c = run.cdList and run.cdList[run.cdIdx]
	if not c or (c.ph ~= 1 and c.ph ~= 2) then
		return nil
	end
	local on = c.ph == 2
	local t = run.t
	local o = {}
	o.kind = c.kind
	o.phase = if on then "on" else "warn"
	o.since = math.max(0, if on then t - c.at else t - c.start)
	o.left = math.max(0, if on then c["end"] - t else c.at - t)
	o.frac = math.clamp(o.left / (if on then c["end"] - c.at else c.at - c.start), 0, 1)
	if c.kind == "surge" then
		o.icon = c.s.icon
		o.tint = run.stage.tints and run.stage.tints[c.s.icon]
		o.label = ""
	else
		o.icon = c.b.sprite
		o.tint = c.b.tint
		o.label = c.b.name
	end
	return o
end

return Countdown
