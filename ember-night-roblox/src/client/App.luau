-- Client application (docs/DESIGN.md §3.1): wires network messages to the arena views, the UI, audio and the camera.
-- The client renders and predicts only its own hero; every game rule runs on the server. Main.client.luau starts it
-- with the real ClientNet; tests/arena.spec.luau starts it with a fake net fed by the real server services.
local Players = game:GetService("Players")
local StarterGui = game:GetService("StarterGui")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Stages = require(Shared.Sim.Data.Stages)
local Achievements = require(Shared.Sim.Data.Achievements)
local Cosmetics = require(Shared.Config.Cosmetics)
local Mix = require(Shared.Audio.Mix)

local Controls = require(script.Parent.Input.Controls)
local CameraRig = require(script.Parent.World.CameraRig)
local Pool = require(script.Parent.World.Pool)
local EnemyView = require(script.Parent.World.EnemyView)
local HeroView = require(script.Parent.World.HeroView)
local Ground = require(script.Parent.World.Ground)
local Land = require(script.Parent.World.Land)
local TeleView = require(script.Parent.World.TeleView)
local ShotView = require(script.Parent.World.ShotView)
local PickupView = require(script.Parent.World.PickupView)
local FxView = require(script.Parent.World.FxView)
local Particles = require(script.Parent.World.Particles)
local DamageNumbers = require(script.Parent.World.DamageNumbers)
local ModelKit = require(script.Parent.World.ModelKit)
local LobbyUI = require(script.Parent.UI.Lobby)
local Hud = require(script.Parent.UI.Hud)
local LevelUpUI = require(script.Parent.UI.LevelUp)
local ResultsUI = require(script.Parent.UI.Results)
local Router = require(script.Parent.UI.Router)
local ReviveOffer = require(script.Parent.UI.ReviveOffer)
local StoryPanel = require(script.Parent.UI.StoryPanel)
local Names = require(script.Parent.UI.Names)
local Arrows = require(script.Parent.UI.Arrows)
local Downed = require(script.Parent.UI.Downed)
local Pause = require(script.Parent.UI.Pause)
local Kit = require(script.Parent.UI.Kit)
local Sfx = require(script.Parent.Audio.Sfx)
local Music = require(script.Parent.Audio.Music)

local App = {}
local ClientNet: any = nil
local player = Players.LocalPlayer
local tr = Lang.tr
Lang.setLang(Lang.fromLocale(player.LocaleId))

local inRun = false
local resultsOpen = false
local solo = true
local heroBySlot: { [number]: string } = {}
local langChosen = false
local lastHp: number? = nil
local S = 0.1 -- studs per sim px (Coords.S)

local function command(c)
	if c.op == "pick" then
		Sfx.play("item")
	end
	ClientNet.command(c)
end

local function setReset(enabled: boolean)
	task.spawn(function()
		for _ = 1, 10 do
			local ok = pcall(function()
				StarterGui:SetCore("ResetButtonCallback", enabled)
			end)
			if ok then
				return
			end
			task.wait(1)
		end
	end)
end

local function heroPos(slot: number)
	return HeroView.position(ClientNet.interp, slot)
end

-- cosmetics of everybody in the run (team = slot -> { hero, cos })
local function applyTeam(team)
	if type(team) ~= "table" then
		return
	end
	for slot, info in team do
		if type(info) == "table" then
			local cos = info.cos or {}
			HeroView.setCosmetics(slot, cos, info.name)
			local c = cos.fx and Cosmetics.byId[cos.fx]
			local colors = nil
			if c and c.colors then
				colors = {}
				for _, hex in c.colors do
					table.insert(colors, Color3.fromHex(hex))
				end
			end
			ShotView.setFxColors(slot, colors)
		end
	end
end

local function clearArena()
	EnemyView.clear()
	HeroView.clear()
	TeleView.clear()
	ShotView.clear()
	PickupView.clear()
	FxView.clear()
	Ground.clear()
	ClientNet.interp:reset()
end

local function bindRunActions()
	-- cards: number keys; on a gamepad the D-pad (in co-op the cards are not GUI-selected, so the thumbstick keeps
	-- moving the hero while choosing)
	local pads = { Enum.KeyCode.DPadLeft, Enum.KeyCode.DPadUp, Enum.KeyCode.DPadRight, Enum.KeyCode.DPadDown }
	for i, key in { Enum.KeyCode.One, Enum.KeyCode.Two, Enum.KeyCode.Three, Enum.KeyCode.Four } do
		Controls.bind("card" .. i, function()
			LevelUpUI.choose(i)
		end, key, pads[i])
	end
	Controls.bind("reroll", LevelUpUI.action, Enum.KeyCode.R, Enum.KeyCode.ButtonX)
	Controls.bind("skip", LevelUpUI.action, Enum.KeyCode.K, Enum.KeyCode.ButtonY)
	Controls.bind("banish", LevelUpUI.action, Enum.KeyCode.B)
	Controls.bind("pause", function()
		if Pause.isOpen() then
			Pause.close(true)
		elseif solo then
			command({ op = "pause" })
		else
			Pause.open(false)
		end
	end, Enum.KeyCode.P, Enum.KeyCode.ButtonL1, Enum.KeyCode.ButtonStart) -- Start may be taken by the Roblox menu
end

local function unbindRunActions()
	for _, n in { "card1", "card2", "card3", "card4", "reroll", "skip", "banish", "pause" } do
		Controls.unbind(n)
	end
end

local function enterArena(stageId: string)
	clearArena()
	local stage = Stages.list[1]
	for _, s in Stages.list do
		if s.id == stageId then
			stage = s
		end
	end
	Ground.setStage(stage)
	Land.enter(stage)
	EnemyView.setStage(stage)
	FxView.setStage(stage)
	LevelUpUI.setStage(stage)
	inRun = true
	lastHp = nil
	Music.release()
	Music.setIntensity(1)
	CameraRig.setActive(true)
	LobbyUI.setVisible(false)
	Router.setEnabled(false)
	ResultsUI.hide()
	setReset(false)
	bindRunActions()
end

local function leaveArena()
	inRun = false
	clearArena()
	Land.leave()
	CameraRig.setActive(false)
	Hud.setVisible(false)
	Arrows.setVisible(false)
	Downed.hide()
	Pause.close(false)
	LevelUpUI.close()
	LevelUpUI.closeChest()
	LevelUpUI.victory(false)
	ReviveOffer.hide()
	StoryPanel.hide()
	setReset(true)
	unbindRunActions()
end

function App.start(net)
	ClientNet = net
	ClientNet.init()
	Controls.init()
	Sfx.init()
	Music.init()
	Music.setIntensity(0)
	Kit.onClick = function()
		Sfx.play("click")
	end
	Pool.prewarm("Ball", 400)
	Pool.prewarm("Block", 700)
	Pool.prewarm("Cylinder", 120)
	Pool.prewarm("Wedge", 8)
	Pool.prewarm("Ellipsoid", 160)
	ShotView.setHeroPosition(heroPos)
	PickupView.setHeroPosition(heroPos, function(slot)
		return ModelKit.heroColor(heroBySlot[slot])
	end)
	Router.init(command)
	Router.onChange = function(open)
		LobbyUI.setVisible(not open and not inRun and not resultsOpen)
	end
	LobbyUI.init(command, Router.open)
	Hud.init(command, function()
		Pause.open(false)
	end)
	LevelUpUI.init(command, Hud.time)
	Downed.init()
	ReviveOffer.init(command)
	StoryPanel.init()
	Pause.init(command)
	Arrows.init()
	ResultsUI.init(function()
		resultsOpen = false
		Music.release()
		Music.setIntensity(0)
		LobbyUI.setVisible(true)
		Router.setEnabled(true)
	end)
	App.listen()
	-- lobby state on start (the server also pushes it on join)
	task.defer(function()
		local view = ClientNet.query("profile")
		if view and view.lang then
			Lang.setLang(view.lang)
			LobbyUI.rerender()
			Router.rerender()
		end
	end)
end

function App.listen()
	-- ---------- Ui messages ----------
	ClientNet.onUi("lobby", function(m)
		if not langChosen and m.profile and m.profile.lang then
			Lang.setLang(m.profile.lang)
		end
		if m.profile and m.profile.settings then
			local st = m.profile.settings
			CameraRig.setZoom(st.camZoom or 1)
			Sfx.setEnabled(st.sfx ~= false)
			Music.setEnabled(st.music ~= false)
			DamageNumbers.setEnabled(st.dmgNums ~= false)
			CameraRig.setShakeEnabled(st.shake ~= false)
			Particles.setLowFx(st.lowFx == true)
			Land.setLowFx(st.lowFx == true)
		end
		LobbyUI.render(m)
		Router.update(m)
		if not inRun and not resultsOpen and not Router.isOpen() then
			LobbyUI.setVisible(true)
		end
	end)
	ClientNet.onUi("purchased", function(m)
		Router.toast(tr("Gekauft: {0}", Names.product(m.key)))
		if inRun then
			Hud.toast(tr("Gekauft: {0}", Names.product(m.key)))
		end
		Sfx.play("buy")
	end)
	ClientNet.onUi("reviveOffer", function(m)
		if inRun then
			ReviveOffer.show(m)
		end
	end)
	ClientNet.onUi("runStart", function(m)
		solo = m.solo
		heroBySlot[m.slot] = m.hero
		enterArena(m.stage)
		applyTeam(m.team)
		HeroView.start(m.slot, m.x, m.y, m.hero)
		CameraRig.snap(m.x, m.y)
		Hud.setTeam(m.team, m.slot)
		Hud.setVisible(true, m.solo)
		Downed.setSolo(m.solo)
		Arrows.setVisible(true)
		if m.story then
			StoryPanel.show(m.stage, m.story.premise == true)
		end
	end)
	ClientNet.onUi("spectate", function(m)
		solo = false
		enterArena(m.stage)
		applyTeam(m.team)
		Hud.setTeam(m.team, 0)
		Hud.setVisible(true, false)
		Downed.setSolo(false)
		Arrows.setVisible(true)
	end)
	ClientNet.onUi("hero", function(m)
		if lastHp and m.hp < lastHp and m.state == "active" then
			Sfx.play("hurt")
			Hud.hurt()
		end
		lastHp = m.hp
		Hud.hero(m)
		Downed.hero(m)
		Pause.setHero(m)
		HeroView.setSpeed(m.speed)
		HeroView.setState(m.slot, m.state)
	end)
	ClientNet.onUi("run", function(m)
		Hud.run(m)
		Downed.run(m)
		if m.state == "victory" then
			LevelUpUI.victory(true, m.vote)
		end
		for _, p in m.team do
			heroBySlot[p.slot] = p.hero
			HeroView.setHero(p.slot, p.hero)
			HeroView.setState(p.slot, p.state)
		end
	end)
	ClientNet.onUi("levelup", function(m)
		LevelUpUI.show(m, solo)
	end)
	ClientNet.onUi("levelupDone", function()
		LevelUpUI.close()
	end)
	ClientNet.onUi("chest", function(m)
		LevelUpUI.chest(m.res, solo)
		if m.res.evolved then
			task.delay(0.45, Sfx.play, "evolve")
		end
		for i in m.res.items or {} do
			task.delay(0.5 + (i - 1) * 0.22, Sfx.play, "item")
		end
	end)
	ClientNet.onUi("banner", Hud.banner)
	ClientNet.onUi("countdown", Hud.countdown)
	ClientNet.onUi("state", function(m)
		Hud.state(m.state)
		LevelUpUI.victory(m.state == "victory")
		if m.state == "paused" then
			Pause.open(true)
		elseif solo and Pause.isOpen() then
			Pause.close(false)
		end
		if solo and m.state == "play" then
			LevelUpUI.close()
			LevelUpUI.closeChest()
		end
	end)
	ClientNet.onUi("boss", function(m)
		EnemyView.bossSpawned(m.id, m.name)
	end)
	ClientNet.onUi("correct", function(m)
		HeroView.correct(m.x, m.y)
	end)
	ClientNet.onUi("down", function(m)
		HeroView.setState(m.slot, m.state)
	end)
	ClientNet.onUi("revived", function(m)
		HeroView.setState(m.slot, "active")
		if m.slot == HeroView.own().slot then
			ReviveOffer.hide()
			Downed.hide()
		end
	end)
	ClientNet.onUi("achievement", function(m)
		for _, a in Achievements.list do
			if a.id == m.id then
				Hud.achievement(a.name)
			end
		end
	end)
	ClientNet.onUi("results", function(m)
		leaveArena()
		resultsOpen = true
		LobbyUI.setVisible(false)
		ResultsUI.show(m.summary)
		if not m.summary.won then
			Music.sting("gameover")
		end
	end)
	ClientNet.onUi("runEnded", function()
		leaveArena()
		LobbyUI.setVisible(true)
		Router.setEnabled(true)
	end)

	-- ---------- world events ----------
	ClientNet.onEvent(function(e)
		if not inRun then
			return
		end
		local k = e.k
		local now = os.clock()
		if k == "kill" then
			EnemyView.kill(e.id)
			FxView.kill(e)
		elseif k == "despawn" then
			EnemyView.kill(e.id)
		elseif k == "dmg" then
			FxView.number(e)
		elseif k == "eshot+" then
			ShotView.eshot(e)
		elseif k == "eshot-" then
			ShotView.eshotGone(e.id)
		elseif k == "tele+" then
			TeleView.add(e, now)
		elseif k == "tele~" then
			TeleView.update(e.id, e.a, e.x, e.y)
		elseif k == "tele-" then
			TeleView.remove(e.id)
		elseif k == "haz+" then
			FxView.hazard(e)
		elseif k == "haz~" then
			FxView.hazardLife(e.id, e.life)
		elseif k == "haz-" then
			FxView.hazardGone(e.id)
		elseif k == "gem+" then
			PickupView.gem(e)
		elseif k == "pick+" then
			PickupView.pickup(e)
		elseif k == "gemPull" or k == "pick~" then
			PickupView.pull(e.id, e.slot)
		elseif k == "gemGot" or k == "pick-" then
			PickupView.remove(e.id)
		elseif k == "fire" then
			ShotView.fire(e)
		elseif k == "shot-" then
			ShotView.shotGone(e.id)
		elseif k == "orbit" then
			ShotView.orbit(e)
		elseif k == "aura" then
			ShotView.aura(e)
		elseif k == "arc" then
			ShotView.arc(e)
		elseif k == "pool" then
			ShotView.pool(e)
		elseif k == "shake" then
			local own = HeroView.own()
			if not e.x or ((e.x - own.x) ^ 2 + (e.y - own.y) ^ 2) < 700 * 700 then
				CameraRig.shake(e.amount)
			end
		elseif k == "prop-" then
			Ground.breakProp(e.cx, e.cy)
		elseif k == "boom" then
			FxView.boom(e)
		elseif k == "burst" then
			FxView.burst(e)
		elseif k == "text" then
			FxView.text(e)
		elseif k == "flash" then
			FxView.flash(e)
		elseif k == "sfx" then
			if e.name == "victory" then
				Music.sting("victory")
			else
				local own = HeroView.own()
				local dist = nil
				if e.x and own.slot > 0 then
					dist = math.sqrt((e.x - own.x) ^ 2 + (e.y - own.y) ^ 2) * S
				end
				Sfx.play(e.name, dist)
			end
		end
	end)
end

-- ---------- frame loop ----------
local arrowHx, arrowHy = 0, 0
local function shotArrow(x: number, y: number, vx: number, vy: number)
	Arrows.shot(x, y, vx, vy, arrowHx, arrowHy)
end
local function chestArrow(x: number, y: number)
	Arrows.add("chest", x, y, 20)
end

function App.frame(dt: number)
	if not inRun then
		return
	end
	local now = os.clock()
	local interp = ClientNet.interp
	interp:update(dt)
	local own = HeroView.own()
	if own.slot > 0 then
		local mx, my = Controls.move()
		-- the world is paused (solo dialogs, last chance, victory): the hero stands still
		if Hud.runState() ~= "play" or (LevelUpUI.isOpen() and solo) then
			mx, my = 0, 0
		end
		HeroView.updateOwn(dt, mx, my, FxView.inSlow(own.x, own.y, 12), interp:latestHeroes(), ClientNet.sendMove)
	end
	local visible = HeroView.render(interp, now, dt)
	EnemyView.update(interp, now, visible, dt)
	TeleView.render(now)
	ShotView.render(dt, now)
	PickupView.render(dt, now)
	FxView.render(dt)
	-- camera target: own hero, or (downed/fallen/spectating) the first visible teammate
	local cx, cy = own.x, own.y
	if own.slot == 0 or own.state == "fallen" then
		for slot = 1, 4 do
			local x, y = interp:hero(slot)
			if x and slot ~= own.slot then
				cx, cy = x, y
				break
			end
		end
	end
	Ground.update(cx, cy)
	Land.update(cx, cy)
	CameraRig.update(dt, cx, cy)
	Hud.update(dt)
	LevelUpUI.update()
	Downed.update()
	-- off-screen arrows: incoming shots, downed teammates, the boss, own chests
	Arrows.begin()
	if own.slot > 0 and own.state == "active" then
		arrowHx, arrowHy = own.x, own.y
		ShotView.eachEnemyShot(shotArrow)
	end
	for slot, h in interp:latestHeroes() do
		if slot ~= own.slot and h.downed then
			Arrows.add("downed", h.x, h.y, 80)
		end
	end
	local bx, by = EnemyView.bossPosition()
	if bx then
		Arrows.add("boss", bx, by :: number, 50)
	end
	if own.slot > 0 then
		PickupView.eachChest(own.slot, chestArrow)
	end
	Arrows.render(now)
	Music.setIntensity(Mix.intensity(true, Hud.bossActive(), Hud.time(), Hud.surgeOn()))
end

return App
