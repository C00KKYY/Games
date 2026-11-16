-- Test helpers for driving a sim run.
local Run = require("../../src/shared/Sim/Run")

local Sim = {}

function Sim.new(opts)
	opts = opts or {}
	local players = opts.players
	if not players then
		players = {}
		for s = 1, opts.n or 1 do
			players[s] = { slot = s, userId = s, heroId = opts.hero or "aron", forge = opts.forge }
		end
	end
	return Run.new({
		seed = opts.seed or 1,
		stageId = opts.stage or "graveyard",
		heat = opts.heat or 0,
		players = players,
		reviveOffer = opts.reviveOffer,
	})
end

-- advance `seconds`; god = heroes cannot be hurt; autopick answers dialogs; onStep(run) after every step;
-- events are collected into `log` (when given) and cleared
function Sim.advance(run, seconds: number, o)
	o = o or {}
	local target = run.t + seconds
	local guard = 0
	while run.t < target and run.state ~= "over" and guard < seconds * 40 + 100 do
		guard += 1
		if o.god then
			for _, p in run.plist do
				p.iframe = 1e9
				if p.state == "active" then
					p.hp = p.stats.maxHp
				end
			end
		end
		if o.move then
			for _, p in run.plist do
				Run.setMove(run, p.slot, o.move[1], o.move[2])
			end
		end
		if o.autopick ~= false then
			for _, p in run.plist do
				if p.offer and (run.state == "levelup" or not run.solo) then
					Run.command(run, p.slot, { op = "pick", i = 1 })
				end
			end
			if run.state == "chest" then
				Run.command(run, 1, { op = "chestClose" })
			end
		end
		if run.state ~= "play" and run.state ~= "lastchance" and run.state ~= "victory" and o.autopick == false then
			break
		end
		Run.step(run, 1 / 30)
		if o.onStep then
			o.onStep(run)
		end
		if o.log then
			for _, e in run.events do
				table.insert(o.log, e)
			end
		end
		table.clear(run.events)
		if o.stopOn and o.stopOn(run) then
			break
		end
	end
end

-- events of kind k in a log
function Sim.filter(log, k: string)
	local out = {}
	for _, e in log do
		if e.k == k then
			table.insert(out, e)
		end
	end
	return out
end

return Sim
