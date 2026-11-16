-- Arena smoke test: the whole client (App with every view, HUD, cards, audio) on Lune's Roblox Instances, fed by the
-- real server services over the real Codec (tests/lib/Arena.luau). Plays runs on every land, spawns every enemy type
-- and every boss with their telegraphed attacks, levels up, opens chests, goes down, gets revived, ends the run;
-- checks that nothing errors, that pooled parts are returned and that the part count stays bounded.
local T = require("./lib/T")
local Arena = require("./lib/Arena")
local Run = require("../src/shared/Sim/Run")
local Stages = require("../src/shared/Sim/Data/Stages")
local Enemies = require("../src/shared/Sim/Data/Enemies")
local K = Run.K

local suite = T.new("arena")

local function noErrors(a, what)
	local errs = a:errors()
	T.eq(#errs, 0, (what or "") .. "\n" .. table.concat(errs, "\n---\n"))
	T.eq(#a.bad, 0, "invalid commands: " .. table.concat(a.bad, ", "))
end

local function circle(a)
	local Controls = a:client("Input/Controls")
	local t = 0
	Controls.move = function()
		t += 1 / 30
		return math.cos(t * 0.7), math.sin(t * 0.7)
	end
end

local function start(a, stageId: string, heat: number?)
	local parts = {}
	for _, p in a.players do
		table.insert(parts, { player = p, hero = "aron" })
	end
	a.rb.deps.RunHost.start(parts, stageId, heat or 0)
	a:frames(0.5)
	T.ok(a:run(), "run started")
end

suite:test("solo run on the graveyard: move, level up, chest, give up, results", function()
	local a = Arena.new(1)
	circle(a)
	start(a, "graveyard")
	local peak, lights, emitters, numbers = 0, 0, 0, 0
	a:frames(90, true, function(i)
		if i % 30 == 0 then
			peak = math.max(peak, a:visibleParts())
			lights = math.max(lights, a:count("PointLight"))
			emitters = math.max(emitters, a:count("ParticleEmitter"))
			local n = 0
			for _, d in a.rb.workspace:GetDescendants() do
				if d:IsA("BillboardGui") and d.Enabled and d.Parent.Name == "EN_Num" then
					n += 1
				end
			end
			numbers = math.max(numbers, n)
		end
	end)
	T.ok(lights <= 12, "dynamic lights within budget: " .. lights)
	T.ok(emitters <= 26, "particle emitters within budget: " .. emitters)
	T.ok(numbers <= 40, "damage numbers within budget: " .. numbers)
	noErrors(a, "after 90 s")
	T.ok(a.cnet.sentMoves > 100, "moves sent")
	local run = a:run()
	T.ok(run.players[1].level > 3, "levelled up (level " .. run.players[1].level .. ")")
	T.ok(peak > 20 and peak < 3000, "visible parts in range: " .. peak)
	a.cnet.command({ op = "pause" })
	a:frames(0.2)
	a.cnet.command({ op = "giveup" })
	a:frames(1)
	a.rb:advance(1)
	noErrors(a, "after the end")
	T.ok(a.rb:lastUi(a.me, "results"), "results")
	T.eq(a:visibleParts(), 0, "every arena part returned to its pool")
end)

suite:test("every land, every enemy type and every boss with its attacks (co-op, heat 5)", function()
	for si, stage in Stages.list do
		local a = Arena.new(2)
		circle(a)
		start(a, stage.id, 5)
		local run = a:run()
		local p = run.players[1]
		-- every enemy type around the heroes, elite and plain
		local i = 0
		local types = table.clone(Enemies.ORDER)
		table.remove(types) -- "night" is the final boss sprite
		for _, id in types do
			i += 1
			local ang = i / #types * math.pi * 2
			local e = K.spawnEnemy(run, id, p.x + math.cos(ang) * 260, p.y + math.sin(ang) * 260)
			if e and i % 3 == 0 then
				e.elite = true
			end
		end
		a:frames(6, true)
		noErrors(a, stage.id .. " enemies")
		-- the land's bosses one after another (the last land: all of them)
		local list = if si == #Stages.list then {} else stage.bosses
		if si == #Stages.list then
			for _, s in Stages.list do
				for _, b in s.bosses do
					table.insert(list, b)
				end
			end
		end
		for _, b in list do
			K.spawnBoss(run, b, 1)
			a:frames(if si == #Stages.list then 6 else 12, true)
			for _, e in run.enemies do
				if e.boss then
					K.kill(run, e, 1)
				end
			end
			a:frames(1, true)
		end
		noErrors(a, stage.id .. " bosses")
		a.rb:leave(a.players[2])
		a:frames(1, true)
		-- killing a land's final boss wins the run: vote to finish; otherwise give up
		if run.state == "victory" then
			a.cnet.command({ op = "vote", endless = false })
		else
			a.cnet.command({ op = "giveup" })
		end
		a:frames(12)
		a.rb:advance(1)
		noErrors(a, stage.id .. " end")
		T.eq(a:visibleParts(), 0, stage.id .. ": every arena part returned")
	end
end)

suite:test("co-op: downed, revived by a teammate, results for both", function()
	local a = Arena.new(2)
	start(a, "ashwood")
	a:frames(20, true)
	local run = a:run()
	local me = run.players[1]
	me.iframe, me.wardT, me.revivals = 0, 0, 0
	K.hurtPlayer(run, me, 1e6, "test")
	a:frames(0.5)
	T.eq(me.state, "downed")
	-- the teammate stands on the downed hero
	local mate = run.players[2]
	for _ = 1, 30 * 6 do
		mate.x, mate.y = me.x + 10, me.y
		mate.iframe = 1e9
		a:frame()
		if me.state == "active" then
			break
		end
	end
	T.eq(me.state, "active", "revived")
	noErrors(a, "revive")
	for _, pl in run.plist do
		pl.iframe, pl.wardT, pl.revivals = 0, 0, 0
		K.hurtPlayer(run, pl, 1e6, "test")
	end
	a:frames(40)
	a.rb:advance(1)
	noErrors(a, "end")
	T.ok(a.rb:lastUi(a.me, "results"), "results")
	T.eq(a:visibleParts(), 0)
end)

local function gui(a, name)
	for _, g in a.rb.playerGui:GetChildren() do
		if g.Name == name then
			return g
		end
	end
	return nil
end

for _, lang in { "de", "en" } do
	suite:test("in-run screens on a phone (" .. lang .. "): cards by touch, pause toggles, give up, results", function()
		local Lang = require("../src/shared/Lang/Lang")
		local roblox = require("@lune/roblox")
		Arena.Roblox.viewport = roblox.Vector2.new(844, 390)
		Arena.Roblox.touch = true
		local ok, err = pcall(function()
			local a = Arena.new(1)
			-- the language comes from the profile (as when the player picks it in the settings)
			a.cnet.command({ op = "lang", lang = lang })
			a:frames(0.5)
			T.eq(Lang.get(), lang)
			start(a, "frostlake")
			local run = a:run()
			local picks = 0
			-- level up a few times and pick by tapping the first card
			for _ = 1, 4 do
				K.gainXp(run, run.players[1], 200)
				for _ = 1, 10 do
					a:frame(true)
				end
				local cards = gui(a, "EN_Cards")
				local bs = Arena.Roblox.buttons(cards)
				if #bs > 0 and run.players[1].offer then
					a.rb:click(bs[1])
					picks += 1
				end
				a:frames(1, true)
			end
			T.ok(picks >= 2, "cards picked by tapping: " .. picks)
			T.ok(#run.players[1].weapons + #run.players[1].passives > 1, "the picks arrived")
			-- pause: every toggle, then give up with confirmation
			a.cnet.command({ op = "pause" })
			a:frames(0.3)
			local pause = assert(gui(a, "EN_Pause"))
			T.ok(pause.Enabled, "pause screen open")
			local texts = {}
			for _, b in Arena.Roblox.buttons(pause) do
				table.insert(texts, b.Text)
			end
			T.ok(#texts >= 7, "pause buttons: " .. table.concat(texts, " | "))
			local function clickText(want)
				for _, b in Arena.Roblox.buttons(assert(gui(a, "EN_Pause"))) do
					if b.Text == want then
						a.rb:click(b)
						a:frames(0.2)
						return true
					end
				end
				return false
			end
			T.ok(clickText(Lang.tr("Aufgeben")), "give up button")
			T.eq(run.state, "paused", "first press only asks")
			T.ok(clickText(Lang.tr("Wirklich aufgeben?")), "confirm button")
			a:frames(1)
			a.rb:advance(1)
			local res = assert(gui(a, "EN_Results"))
			local back = nil
			for _, b in Arena.Roblox.buttons(res) do
				if b.Text == Lang.tr("Zurück") then
					back = b
				end
			end
			T.ok(back, "results back button")
			a.rb:click(back)
			a:frames(0.2)
			T.eq(#a:errors(), 0, table.concat(a:errors(), "\n"))
			T.eq(#a.bad, 0, "invalid commands: " .. table.concat(a.bad, ", "))
		end)
		Arena.Roblox.viewport = nil
		Arena.Roblox.touch = false
		Lang.setLang("en")
		assert(ok, err)
	end)
end

suite:test("new enemies rise out of the ground instead of popping in", function()
	local a = Arena.new(1)
	start(a, "graveyard")
	local run = a.rb.deps.RunHost.current()
	local hero = run.players[1]
	local ex, ey = hero.x + 200, hero.y - 150
	local e = K.spawnEnemy(run, "skel", ex, ey)
	local function topY(): number?
		ex, ey = e.x, e.y
		local best = nil
		for _, d in a.rb.workspace:GetDescendants() do
			if d:IsA("BasePart") and d.Transparency < 1 then
				local pp = d.CFrame.Position
				if math.abs(pp.X - ex * 0.1) < 3 and math.abs(pp.Z - ey * 0.1) < 3 and pp.Y < 20 then
					best = math.max(best or -math.huge, pp.Y)
				end
			end
		end
		return best
	end
	local first = nil
	for _ = 1, 30 do
		a:frames(1 / 30, true)
		first = topY()
		if first then
			break
		end
	end
	a:frames(1, true)
	local later = topY()
	T.ok(first and later and later - first > 1, "rises: " .. tostring(first) .. " -> " .. tostring(later))
	noErrors(a)
end)

return suite
