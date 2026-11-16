-- Players in a run: movement (local integration for bots/solo tests, validated network positions for clients),
-- leash, ember ward, downed / teammate revive / fallen, last chance, Robux revive, victory vote, leaving
-- (docs/DESIGN.md §2.5, §2.7, §2.8, §3.6).
local K = if script then require(script.Parent.K) else require("./K")
local Util = if script then require(script.Parent.Util) else require("./Util")
local Tuning = if script then require(script.Parent.Parent.Config.Tuning) else require("../Config/Tuning")

local Party = {}

local sqrt, min, abs = math.sqrt, math.min, math.abs

-- ---------- movement ----------
local function moveDir(_run, p, dt)
	local s = p.stats
	local ix, iy = p.inX, p.inY
	local il = sqrt(ix * ix + iy * iy)
	p.moving = il > 0.05
	p.vx, p.vy = 0, 0
	if p.moving then
		local k = min(1, il) * (if p.slowT > 0 then 0.55 else 1)
		p.dirX, p.dirY = ix / il, iy / il
		p.vx, p.vy = p.dirX * s.speed * k, p.dirY * s.speed * k
		p.x += p.vx * dt
		p.y += p.vy * dt
		if abs(p.dirX) > 0.1 then
			p.face = if p.dirX > 0 then 1 else -1
		end
	end
end

-- validated network position (client-predicted movement, server-validated; §3.6)
function K.applyMove(run, p)
	local m = p.net
	if not m or m.seq == p.netApplied then
		return
	end
	p.netApplied = m.seq
	local elapsed = min(0.5, math.max(0, run.t - p.moveT))
	p.moveT = run.t
	-- movement budget (token bucket over sim time): it refills at the hero's speed (+ a small rate margin) and
	-- holds at most a short burst, so packet jitter is tolerated but the long-run speed can't exceed
	-- speed * MOVE_RATE (a per-packet slack would add up with the packet rate)
	local spd = p.stats.speed * (if p.slowT > 0 then 0.55 else 1)
	local cap = spd * Tuning.MOVE_BURST + Tuning.MOVE_SLACK
	local budget = min(cap, (p.moveBudget or Tuning.MOVE_SLACK) + spd * Tuning.MOVE_RATE * elapsed)
	local dx, dy = m.x - p.x, m.y - p.y
	local d = sqrt(dx * dx + dy * dy)
	local clamped = false
	if d > budget then
		dx, dy = dx / d * budget, dy / d * budget
		d = budget
		clamped = true
	end
	p.moveBudget = budget - d
	local ox, oy = p.x, p.y
	p.x += dx
	p.y += dy
	K.leash(run, p)
	-- derived velocity (lead aim), smoothed over ~0.2 s
	if elapsed > 0 then
		local k = min(1, elapsed / 0.2)
		p.vx += ((p.x - ox) / elapsed - p.vx) * k
		p.vy += ((p.y - oy) / elapsed - p.vy) * k
	end
	p.moving = m.moving
	if m.moving and (m.dirX ~= 0 or m.dirY ~= 0) then
		local l = sqrt(m.dirX * m.dirX + m.dirY * m.dirY)
		p.dirX, p.dirY = m.dirX / l, m.dirY / l
		if abs(p.dirX) > 0.1 then
			p.face = if p.dirX > 0 then 1 else -1
		end
	end
	-- corrections: 3 clamps within 2 s or a deviation > 40 px
	if clamped then
		table.insert(p.clampTimes, run.t)
		while #p.clampTimes > 0 and p.clampTimes[1] < run.t - 2 do
			table.remove(p.clampTimes, 1)
		end
	end
	local dev = Util.hypot(m.x - p.x, m.y - p.y)
	if dev > 40 or #p.clampTimes >= 3 then
		table.clear(p.clampTimes)
		K.ev(run, { k = "correct", slot = p.slot, x = p.x, y = p.y })
	end
end

-- keep active players within LEASH_RADIUS of the centroid of all active players (co-op only)
function K.leash(run, p)
	local act = run.act
	if #act < 2 or p.state ~= "active" then
		return
	end
	local cx, cy = 0, 0
	for _, q in act do
		cx += q.x
		cy += q.y
	end
	cx /= #act
	cy /= #act
	local dx, dy = p.x - cx, p.y - cy
	local d = sqrt(dx * dx + dy * dy)
	local L = Tuning.LEASH_RADIUS
	if d > L then
		p.x, p.y = cx + dx / d * L, cy + dy / d * L
	end
end

function K.movePlayers(run, dt: number)
	local wards = run.wardList
	table.clear(wards)
	for _, p in run.plist do
		if p.state == "left" then
			continue
		end
		if p.slowT > 0 then
			p.slowT -= dt
		end
		if p.iframe > 0 then
			p.iframe -= dt
		end
		if p.flash > 0 then
			p.flash -= dt
		end
		if p.wardT > 0 then
			p.wardT -= dt
		end
		if p.state == "active" then
			if p.inputMode == "pos" then
				K.applyMove(run, p)
			else
				moveDir(run, p, dt)
				K.leash(run, p)
			end
			local s = p.stats
			if s.regen > 0 and p.hp < s.maxHp then
				p.hp = min(s.maxHp, p.hp + s.regen * dt)
			end
			if p.wardT > 0 then
				wards[#wards + 1] = p
			end
		else
			p.moving = false
			p.vx, p.vy = 0, 0
		end
	end
end

-- ---------- downed, revive, fallen ----------
function K.downPlayer(run, p)
	p.hp = 0
	p.wardT = 0
	if run.solo then
		p.state = "fallen"
	else
		p.state = "downed"
		p.bleedT = Tuning.BLEED_OUT
		p.reviveP = 0
	end
	K.ev(run, { k = "down", slot = p.slot, state = p.state })
	K.checkTeam(run)
end

-- can this player still buy a Robux revive in this run?
-- (offer: the player's own flag set by the server via Run.setReviveOffer, else the run-wide default)
function K.canRobuxRevive(run, p): boolean
	local offer = if p.reviveOffer ~= nil then p.reviveOffer else run.reviveOffer
	return offer == true and (p.state == "downed" or p.state == "fallen") and p.robuxRevives < Tuning.REVIVE_MAX_PER_RUN
end

-- after somebody went down: last chance or end of the run when nobody is active
function K.checkTeam(run)
	K.refreshPlayers(run)
	if #run.act > 0 or run.state ~= "play" then
		return
	end
	for _, p in run.plist do
		if K.canRobuxRevive(run, p) then
			run.state = "lastchance"
			run.lastT = Tuning.LAST_CHANCE_TIME
			K.ev(run, { k = "state", state = run.state, left = run.lastT })
			return
		end
	end
	K.endRun(run, false)
end

local function revive(run, p, hpFrac: number, iframe: number)
	p.state = "active"
	p.hp = p.stats.maxHp * hpFrac
	p.iframe = iframe
	p.reviveP = 0
	p.bleedT = 0
	K.ev(run, { k = "revived", slot = p.slot })
end

-- Robux revive ("Second Ember"): 50 % HP, 3 s i-frames, blast 320 px; max REVIVE_MAX_PER_RUN per player and run
function K.robuxRevive(run, p): boolean
	if not (p.state == "downed" or p.state == "fallen") or p.robuxRevives >= Tuning.REVIVE_MAX_PER_RUN then
		return false
	end
	if run.state ~= "play" and run.state ~= "lastchance" then
		return false
	end
	p.robuxRevives += 1
	revive(run, p, 0.5, 3)
	K.reviveBlast(run, p, "revive")
	K.banner(run, "Zweite Glut!", "event", nil, nil, p.slot)
	if run.state == "lastchance" then
		run.state = "play"
		K.ev(run, { k = "state", state = run.state })
	end
	K.refreshPlayers(run)
	return true
end

-- teammate revive and bleed-out (co-op), every play step
function K.updateDowned(run, dt: number)
	for _, p in run.plist do
		if p.state == "downed" then
			local helper = nil
			local r2 = Tuning.REVIVE_RADIUS * Tuning.REVIVE_RADIUS
			for _, q in run.act do
				if Util.dist2(p.x, p.y, q.x, q.y) <= r2 then
					helper = q
					break
				end
			end
			local need = min(Tuning.REVIVE_TIME + p.revives * Tuning.REVIVE_TIME_STEP, Tuning.REVIVE_TIME_MAX)
			if helper then
				p.reviveP += dt
				if p.reviveP >= need then
					p.revives += 1
					helper.bank.revivesGiven += 1
					revive(run, p, 0.4, 2)
					K.banner(run, "Wieder auf den Beinen!", "event", nil, nil, p.slot)
				end
			else
				p.reviveP = math.max(0, p.reviveP - 0.5 * dt)
				p.bleedT -= dt
				if p.bleedT <= 0 then
					p.state = "fallen"
					K.ev(run, { k = "down", slot = p.slot, state = p.state })
				end
			end
			p.reviveFrac = p.reviveP / need
		end
	end
end

-- ---------- victory, vote, end ----------
function K.enterVictory(run)
	run.state = "victory"
	run.voteT = Tuning.VOTE_TIME
	table.clear(run.votes)
	K.sfx(run, "victory")
	K.ev(run, { k = "victory" })
	K.ev(run, { k = "state", state = run.state, left = if run.solo then nil else run.voteT })
end

function K.continueEndless(run)
	if run.state ~= "victory" then
		return
	end
	run.endless = true
	run.endlessBossT = 120
	K.ev(run, { k = "endless" })
	-- downed players stay downed, fallen stay fallen; nobody active -> the run ends here
	K.refreshPlayers(run)
	if #run.act == 0 then
		K.endRun(run, true)
		return
	end
	if run.solo then
		run.state = "play"
		K.afterModal(run)
	else
		run.state = "play"
	end
	K.ev(run, { k = "state", state = run.state })
end

-- majority of the players in the run wins; a tie or the timeout means Finish
local function resolveVote(run, timeout: boolean)
	local yes, no, n = 0, 0, 0
	for _, p in run.plist do
		if p.state ~= "left" then
			n += 1
			local v = run.votes[p.slot]
			if v == true then
				yes += 1
			elseif v == false then
				no += 1
			end
		end
	end
	if yes * 2 > n then
		K.continueEndless(run)
	elseif no * 2 >= n or timeout then
		K.endRun(run, true)
	end
end

function K.vote(run, p, endless: boolean)
	if run.state ~= "victory" then
		return false
	end
	run.votes[p.slot] = endless == true
	K.ev(run, { k = "vote", slot = p.slot, endless = endless == true })
	resolveVote(run, false)
	return true
end

function K.voteTick(run, dt: number)
	if run.solo then
		return
	end
	run.voteT -= dt
	if run.voteT <= 0 then
		resolveVote(run, true)
	end
end

function K.endRun(run, _won: boolean?)
	if run.state == "over" then
		return
	end
	run.state = "over"
	run.over = true
	K.ev(run, { k = "gameOver", won = run.won })
	K.ev(run, { k = "state", state = run.state })
end

-- solo: back to play after a dialog, with the 0.45 s slow-motion ramp when something is flying or telegraphed
function K.resumePlay(run)
	local prev = run.state
	run.state = "play"
	if
		run.solo
		and (prev == "levelup" or prev == "chest" or prev == "paused")
		and (#run.eshots > 0 or #run.tele > 0)
	then
		run.resume = 0.45
	end
	if prev ~= "play" then
		K.ev(run, { k = "state", state = run.state })
	end
end

Party.sqrt = sqrt
return Party
