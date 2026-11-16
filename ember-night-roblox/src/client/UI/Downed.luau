-- Downed / last chance / fallen overlay (docs/DESIGN.md §2.8, §5.2): a darkened screen edge, "Down!" with the
-- bleed-out bar and the revive progress a teammate is filling; in the last chance a big countdown; fallen heroes see
-- a small "spectating" line. The "Second Ember" button lives in ReviveOffer.luau right below this panel.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Tuning = require(Shared.Config.Tuning)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

local Downed = {}
local tr = Lang.tr

local gui: ScreenGui = nil :: any
local ui: { [string]: any } = {}
local state = "active"
local lastChance: number? = nil
local lastAt = 0
local solo = true

function Downed.init()
	gui = Kit.screen("EN_Downed", 4)
	gui.Enabled = false
	ui.shade = Kit.frame(gui, {
		BackgroundColor3 = Color3.fromRGB(30, 0, 10),
		BackgroundTransparency = 0.55,
		Size = UDim2.fromScale(1, 1),
		Visible = false,
	})
	local g = Instance.new("UIGradient")
	g.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0),
		NumberSequenceKeypoint.new(0.3, 0.85),
		NumberSequenceKeypoint.new(0.7, 0.85),
		NumberSequenceKeypoint.new(1, 0),
	})
	g.Parent = ui.shade
	ui.panel = Kit.panel(gui, {
		Size = UDim2.fromOffset(420, 128),
		Position = UDim2.fromScale(0.5, 0.36),
		AnchorPoint = Vector2.new(0.5, 0.5),
		BackgroundTransparency = 0.2,
		Visible = false,
	})
	ui.title = Kit.label(ui.panel, "", {
		Font = Theme.title,
		TextSize = 34,
		Size = UDim2.new(1, 0, 0, 40),
		Position = UDim2.fromOffset(0, 8),
		TextColor3 = Theme.bad,
		TextStrokeTransparency = 0.3,
	})
	ui.hint = Kit.label(ui.panel, "", {
		TextSize = 15,
		Size = UDim2.new(1, -24, 0, 20),
		Position = UDim2.fromOffset(12, 50),
		TextColor3 = Theme.dim,
	})
	local bleed, setBleed =
		Kit.bar(ui.panel, Theme.bad, { Size = UDim2.new(1, -40, 0, 12), Position = UDim2.fromOffset(20, 78) })
	ui.bleed = bleed
	ui.setBleed = setBleed
	local rev, setRev =
		Kit.bar(ui.panel, Theme.good, { Size = UDim2.new(1, -40, 0, 12), Position = UDim2.fromOffset(20, 100) })
	ui.rev = rev
	ui.setRev = setRev
	ui.fallen = Kit.label(gui, "", {
		Font = Theme.title,
		TextSize = 22,
		Size = UDim2.new(1, 0, 0, 30),
		Position = UDim2.new(0, 0, 1, -76),
		TextColor3 = Theme.dim,
		TextStrokeTransparency = 0.4,
		Visible = false,
	})
end

function Downed.setSolo(on: boolean)
	solo = on
end

local function show()
	local downed = state == "downed"
	local lc = lastChance ~= nil and state ~= "active"
	gui.Enabled = downed or lc or state == "fallen"
	ui.shade.Visible = downed or lc
	ui.panel.Visible = downed or lc
	ui.fallen.Visible = state == "fallen" and not lc
	ui.rev.Visible = downed and not solo
	ui.bleed.Visible = downed
end

-- own hero state (hero message)
function Downed.hero(m)
	state = m.state
	if state == "downed" then
		ui.title.Text = tr("Am Boden!")
		ui.hint.Text = if solo then "" else tr("Ein Mitspieler kann dich wiederbeleben.")
		ui.setBleed((m.bleed or 0) / Tuning.BLEED_OUT)
		ui.setRev(m.revive or 0)
	elseif state == "fallen" then
		ui.fallen.Text = tr("Gefallen – du schaust zu")
	end
	show()
end

-- run info: last chance seconds (nil when none)
function Downed.run(m)
	if m.state == "lastchance" and m.lastChance then
		lastChance = m.lastChance
		lastAt = os.clock()
	else
		lastChance = nil
	end
	show()
end

function Downed.hide()
	state = "active"
	lastChance = nil
	if gui then
		gui.Enabled = false
	end
end

function Downed.update()
	if lastChance and state ~= "active" then
		local left = math.max(0, lastChance - (os.clock() - lastAt))
		ui.title.Text = tr("Letzte Chance – {0} s", math.ceil(left))
		ui.hint.Text = tr("Die Glut erlischt …")
	end
end

return Downed
