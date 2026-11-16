-- Hub screens (docs/DESIGN.md §5.1, §5.2): one window at a time (heroes, world map, forge, achievements, stats,
-- shop, wardrobe, settings), the hub button bar, toasts and the "not saved" label. Every screen renders from the
-- last lobby message (party, lands, and the profile view built by Server/Services/Meta.luau).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

local Router = {}
local tr = Lang.tr

local SCREENS = {
	heroes = require(script.Parent.Heroes),
	map = require(script.Parent.WorldMap),
	forge = require(script.Parent.Forge),
	achievements = require(script.Parent.Achievements),
	stats = require(script.Parent.Stats),
	shop = require(script.Parent.Shop),
	wardrobe = require(script.Parent.Wardrobe),
	settings = require(script.Parent.Settings),
}
local BAR = {
	{ "heroes", Lang.key("Helden") },
	{ "map", Lang.key("Weltkarte") },
	{ "forge", Lang.key("Schmiede") },
	{ "wardrobe", Lang.key("Aussehen") },
	{ "achievements", Lang.key("Erfolge") },
	{ "stats", Lang.key("Statistik") },
	{ "shop", Lang.key("Shop") },
	{ "settings", Lang.key("Einstellungen") },
}

local gui: ScreenGui = nil :: any
local barGui: ScreenGui = nil :: any
local barRoot: Frame = nil :: any
local current: string? = nil
local window: Frame? = nil
local scrollPos = Vector2.zero
local last: any = nil
local command: (any) -> () = function(_) end
local enabled = true
local toastFrame: Frame = nil :: any

local function renderBar()
	Kit.clear(barRoot)
	local row = Kit.frame(barRoot, {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, -20, 0, 50),
		Position = UDim2.new(0.5, 0, 1, -8),
		AnchorPoint = Vector2.new(0.5, 1),
	})
	Kit.list(row, true, 6)
	for i, b in BAR do
		local name, label = b[1], b[2]
		local btn = Kit.button(row, tr(label), function()
			if current == name then
				Router.close()
			else
				Router.open(name)
			end
		end, { Size = UDim2.fromOffset(108, 44), TextSize = 16, LayoutOrder = i })
		btn.BackgroundColor3 = if current == name then Theme.primary else Theme.panel2
	end
	Kit.label(barRoot, tr("Nicht gespeichert (Studio ohne API-Zugriff)"), {
		TextColor3 = Color3.fromRGB(255, 225, 90),
		TextSize = 14,
		Size = UDim2.fromOffset(420, 20),
		Position = UDim2.new(1, -430, 0, 6),
		TextXAlignment = Enum.TextXAlignment.Right,
		Visible = last ~= nil and last.profile ~= nil and last.profile.memoryOnly == true,
	})
end

local function render()
	if window then
		local body = window:FindFirstChildWhichIsA("ScrollingFrame")
		if body then
			scrollPos = body.CanvasPosition
		end
		window:Destroy()
		window = nil
	end
	renderBar()
	if not current or not last or not last.profile then
		return
	end
	local screen = SCREENS[current]
	local w, body = Kit.window(gui, tr(screen.TITLE), Router.close)
	window = w
	Kit.list(body, false, 8)
	Kit.padding(body, 4)
	screen.render(body, last, command, Router.open)
	task.defer(function()
		if body.Parent then
			body.CanvasPosition = scrollPos
		end
	end)
end

function Router.init(cmd: (any) -> ())
	command = cmd
	gui = Kit.screen("EN_Hub", 3)
	barGui = Kit.screen("EN_HubBar", 2)
	barRoot = Kit.frame(barGui, { BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1) })
	toastFrame = Kit.frame(Kit.screen("EN_Toasts", 9), {
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(420, 300),
		Position = UDim2.new(0.5, 0, 0, 70),
		AnchorPoint = Vector2.new(0.5, 0),
	})
	Kit.list(toastFrame, false, 6)
	renderBar()
end

function Router.open(name: string)
	if SCREENS[name] then
		if current ~= name then
			scrollPos = Vector2.zero
		end
		current = name
		render()
	end
end

function Router.close()
	current = nil
	render()
end

function Router.isOpen(): boolean
	return current ~= nil
end

-- new lobby message: re-render the open screen with the new data
function Router.update(msg)
	last = msg
	if enabled then
		render()
	end
end

-- hub visible (outside runs) or hidden
function Router.setEnabled(on: boolean)
	enabled = on
	gui.Enabled = on
	barGui.Enabled = on
	if not on then
		current = nil
	end
	render()
end

function Router.rerender()
	render()
end

-- a short message at the top of the screen (purchases, unlocks)
function Router.toast(text: string)
	local l = Kit.label(toastFrame, text, {
		Font = Theme.title,
		TextSize = 20,
		TextColor3 = Theme.gold,
		BackgroundTransparency = 0.15,
		BackgroundColor3 = Theme.panel,
		Size = UDim2.fromOffset(420, 36),
	})
	task.delay(3.5, function()
		l:Destroy()
	end)
end

return Router
