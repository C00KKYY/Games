-- Plain-table views of sim state for Ui messages (docs/DESIGN.md Appendix B.4). Pure; used by the server
-- replicator and tested in Lune. Never puts sim objects (enemy tables, telegraphs) into a message.
local Protocol = if script then require(script.Parent.Protocol) else require("./Protocol")

local Views = {}

-- own-hero state for its owner (HUD, pause screen)
function Views.hero(run, pl)
	local ws, ps = {}, {}
	for _, w in pl.weapons do
		table.insert(ws, { id = w.id, level = w.level, evo = w.evo })
	end
	for _, p in pl.passives do
		table.insert(ps, { id = p.id, level = p.level })
	end
	local s = pl.stats
	return {
		t = "hero",
		slot = pl.slot,
		hp = math.floor(pl.hp + 0.5),
		maxHp = s.maxHp,
		xp = pl.xp,
		xpNext = pl.xpNext,
		level = pl.level,
		gold = pl.gold,
		kills = run.kills,
		ownKills = pl.kills,
		weapons = ws,
		passives = ps,
		speed = s.speed,
		magnet = s.magnet,
		rerolls = pl.rerolls,
		skips = pl.skips,
		banishes = pl.banishes,
		state = pl.state,
		bleed = pl.bleedT,
		revive = pl.reviveFrac,
		stats = {
			maxHp = s.maxHp,
			armor = s.armor,
			regen = s.regen,
			might = s.might,
			area = s.area,
			cooldown = s.cooldown,
			amount = s.amount,
			duration = s.duration,
			projSpeed = s.projSpeed,
			magnet = s.magnet,
			luck = s.luck,
			growth = s.growth,
			greed = s.greed,
			crit = s.crit,
			speed = s.speed,
		},
	}
end

-- cheap change signature for throttled hero updates
function Views.heroSig(run, pl): string
	return string.format(
		"%d|%d|%.0f|%d|%d|%d|%s|%d|%d",
		math.floor(pl.hp + 0.5),
		pl.level,
		pl.xp,
		pl.gold,
		run.kills,
		#pl.weapons + #pl.passives * 10,
		pl.state,
		math.floor(pl.bleedT),
		math.floor((pl.reviveFrac or 0) * 20)
	)
end

-- run clock and boss bar (4 Hz for everybody)
function Views.runInfo(run)
	local boss = nil
	for _, b in run.bosses do
		if not b.dead then
			boss = { name = b.boss.name, frac = math.max(0, b.hp / b.maxHp), final = b.boss.final == true }
			break
		end
	end
	local teammates = {}
	for _, p in run.plist do
		table.insert(teammates, {
			slot = p.slot,
			hp = if p.stats then p.hp / p.stats.maxHp else 0,
			state = p.state,
			level = p.level,
			hero = p.heroId,
			bleed = p.bleedT,
			revive = p.reviveFrac,
		})
	end
	return {
		t = "run",
		time = run.t,
		state = run.state,
		stage = run.stage.id,
		heat = run.heat,
		length = run.length,
		boss = boss,
		team = teammates,
		lastChance = if run.state == "lastchance" then run.lastT else nil,
		vote = if run.state == "victory" then run.voteT else nil,
		endless = run.endless,
	}
end

-- a sim event that becomes a Ui message (nil when it is not one); `slot` filters per-player events
function Views.uiFromEvent(e, slot: number?)
	if not Protocol.UI_EVENTS[e.k] then
		return nil
	end
	if
		e.slot
		and slot
		and e.slot ~= slot
		and e.k ~= "down"
		and e.k ~= "revived"
		and e.k ~= "left"
		and e.k ~= "vote"
	then
		return nil
	end
	local msg = { t = e.k }
	for k, v in e do
		-- options / chest results / args are plain data; UI events carry no sim objects
		if k ~= "k" and type(v) ~= "function" then
			msg[k] = v
		end
	end
	return msg
end

return Views
