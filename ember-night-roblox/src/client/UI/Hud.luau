-- In-run HUD (R1, simple; docs/DESIGN.md §5.2): XP bar with level, timer, kills, gold, HP bar, boss bar, banner,
-- countdown bar, teammates, downed / last-chance / victory-vote info, pause button (solo).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Heroes = require(Shared.Sim.Data.Heroes)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

local Hud = {}
local tr = Lang.tr

local gui: ScreenGui = nil :: any
local ui: { [string]: any } = {}
local bannerT = 0
local timeBase, timeAt = 0, 0
local runState = "play"
local countdown: any = nil
local command: (any) -> () = function(_) end
local isSolo = true

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

function Hud.init(cmd)
	command = cmd
	gui = Kit.screen("EN_Hud", 2)
	gui.Enabled = false
	local xpBg, setXp = Kit.bar(gui, Theme.xp, { Size = UDim2.new(1, -20, 0, 14), Position = UDim2.fromOffset(10, 6) })
	ui.setXp = setXp
	ui.level = Kit.label(xpBg, "", { Size = UDim2.fromScale(1, 1), TextSize = 12, Font = Theme.number })
	ui.timer = Kit.label(gui, "0:00", {
		Font = Theme.number,
		TextSize = 30,
		Size = UDim2.fromOffset(160, 36),
		Position = UDim2.new(0.5, -80, 0, 22),
	})
	ui.stats = Kit.label(gui, "", {
		TextSize = 16,
		Size = UDim2.fromOffset(300, 24),
		Position = UDim2.new(1, -310, 0, 24),
		TextXAlignment = Enum.TextXAlignment.Right,
	})
	local hpBg, setHp =
		Kit.bar(gui, Theme.hp, { Size = UDim2.fromOffset(260, 16), Position = UDim2.new(0.5, -130, 1, -40) })
	ui.setHp = setHp
	ui.hpText = Kit.label(hpBg, "", { Size = UDim2.fromScale(1, 1), TextSize = 12, Font = Theme.number })
	local bossBg, setBoss = Kit.bar(
		gui,
		Theme.boss,
		{ Size = UDim2.new(0.5, 0, 0, 14), Position = UDim2.new(0.25, 0, 0, 88), Visible = false }
	)
	ui.bossBg = bossBg
	ui.setBoss = setBoss
	ui.bossName = Kit.label(
		bossBg,
		"",
		{ Size = UDim2.new(1, 0, 0, 20), Position = UDim2.fromOffset(0, -22), Font = Theme.title, TextSize = 18 }
	)
	ui.banner = Kit.label(gui, "", {
		Font = Theme.title,
		TextSize = 32,
		Size = UDim2.new(1, 0, 0, 40),
		Position = UDim2.fromOffset(0, 120),
		TextColor3 = Theme.primary,
		TextStrokeTransparency = 0.4,
		Visible = false,
	})
	ui.bannerSub = Kit.label(gui, "", {
		TextSize = 18,
		Size = UDim2.new(1, 0, 0, 24),
		Position = UDim2.fromOffset(0, 162),
		Visible = false,
		TextStrokeTransparency = 0.5,
	})
	local cdBg, setCd = Kit.bar(
		gui,
		Theme.primary,
		{ Size = UDim2.fromOffset(320, 12), Position = UDim2.new(0.5, -160, 0, 66), Visible = false }
	)
	ui.cdBg = cdBg
	ui.setCd = setCd
	ui.cdText =
		Kit.label(cdBg, "", { Size = UDim2.new(1, 0, 0, 18), Position = UDim2.fromOffset(0, 12), TextSize = 14 })
	ui.team = Kit.label(gui, "", {
		TextSize = 14,
		Size = UDim2.fromOffset(220, 100),
		Position = UDim2.new(1, -230, 0, 52),
		TextXAlignment = Enum.TextXAlignment.Right,
		TextYAlignment = Enum.TextYAlignment.Top,
	})
	ui.center = Kit.label(gui, "", {
		Font = Theme.title,
		TextSize = 26,
		Size = UDim2.new(1, 0, 0, 34),
		Position = UDim2.new(0, 0, 0.5, 40),
		TextColor3 = Theme.bad,
		TextStrokeTransparency = 0.4,
		Visible = false,
	})
	ui.pause = Kit.button(gui, "II", function()
		command({ op = if runState == "paused" then "resume" else "pause" })
	end, { Size = UDim2.fromOffset(48, 44), Position = UDim2.fromOffset(10, 26), BackgroundColor3 = Theme.panel2 })
	ui.giveup = Kit.button(gui, tr("Aufgeben"), function()
		command({ op = "giveup" })
	end, {
		Size = UDim2.fromOffset(150, 44),
		Position = UDim2.new(0.5, -75, 0.5, 90),
		Visible = false,
		BackgroundColor3 = Theme.bad,
	})
end

function Hud.setVisible(on: boolean, solo: boolean?)
	gui.Enabled = on
	if solo ~= nil then
		isSolo = solo
	end
	ui.pause.Visible = isSolo
	if not on then
		countdown = nil
		ui.bossBg.Visible = false
		ui.cdBg.Visible = false
		ui.center.Visible = false
		ui.giveup.Visible = false
	end
end

function Hud.hero(m)
	ui.setHp(m.hp / math.max(1, m.maxHp))
	ui.hpText.Text = string.format("%d / %d", m.hp, m.maxHp)
	ui.setXp(m.xp / math.max(1, m.xpNext))
	ui.level.Text = tr("Stufe {0}", m.level)
	ui.stats.Text = string.format("☠ %s   ● %s", Lang.fmtNum(m.kills), Lang.fmtNum(m.gold))
	if m.state == "downed" then
		ui.center.Text = tr("Am Boden – {0} s", math.ceil(m.bleed))
			.. (if m.revive > 0 then "  ♥ " .. math.floor(m.revive * 100) .. " %" else "")
		ui.center.Visible = true
	elseif m.state == "fallen" then
		ui.center.Text = tr("Gefallen – du schaust zu")
		ui.center.Visible = true
	elseif runState == "play" then
		ui.center.Visible = false
	end
end

function Hud.run(m)
	timeBase, timeAt = m.time, os.clock()
	runState = m.state
	if m.boss then
		ui.bossBg.Visible = true
		ui.setBoss(m.boss.frac)
		ui.bossName.Text = tr(m.boss.name)
	else
		ui.bossBg.Visible = false
	end
	local lines = {}
	for _, p in m.team do
		local h = Heroes.byId[p.hero]
		local st = if p.state == "downed"
			then "  ✚ " .. math.ceil(p.bleed) .. " s"
			elseif p.state == "fallen" then "  ✖"
			else ""
		table.insert(lines, string.format("%s  %d%%%s", if h then h.name else "?", math.floor(p.hp * 100), st))
	end
	ui.team.Text = if #m.team > 1 then table.concat(lines, "\n") else ""
	if m.state == "lastchance" then
		ui.center.Text = tr("Letzte Chance – {0} s", math.ceil(m.lastChance or 0))
		ui.center.Visible = true
	elseif m.state == "victory" and m.vote then
		ui.center.Text = tr("Abstimmung: noch {0} s", math.ceil(m.vote))
		ui.center.Visible = true
	end
	ui.giveup.Visible = m.state == "paused"
	ui.pause.Text = if m.state == "paused" then "▶" else "II"
end

function Hud.state(state: string)
	runState = state
	ui.giveup.Visible = state == "paused"
	ui.pause.Text = if state == "paused" then "▶" else "II"
	if state == "play" then
		ui.center.Visible = false
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
		ui.cdBg.Visible = false
		return
	end
	countdown = m
	ui.cdBg.Visible = true
end

function Hud.achievement(name: string)
	ui.bannerSub.Text = "🏆 " .. tr(name)
	ui.bannerSub.Visible = true
	bannerT = math.max(bannerT, 2.5)
end

function Hud.bossActive(): boolean
	return ui.bossBg ~= nil and ui.bossBg.Visible
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

-- per frame: timer, banner fade, countdown bar
function Hud.update(dt: number)
	if not gui.Enabled then
		return
	end
	local t = timeBase + (if runState == "play" then os.clock() - timeAt else 0)
	ui.timer.Text = Lang.fmtTime(t)
	if bannerT > 0 then
		bannerT -= dt
		if bannerT <= 0 then
			ui.banner.Visible = false
			ui.bannerSub.Visible = false
		end
	end
	if countdown then
		local c = countdown
		local on = c.phase == "on"
		local left = if on then c["end"] - t else c.at - t
		local total = if on then c["end"] - c.at else c.at - c.start
		ui.setCd(math.clamp(left / math.max(total, 0.1), 0, 1))
		local lt = Lang.fmtTime(math.max(0, math.ceil(left)))
		if c.kind == "boss" then
			ui.cdText.Text = tr("{0} in {1}", tr(c.label), lt)
		elseif on then
			ui.cdText.Text = tr("Ansturm! Noch {0}", lt)
		else
			ui.cdText.Text = tr("Ansturm in {0}", lt)
		end
	end
end

return Hud
