-- Shared world helpers: events, view rectangles, active players (web Game.view, inViewRect, clampView, edgeDist).
local K = if script then require(script.Parent.K) else require("./K")
local Tuning = if script then require(script.Parent.Parent.Config.Tuning) else require("../Config/Tuning")

local World = {}

local VIEW_HW, VIEW_HH, VIEW_TOP = Tuning.VIEW_HW, Tuning.VIEW_HH, Tuning.VIEW_TOP
local VIEW_R = math.sqrt(VIEW_HW * VIEW_HW + VIEW_HH * VIEW_HH)
World.VIEW_R = VIEW_R

-- ---------- events (web Hooks.* become run.events entries; Appendix B.3) ----------
function K.ev(run, e)
	local evs = run.events
	evs[#evs + 1] = e
end

-- sound cue; deduplicated per step by name (the client plays it once, positional by x/y if given)
function K.sfx(run, name: string, x: number?, y: number?)
	local seen = run.sfxSeen
	if seen[name] then
		return
	end
	seen[name] = true
	K.ev(run, { k = "sfx", name = name, x = x, y = y })
end

-- banner for everyone (slot = nil) or one player
function K.banner(run, text: string, kind: string?, sub: string?, dur: number?, slot: number?, args: { any }?)
	K.ev(run, { k = "banner", text = text, kind = kind or "", sub = sub, dur = dur, slot = slot, args = args })
end

function K.shake(run, amount: number, x: number?, y: number?)
	K.ev(run, { k = "shake", amount = amount, x = x, y = y })
end

-- floating text (gold, heal, damage taken), shown to `slot` only when given
function K.text(run, x: number, y: number, txt: string, color: string, scale: number, slot: number?, args: { any }?)
	K.ev(run, { k = "text", x = x, y = y, text = txt, color = color, scale = scale, slot = slot, args = args })
end

-- ---------- view geometry (fixed sim view, docs/DESIGN.md §1.2) ----------
function K.viewRadius(): number
	return VIEW_R
end

-- distance from the hero to the view edge in direction a
function K.edgeDist(a: number): number
	local c, s = math.abs(math.cos(a)), math.abs(math.sin(a))
	return math.min(if c > 1e-6 then VIEW_HW / c else 1e9, if s > 1e-6 then VIEW_HH / s else 1e9)
end

-- inside player pl's view rectangle (inset world px); top additionally below the HUD band (VIEW_TOP) plus pad
function K.inViewRect(pl, x: number, y: number, inset: number, pad: number?): boolean
	local dy = y - pl.y
	if math.abs(x - pl.x) >= VIEW_HW - inset or math.abs(dy) >= VIEW_HH - inset then
		return false
	end
	return -dy < VIEW_HH - VIEW_TOP - (pad or 0)
end

function K.clampView(pl, x: number, y: number, inset: number): (number, number)
	local hw, hh = VIEW_HW - inset, VIEW_HH - inset
	return math.clamp(x, pl.x - hw, pl.x + hw), math.clamp(y, pl.y - hh, pl.y + hh)
end

-- inside any active player's plain view rectangle except `skip`
function K.inAnyView(run, x: number, y: number, skip): boolean
	for _, pl in run.act do
		if pl ~= skip and math.abs(x - pl.x) < VIEW_HW and math.abs(y - pl.y) < VIEW_HH then
			return true
		end
	end
	return false
end

-- nearest active player to (x, y) and the squared distance (nil when nobody is active)
function K.nearestActive(run, x: number, y: number)
	local best, bd = nil, math.huge
	for _, pl in run.act do
		local dx, dy = pl.x - x, pl.y - y
		local d2 = dx * dx + dy * dy
		if d2 < bd then
			bd = d2
			best = pl
		end
	end
	return best, bd
end

-- a random active player (nil when nobody is active)
function K.randomActive(run)
	local act = run.act
	if #act == 0 then
		return nil
	end
	if #act == 1 then
		return act[1]
	end
	return run.rng:pick(act)
end

-- recompute run.act (active players in slot order) and run.nPlayers (players still in the run)
function K.refreshPlayers(run)
	local act = run.act
	table.clear(act)
	local n = 0
	for _, pl in run.plist do
		if pl.state ~= "left" then
			n += 1
			if pl.state == "active" then
				act[#act + 1] = pl
			end
		end
	end
	run.nPlayers = n
end

-- next id for shots, telegraphs, pickups, hazards and gems (u16 on the wire)
function K.oid(run): number
	local id = run.nextOid
	run.nextOid = if id >= 65535 then 1 else id + 1
	return id
end

return World
