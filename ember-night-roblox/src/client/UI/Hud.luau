-- In-run HUD (docs/DESIGN.md §5.2): XP bar with level, run clock, kills and gold, pause button (solo), weapon and
-- passive slots with level pips, boss bar with name, countdown/surge bar (icon, label, time, warning pulse), HP bar,
-- teammates with HP and downed/fallen state, banner, toasts, a red flash when hurt. Scale-based layout inside the
-- device safe area; touch screens get bigger buttons.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Heroes = require(Shared.Sim.Data.Heroes)
local Weapons = require(Shared.Sim.Data.Weapons)
local Passives = require(Shared.Sim.Data.Passives)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)
local Icons = require(script.Parent.Icons)
local Device = require(script.Parent.Parent.Device)

local Hud = {}
local tr = Lang.tr

local gui: ScreenGui = nil :: any
local ui: { [string]: any } = {}
local bannerT = 0
local timeBase, timeAt = 0, 0
local runState = "play"
local countdown: any = nil
local command: (any) -> () = function(_) end
local openMenu: () -> () = function() end
local isSolo = true
local hurtT = 0
local buildSig = ""
local teamSig = ""
local toasts: { { frame: Frame, t: number } } = {}
local names: { [number]: string } = {}
local ownSlot = 0

local function args(a)
	if type(a) ~= "table" then
		return {}
	end
	local out = {}
	for i, v in a do
		out[i] = if type(v) == "string" then tr(v) else v
	end
	return out
end

local function corner(f: Instance, r: number)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, r)
	c.Parent = f
end

local function stroke(f: Instance, col: Color3, th: number, tr0: number?)
	local s = Instance.new("UIStroke")
	s.Color = col
	s.Thickness = th
	s.Transparency = tr0 or 0
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Parent = f
end

-- a framed bar: background, fill, optional text; returns frame, fill
local function bar(parent: Instance, col: Color3, props: { [string]: any }): (Frame, Frame)
	local bg = Kit.frame(parent, props)
	bg.BackgroundColor3 = Color3.fromRGB(16, 10, 24)
	bg.BackgroundTransparency = 0.15
	corner(bg, 6)
	stroke(bg, Color3.fromRGB(0, 0, 0), 2, 0.3)
	local fill = Kit.frame(bg, { BackgroundColor3 = col, Size = UDim2.fromScale(0, 1) })
	corner(fill, 6)
	local g = Instance.new("UIGradient")
	g.Rotation = 90
	g.Color = ColorSequence.new(col:Lerp(Color3.new(1, 1, 1), 0.25), col:Lerp(Color3.new(0, 0, 0), 0.25))
	g.Parent = fill
	return bg, fill
end

local function setFill(fill: Frame, v: number)
	fill.Size = UDim2.fromScale(math.clamp(v, 0, 1), 1)
end

-- menu = opens the pause screen without pausing (co-op)
function Hud.init(cmd, menu: (() -> ())?)
	command = cmd
	openMenu = menu or openMenu
	gui = Kit.screen("EN_Hud", 2)
	gui.Enabled = false
	local touch = Device.touch()
	-- hurt flash under everything
	ui.hurt = Kit.frame(gui, {
		BackgroundColor3 = Color3.fromRGB(255, 40, 70),
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		ZIndex = 0,
	})
	-- XP bar across the top with the level
	local xpBg, xpFill = bar(gui, Theme.xp, { Size = UDim2.new(1, -16, 0, 14), Position = UDim2.fromOffset(8, 4) })
	ui.xpFill = xpFill
	ui.level = Kit.label(xpBg, "", {
		Size = UDim2.new(1, -12, 1, 0),
		Position = UDim2.fromOffset(8, 0),
		TextSize = 12,
		Font = Theme.number,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextStrokeTransparency = 0.4,
	})
	ui.timer = Kit.label(gui, "0:00", {
		Font = Theme.title,
		TextSize = 34,
		Size = UDim2.fromOffset(180, 38),
		Position = UDim2.new(0.5, 0, 0, 20),
		AnchorPoint = Vector2.new(0.5, 0),
		TextStrokeTransparency = 0.35,
	})
	ui.stats = Kit.label(gui, "", {
		TextSize = 18,
		Font = Theme.number,
		Size = UDim2.fromOffset(260, 26),
		Position = UDim2.new(1, -10, 0, 24),
		AnchorPoint = Vector2.new(1, 0),
		TextXAlignment = Enum.TextXAlignment.Right,
		TextStrokeTransparency = 0.4,
	})
	local pb = if touch then 56 else 44
	ui.pause = Kit.button(gui, "II", function()
		if not isSolo then
			openMenu()
		else
			command({ op = if runState == "paused" then "resume" else "pause" })
		end
	end, { Size = UDim2.fromOffset(pb, pb), Position = UDim2.fromOffset(8, 24), BackgroundColor3 = Theme.panel2 })
	-- build: weapons and passives under the pause button
	ui.build = Kit.frame(gui, {
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(250, 76),
		Position = UDim2.fromOffset(8, 24 + pb + 6),
	})
	local wl = Kit.list(ui.build, false, 4)
	wl.HorizontalAlignment = Enum.HorizontalAlignment.Left
	ui.weapons = Kit.frame(ui.build, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 36), LayoutOrder = 1 })
	local l1 = Kit.list(ui.weapons, true, 4)
	l1.HorizontalAlignment = Enum.HorizontalAlignment.Left
	ui.passives = Kit.frame(ui.build, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 30), LayoutOrder = 2 })
	local l2 = Kit.list(ui.passives, true, 4)
	l2.HorizontalAlignment = Enum.HorizontalAlignment.Left
	-- boss bar
	ui.boss = Kit.frame(gui, {
		BackgroundTransparency = 1,
		Size = UDim2.new(0.46, 0, 0, 40),
		Position = UDim2.new(0.5, 0, 0, 64),
		AnchorPoint = Vector2.new(0.5, 0),
		Visible = false,
	})
	local sc = Instance.new("UISizeConstraint")
	sc.MinSize = Vector2.new(260, 0)
	sc.MaxSize = Vector2.new(620, 100)
	sc.Parent = ui.boss
	ui.bossName = Kit.label(ui.boss, "", {
		Size = UDim2.new(1, 0, 0, 20),
		Font = Theme.title,
		TextSize = 19,
		TextColor3 = Color3.fromRGB(255, 200, 210),
		TextStrokeTransparency = 0.3,
	})
	local _, bossFill = bar(ui.boss, Theme.boss, { Size = UDim2.new(1, 0, 0, 14), Position = UDim2.fromOffset(0, 22) })
	ui.bossFill = bossFill
	-- countdown / surge bar
	ui.cd = Kit.panel(gui, {
		Size = UDim2.fromOffset(340, 42),
		Position = UDim2.new(0.5, 0, 0, 64),
		AnchorPoint = Vector2.new(0.5, 0),
		BackgroundTransparency = 0.2,
		Visible = false,
	})
	ui.cdIcon = Kit.frame(
		ui.cd,
		{ BackgroundTransparency = 1, Size = UDim2.fromOffset(34, 34), Position = UDim2.fromOffset(4, 4) }
	)
	ui.cdText = Kit.label(ui.cd, "", {
		Size = UDim2.new(1, -48, 0, 22),
		Position = UDim2.fromOffset(44, 2),
		TextSize = 16,
		Font = Theme.number,
		TextXAlignment = Enum.TextXAlignment.Left,
	})
	local _, cdFill = bar(ui.cd, Theme.primary, { Size = UDim2.new(1, -52, 0, 8), Position = UDim2.fromOffset(44, 27) })
	ui.cdFill = cdFill
	-- banner and sub line
	ui.banner = Kit.label(gui, "", {
		Font = Theme.title,
		TextSize = 34,
		Size = UDim2.new(1, -40, 0, 42),
		Position = UDim2.new(0.5, 0, 0, 150),
		AnchorPoint = Vector2.new(0.5, 0),
		TextColor3 = Theme.primary,
		TextStrokeTransparency = 0.3,
		Visible = false,
	})
	ui.bannerSub = Kit.label(gui, "", {
		TextSize = 18,
		Size = UDim2.new(1, -40, 0, 24),
		Position = UDim2.new(0.5, 0, 0, 194),
		AnchorPoint = Vector2.new(0.5, 0),
		Visible = false,
		TextStrokeTransparency = 0.4,
	})
	-- teammates
	ui.team = Kit.frame(gui, {
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(210, 200),
		Position = UDim2.new(1, -10, 0, 58),
		AnchorPoint = Vector2.new(1, 0),
	})
	local tl = Kit.list(ui.team, false, 4)
	tl.HorizontalAlignment = Enum.HorizontalAlignment.Right
	-- toasts (achievements, purchases) under the team
	ui.toasts = Kit.frame(gui, {
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(280, 160),
		Position = UDim2.new(1, -10, 0, 250),
		AnchorPoint = Vector2.new(1, 0),
	})
	local tol = Kit.list(ui.toasts, false, 6)
	tol.HorizontalAlignment = Enum.HorizontalAlignment.Right
	-- HP bar at the bottom
	local hpBg, hpFill = bar(gui, Theme.hp, {
		Size = UDim2.fromOffset(300, 20),
		Position = UDim2.new(0.5, 0, 1, -32),
		AnchorPoint = Vector2.new(0.5, 0),
	})
	ui.hpFill = hpFill
	ui.hpText = Kit.label(hpBg, "", {
		Size = UDim2.fromScale(1, 1),
		TextSize = 13,
		Font = Theme.number,
		TextStrokeTransparency = 0.4,
	})
end

function Hud.setVisible(on: boolean, solo: boolean?)
	gui.Enabled = on
	if solo ~= nil then
		isSolo = solo
	end
	ui.pause.Text = if isSolo then "II" else "☰"
	if not on then
		countdown = nil
		ui.boss.Visible = false
		ui.cd.Visible = false
		buildSig, teamSig = "", ""
		Kit.clear(ui.weapons)
		Kit.clear(ui.passives)
		Kit.clear(ui.team)
		for _, t in toasts do
			t.frame:Destroy()
		end
		table.clear(toasts)
	end
end

-- names of the run's players (slot -> display name) and the own slot
function Hud.setTeam(team: { [number]: any }?, slot: number?)
	table.clear(names)
	for s, info in team or {} do
		if type(info) == "table" and type(info.name) == "string" then
			names[s] = info.name
		end
	end
	ownSlot = slot or 0
	teamSig = ""
end

local function renderBuild(m)
	local parts = {}
	for _, w in m.weapons or {} do
		table.insert(parts, w.id .. w.level .. (if w.evo then "E" else ""))
	end
	for _, p in m.passives or {} do
		table.insert(parts, p.id .. p.level)
	end
	local sig = table.concat(parts, ",")
	if sig == buildSig then
		return
	end
	buildSig = sig
	Kit.clear(ui.weapons)
	Kit.clear(ui.passives)
	for i, w in m.weapons or {} do
		local d = Weapons.byId[w.id]
		Icons.tile(ui.weapons, "weapon", w.id, 36, { LayoutOrder = i }, w.level, if d then #d.levels + 1 else 8, w.evo)
	end
	for i, p in m.passives or {} do
		local d = Passives.byId[p.id]
		Icons.tile(ui.passives, "passive", p.id, 30, { LayoutOrder = i }, p.level, if d then d.max else 5)
	end
end

function Hud.hero(m)
	setFill(ui.hpFill, m.hp / math.max(1, m.maxHp))
	ui.hpText.Text = string.format("%d / %d", m.hp, m.maxHp)
	setFill(ui.xpFill, m.xp / math.max(1, m.xpNext))
	ui.level.Text = tr("Stufe {0}", m.level)
	ui.stats.Text = string.format("☠ %s    ● %s", Lang.fmtNum(m.kills), Lang.fmtNum(m.gold))
	renderBuild(m)
end

local function teamCard(p, i)
	local h = Heroes.byId[p.hero]
	local col = Color3.fromHex(if h then h.color else "#4f8cff")
	local card = Kit.panel(ui.team, {
		Size = UDim2.fromOffset(200, 42),
		BackgroundTransparency = 0.25,
		LayoutOrder = i,
	})
	local strip =
		Kit.frame(card, { BackgroundColor3 = col, Size = UDim2.new(0, 6, 1, -8), Position = UDim2.fromOffset(4, 4) })
	corner(strip, 3)
	local name = names[p.slot] or (if h then tr(h.name) else "?")
	local stateText = ""
	local stateCol = Theme.text
	if p.state == "downed" then
		stateText = "✚ " .. math.ceil(p.bleed or 0) .. " s"
		stateCol = Theme.good
	elseif p.state == "fallen" then
		stateText = "✖"
		stateCol = Theme.bad
	end
	Kit.label(card, name .. "  " .. tr("St. {0}", p.level or 1), {
		Size = UDim2.new(1, -70, 0, 18),
		Position = UDim2.fromOffset(14, 3),
		TextSize = 13,
		Font = Theme.number,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextTruncate = Enum.TextTruncate.AtEnd,
	})
	Kit.label(card, stateText, {
		Size = UDim2.fromOffset(56, 18),
		Position = UDim2.new(1, -60, 0, 3),
		TextSize = 13,
		Font = Theme.number,
		TextColor3 = stateCol,
		TextXAlignment = Enum.TextXAlignment.Right,
	})
	local _, fill = bar(card, if p.state == "downed" then Theme.good else Theme.hp, {
		Size = UDim2.new(1, -22, 0, 8),
		Position = UDim2.fromOffset(14, 26),
	})
	setFill(fill, if p.state == "downed" then (p.revive or 0) else (p.hp or 0))
end

function Hud.run(m)
	timeBase, timeAt = m.time, os.clock()
	runState = m.state
	if m.boss then
		ui.boss.Visible = true
		setFill(ui.bossFill, m.boss.frac)
		ui.bossName.Text = (if m.boss.final then "👑 " else "") .. tr(m.boss.name)
	else
		ui.boss.Visible = false
	end
	ui.cd.Position = UDim2.new(0.5, 0, 0, if ui.boss.Visible then 108 else 64)
	-- teammates (everyone but me), rebuilt only when something visible changed
	local parts = {}
	local others = {}
	for _, p in m.team do
		if p.slot ~= ownSlot then
			table.insert(others, p)
			table.insert(
				parts,
				string.format(
					"%d%s%d%d%d",
					p.slot,
					p.state,
					math.floor((p.hp or 0) * 40),
					math.ceil(p.bleed or 0),
					math.floor((p.revive or 0) * 20)
				)
			)
		end
	end
	local sig = table.concat(parts, "|")
	if sig ~= teamSig then
		teamSig = sig
		Kit.clear(ui.team)
		if #m.team > 1 then
			for i, p in others do
				teamCard(p, i)
			end
		end
	end
	if isSolo then
		ui.pause.Text = if m.state == "paused" then "▶" else "II"
	end
end

function Hud.state(state: string)
	runState = state
	if isSolo then
		ui.pause.Text = if state == "paused" then "▶" else "II"
	end
end

function Hud.banner(m)
	local a = args(m.args)
	ui.banner.Text = if #a > 0 then tr(m.text, table.unpack(a)) else tr(m.text)
	ui.banner.Visible = true
	ui.banner.TextColor3 = if m.kind == "boss" then Theme.bad elseif m.kind == "win" then Theme.gold else Theme.primary
	if m.sub then
		ui.bannerSub.Text = if #a > 0 then tr(m.sub, table.unpack(a)) else tr(m.sub)
		ui.bannerSub.Visible = true
	else
		ui.bannerSub.Visible = false
	end
	bannerT = m.dur or 2.4
end

function Hud.countdown(m)
	if m.phase == "off" then
		countdown = nil
		ui.cd.Visible = false
		return
	end
	countdown = m
	ui.cd.Visible = true
	Kit.clear(ui.cdIcon)
	if m.icon then
		local t = Icons.tile(ui.cdIcon, "enemy", m.icon, 34)
		if m.tint and type(m.tint) == "string" and #m.tint == 7 then
			t.BackgroundColor3 = Color3.fromHex(m.tint):Lerp(Color3.new(0, 0, 0), 0.4)
		end
	end
end

-- a toast at the right (achievements, purchases); fades after 3 s
function Hud.toast(text: string, color: Color3?)
	local f = Kit.panel(ui.toasts, {
		Size = UDim2.fromOffset(270, 36),
		BackgroundTransparency = 0.15,
		LayoutOrder = math.floor(os.clock() * 10),
	})
	Kit.label(f, text, {
		Size = UDim2.new(1, -16, 1, 0),
		Position = UDim2.fromOffset(8, 0),
		TextSize = 15,
		Font = Theme.number,
		TextColor3 = color or Theme.gold,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextTruncate = Enum.TextTruncate.AtEnd,
	})
	table.insert(toasts, { frame = f, t = 3 })
	while #toasts > 4 do
		local old = table.remove(toasts, 1)
		if old then
			old.frame:Destroy()
		end
	end
end

function Hud.achievement(name: string)
	Hud.toast("🏆 " .. tr(name))
end

-- red flash at the screen edges when the own hero takes damage
function Hud.hurt()
	hurtT = 0.35
end

function Hud.bossActive(): boolean
	return ui.boss ~= nil and ui.boss.Visible
end

function Hud.surgeOn(): boolean
	return countdown ~= nil and countdown.kind ~= "boss" and countdown.phase == "on"
end

function Hud.runState(): string
	return runState
end

-- estimated sim time (run clock from the last "run" message, advancing while playing)
function Hud.time(): number
	return timeBase + (if runState == "play" then os.clock() - timeAt else 0)
end

-- per frame: timer, banner fade, countdown bar, toasts, hurt flash
function Hud.update(dt: number)
	if not gui.Enabled then
		return
	end
	local t = Hud.time()
	ui.timer.Text = Lang.fmtTime(t)
	if bannerT > 0 then
		bannerT -= dt
		if bannerT <= 0 then
			ui.banner.Visible = false
			ui.bannerSub.Visible = false
		end
	end
	if hurtT > 0 then
		hurtT -= dt
		ui.hurt.BackgroundTransparency = 1 - math.max(0, hurtT / 0.35) * 0.3
	end
	for i = #toasts, 1, -1 do
		local to = toasts[i]
		to.t -= dt
		if to.t <= 0 then
			to.frame:Destroy()
			table.remove(toasts, i)
		end
	end
	if countdown then
		local c = countdown
		local on = c.phase == "on"
		local left = if on then c["end"] - t else c.at - t
		local total = if on then c["end"] - c.at else c.at - c.start
		setFill(ui.cdFill, math.clamp(left / math.max(total, 0.1), 0, 1))
		local lt = Lang.fmtTime(math.max(0, math.ceil(left)))
		if c.kind == "boss" then
			ui.cdText.Text = tr("{0} in {1}", tr(c.label), lt)
		elseif on then
			ui.cdText.Text = tr("Ansturm! Noch {0}", lt)
		else
			ui.cdText.Text = tr("Ansturm in {0}", lt)
		end
		-- warning colours: the last 10 s before it starts pulse; a running surge is red
		local pulse = (not on and left <= 10 and math.floor(t * 4) % 2 == 0)
		ui.cdFill.BackgroundColor3 = if on then Theme.bad elseif pulse then Theme.gold else Theme.primary
		ui.cdText.TextColor3 = if on or pulse then Theme.gold else Theme.text
	end
end

return Hud
