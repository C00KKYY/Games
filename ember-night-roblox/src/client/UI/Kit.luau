-- Small UI builders (docs/DESIGN.md §5.1): panels, labels, buttons, bars. Scale-based layout, UIScale from the
-- screen height (base 720 px), minimum touch target 44 px.
local Players = game:GetService("Players")
local Theme = require(script.Parent.Theme)

local Kit = {}

function Kit.screen(name: string, order: number?): ScreenGui
	local g = Instance.new("ScreenGui")
	g.Name = name
	g.ResetOnSpawn = false
	g.IgnoreGuiInset = false
	g.ScreenInsets = Enum.ScreenInsets.DeviceSafeInsets
	g.DisplayOrder = order or 0
	g.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	local scale = Instance.new("UIScale")
	scale.Parent = g
	local function fit()
		local cam = workspace.CurrentCamera
		local h = if cam then cam.ViewportSize.Y else 720
		scale.Scale = math.clamp(h / 720, 0.6, 1.6)
	end
	fit()
	if workspace.CurrentCamera then
		workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(fit)
	end
	g.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")
	return g
end

function Kit.frame(parent: Instance, props: { [string]: any }?): Frame
	local f = Instance.new("Frame")
	f.BackgroundColor3 = Theme.panel
	f.BorderSizePixel = 0
	for k, v in props or {} do
		(f :: any)[k] = v
	end
	f.Parent = parent
	return f
end

function Kit.panel(parent: Instance, props: { [string]: any }?): Frame
	local f = Kit.frame(parent, props)
	f.BackgroundTransparency = f.BackgroundTransparency ~= 0 and f.BackgroundTransparency or 0.1
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, 10)
	c.Parent = f
	local s = Instance.new("UIStroke")
	s.Color = Theme.stroke
	s.Thickness = 1.5
	s.Transparency = 0.3
	s.Parent = f
	return f
end

function Kit.label(parent: Instance, text: string, props: { [string]: any }?): TextLabel
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.Text = text
	t.TextColor3 = Theme.text
	t.Font = Theme.body
	t.TextSize = 18
	t.TextWrapped = true
	t.Size = UDim2.new(1, 0, 0, 24)
	for k, v in props or {} do
		(t :: any)[k] = v
	end
	t.Parent = parent
	return t
end

function Kit.button(parent: Instance, text: string, onClick: () -> (), props: { [string]: any }?): TextButton
	local b = Instance.new("TextButton")
	b.AutoButtonColor = true
	b.BackgroundColor3 = Theme.primary
	b.TextColor3 = Color3.new(1, 1, 1)
	b.Font = Theme.title
	b.TextSize = 20
	b.Text = text
	b.Size = UDim2.fromOffset(160, 44)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, 10)
	c.Parent = b
	for k, v in props or {} do
		(b :: any)[k] = v
	end
	b.Activated:Connect(onClick)
	b.Parent = parent
	return b
end

function Kit.list(parent: Instance, horizontal: boolean?, padding: number?): UIListLayout
	local l = Instance.new("UIListLayout")
	l.FillDirection = if horizontal then Enum.FillDirection.Horizontal else Enum.FillDirection.Vertical
	l.Padding = UDim.new(0, padding or 6)
	l.SortOrder = Enum.SortOrder.LayoutOrder
	l.HorizontalAlignment = Enum.HorizontalAlignment.Center
	l.Parent = parent
	return l
end

-- a bar: returns the background frame and a setter (0..1)
function Kit.bar(parent: Instance, color: Color3, props: { [string]: any }?): (Frame, (number) -> ())
	local bg = Kit.frame(parent, props)
	bg.BackgroundColor3 = Color3.fromRGB(20, 14, 28)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, 6)
	c.Parent = bg
	local fill = Kit.frame(bg, { BackgroundColor3 = color, Size = UDim2.fromScale(0, 1) })
	local c2 = Instance.new("UICorner")
	c2.CornerRadius = UDim.new(0, 6)
	c2.Parent = fill
	return bg, function(v: number)
		fill.Size = UDim2.fromScale(math.clamp(v, 0, 1), 1)
	end
end

function Kit.clear(f: Instance)
	for _, c in f:GetChildren() do
		if not c:IsA("UIListLayout") and not c:IsA("UICorner") and not c:IsA("UIStroke") and not c:IsA("UIPadding") and not c:IsA("UIGridLayout") then
			c:Destroy()
		end
	end
end

return Kit
