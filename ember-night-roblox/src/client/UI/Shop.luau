-- Robux shop (docs/DESIGN.md §7.1): tabs Gold, Heroes, Cosmetics, Passes. Only configured items with a live price
-- (from the server) are listed; owned passes and cosmetics show "owned". Prompts are opened by the server.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)
local Names = require(script.Parent.Names)

local Screen = { TITLE = Lang.key("Shop") }
local tr = Lang.tr

local TABS = { { "gold", Lang.key("Gold") }, { "heroes", Lang.key("Helden") }, { "cosmetics", Lang.key("Aussehen") }, { "passes", Lang.key("Pässe") } }
local tab = "gold"

function Screen.render(body: ScrollingFrame, msg, command: (any) -> (), open: (string) -> ())
	local view = msg.profile
	local trow = Kit.frame(body, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 48), LayoutOrder = 0 })
	Kit.list(trow, true, 8)
	for _, t in TABS do
		local b = Kit.button(trow, tr(t[2]), function()
			tab = t[1]
			open("shop")
		end, { Size = UDim2.fromOffset(150, 44) })
		b.BackgroundColor3 = if tab == t[1] then Theme.primary else Theme.panel2
	end
	local items = {}
	for _, it in view.shop.items do
		if it.tab == tab then
			table.insert(items, it)
		end
	end
	table.sort(items, function(a, b)
		return a.order < b.order
	end)
	if #items == 0 then
		Kit.label(body, tr("Hier gibt es gerade nichts zu kaufen."), { TextColor3 = Theme.dim, LayoutOrder = 1 })
	end
	for i, it in items do
		local row = Kit.panel(body, { Size = UDim2.new(1, -10, 0, 62), LayoutOrder = i })
		Kit.padding(row, 8)
		Kit.label(row, Names.product(it.key), {
			Font = Theme.title,
			TextSize = 18,
			TextXAlignment = Enum.TextXAlignment.Left,
			Size = UDim2.new(1, -150, 0, 22),
		})
		Kit.label(row, Names.productDesc(it.key), {
			TextSize = 13,
			TextColor3 = Theme.dim,
			TextXAlignment = Enum.TextXAlignment.Left,
			Position = UDim2.fromOffset(0, 24),
			Size = UDim2.new(1, -150, 0, 20),
		})
		if it.owned then
			Kit.label(row, "✔ " .. tr("Besessen"), {
				TextColor3 = Theme.good,
				Font = Theme.title,
				Size = UDim2.fromOffset(130, 44),
				Position = UDim2.new(1, -130, 0, 0),
			})
		else
			Names.buyButton(row, view, it.key, command, { Size = UDim2.fromOffset(130, 44), Position = UDim2.new(1, -130, 0, 0) })
		end
	end
	if tab == "gold" then
		Kit.label(body, tr("Gold gibt es auch in jedem Lauf. Alles in der Schmiede ist ohne Robux erreichbar."), {
			TextSize = 13,
			TextColor3 = Theme.dim,
			LayoutOrder = 99,
			Size = UDim2.new(1, -10, 0, 30),
		})
	end
end

return Screen
