-- Off-screen arrows (docs/DESIGN.md §5.2): at the screen edge, pointing at things outside the view – enemy shots
-- that will reach the own hero within 1.2 s (red "!"), downed teammates (green ✚, with the bleed-out danger), the
-- boss (red crown) and the own chests (gold). A fixed pool of 12 arrows; the closest/most urgent win.
local Kit = require(script.Parent.Kit)
local CameraRig = require(script.Parent.Parent.World.CameraRig)
local Coords = require(script.Parent.Parent.World.Coords)

local Arrows = {}

type Arrow = { frame: Frame, head: TextLabel, icon: TextLabel }
type Target = { x: number, y: number, kind: string, prio: number }

local gui: ScreenGui = nil :: any
local pool: { Arrow } = {}
local MAX = 12
local MARGIN = 34
local LOOK = {
	shot = { "!", Color3.fromHex("#ff3d5a") },
	downed = { "✚", Color3.fromHex("#5dff8f") },
	boss = { "👑", Color3.fromHex("#ff5a6e") },
	chest = { "🎁", Color3.fromHex("#ffd23f") },
}
local targets: { Target } = {}

function Arrows.init()
	gui = Kit.screen("EN_Arrows", 3)
	gui.IgnoreGuiInset = true
	gui.ScreenInsets = Enum.ScreenInsets.None
	-- arrows work in viewport pixels: no UI scale
	local sc = gui:FindFirstChildOfClass("UIScale")
	if sc then
		sc:Destroy()
	end
	gui.Enabled = false
	for i = 1, MAX do
		local f = Kit.frame(gui, {
			BackgroundTransparency = 1,
			Size = UDim2.fromOffset(44, 44),
			AnchorPoint = Vector2.new(0.5, 0.5),
			Visible = false,
			Name = "Arrow" .. i,
		})
		local head = Kit.label(f, "▲", {
			Size = UDim2.fromScale(1, 1),
			TextSize = 26,
			Font = Enum.Font.GothamBold,
			TextStrokeTransparency = 0.2,
		})
		local icon = Kit.label(f, "", {
			Size = UDim2.fromOffset(26, 26),
			Position = UDim2.fromScale(0.5, 0.5),
			AnchorPoint = Vector2.new(0.5, 0.5),
			TextSize = 18,
			Font = Enum.Font.GothamBold,
			TextStrokeTransparency = 0.3,
		})
		table.insert(pool, { frame = f, head = head, icon = icon })
	end
end

function Arrows.setVisible(on: boolean)
	gui.Enabled = on
	if not on then
		for _, a in pool do
			a.frame.Visible = false
		end
	end
end

-- collect targets for this frame
function Arrows.begin()
	table.clear(targets)
end

function Arrows.add(kind: string, x: number, y: number, prio: number)
	table.insert(targets, { x = x, y = y, kind = kind, prio = prio })
end

-- an enemy shot at (x, y) moving (vx, vy) px/s: an arrow if it reaches the hero (hx, hy) within 1.2 s
function Arrows.shot(x: number, y: number, vx: number, vy: number, hx: number, hy: number)
	local dx, dy = hx - x, hy - y
	local v2 = vx * vx + vy * vy
	if v2 < 1 then
		return
	end
	local t = (dx * vx + dy * vy) / v2 -- time of closest approach
	if t < 0 or t > 1.2 then
		return
	end
	local cx, cy = x + vx * t - hx, y + vy * t - hy
	if cx * cx + cy * cy > 60 * 60 then
		return
	end
	Arrows.add("shot", x, y, 100 - t * 50)
end

-- place the arrows for the targets that are off screen
function Arrows.render(now: number)
	if not gui.Enabled then
		return
	end
	local vp = workspace.CurrentCamera.ViewportSize
	local cxs, cys = vp.X / 2, vp.Y / 2
	table.sort(targets, function(a, b)
		return a.prio > b.prio
	end)
	local used = 0
	for _, tg in targets do
		if used >= MAX then
			break
		end
		local sx, sy, inside, behind = CameraRig.project(Coords.v3(tg.x, tg.y, 1))
		if inside then
			continue
		end
		if behind then
			sx, sy = cxs + (cxs - sx), cys + (cys - sy)
		end
		-- clamp along the ray from the screen centre to the edge (minus the margin)
		local dx, dy = sx - cxs, sy - cys
		local kx = if dx ~= 0 then (cxs - MARGIN) / math.abs(dx) else math.huge
		local ky = if dy ~= 0 then (cys - MARGIN) / math.abs(dy) else math.huge
		local k = math.min(kx, ky, 1)
		local px, py = cxs + dx * k, cys + dy * k
		used += 1
		local a = pool[used]
		local look = LOOK[tg.kind] or LOOK.shot
		a.frame.Visible = true
		a.frame.Position = UDim2.fromOffset(px, py)
		a.head.Rotation = math.deg(math.atan2(dy, dx)) + 90
		a.head.TextColor3 = look[2]
		a.icon.Text = look[1]
		a.icon.TextColor3 = look[2]
		-- incoming shots blink
		a.head.TextTransparency = if tg.kind == "shot" then 0.1 + 0.3 * (math.floor(now * 10) % 2) else 0.1
	end
	for i = used + 1, MAX do
		pool[i].frame.Visible = false
	end
end

return Arrows
