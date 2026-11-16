-- Cosmetics (docs/DESIGN.md §7.1): hero skins, weapon colours and trails. Owned ones can be equipped (one per
-- slot); free ones show their achievement, paid ones a Robux button when configured. Visual only.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Cosmetics = require(Shared.Config.Cosmetics)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)
local Names = require(script.Parent.Names)

local Screen = { TITLE = Lang.key("Aussehen") }
local tr = Lang.tr

local SLOT_NAME = { skin = Lang.key("Heldenfarben"), fx = Lang.key("Waffenfarbe"), trail = Lang.key("Spur") }

local function swatch(parent: Instance, c)
	local hexes = if c.slot == "skin" then { c.body, c.accent } elseif c.slot == "fx" then c.colors else { c.color }
	local row = Kit.frame(parent, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 22) })
	Kit.list(row, true, 4).HorizontalAlignment = Enum.HorizontalAlignment.Left
	for _, hex in hexes do
		local r, g, b = Cosmetics.parseHex(hex)
		if r then
			local sw = Kit.frame(
				row,
				{ Size = UDim2.fromOffset(22, 22), BackgroundColor3 = Color3.new(r, g :: number, b :: number) }
			)
			local corner = Instance.new("UICorner")
			corner.CornerRadius = UDim.new(1, 0)
			corner.Parent = sw
		end
	end
	return row
end

function Screen.render(body: ScrollingFrame, msg, command: (any) -> (), _open)
	local view = msg.profile
	local owned = view.cosmetics or {}
	local equipped = view.equipped or {}
	local order = 0
	for _, slot in Cosmetics.SLOTS do
		order += 1
		Kit.label(
			body,
			tr(SLOT_NAME[slot]),
			{ Font = Theme.title, TextSize = 20, LayoutOrder = order, TextXAlignment = Enum.TextXAlignment.Left }
		)
		order += 1
		local grid = Kit.grid(body, 180, 128, { LayoutOrder = order })
		-- "none" card
		local none = Kit.panel(grid, { LayoutOrder = 0 })
		Kit.padding(none, 8)
		Kit.label(none, tr("Standard"), { Font = Theme.title })
		if equipped[slot] then
			Kit.button(none, tr("Anlegen"), function()
				command({ op = "equip", slot = slot, id = "" })
			end, { Size = UDim2.new(1, 0, 0, 40), Position = UDim2.new(0, 0, 1, -40) })
		else
			Kit.label(none, "✔ " .. tr("Angelegt"), { TextColor3 = Theme.good, Position = UDim2.new(0, 0, 1, -30) })
		end
		local i = 0
		for _, c in Cosmetics.list do
			if c.slot == slot then
				local kind, ref = string.match(c.source, "^(%a+):(.+)$")
				local isOwned = owned[c.id] == true
				-- paid ones that cannot be bought here (not configured) and are not owned are hidden
				local shopItem = if kind == "product" then Names.shopItem(view, ref) else nil
				if isOwned or kind == "achievement" or shopItem then
					i += 1
					local card = Kit.panel(grid, { LayoutOrder = i })
					Kit.padding(card, 8)
					Kit.list(card, false, 4)
					Kit.label(card, tr(c.name), { Font = Theme.title, TextSize = 17, LayoutOrder = 1 })
					swatch(card, c).LayoutOrder = 2
					if equipped[slot] == c.id then
						Kit.label(card, "✔ " .. tr("Angelegt"), { TextColor3 = Theme.good, LayoutOrder = 3 })
					elseif isOwned then
						Kit.button(card, tr("Anlegen"), function()
							command({ op = "equip", slot = slot, id = c.id })
						end, { Size = UDim2.new(1, 0, 0, 40), LayoutOrder = 3 })
					elseif kind == "achievement" then
						Kit.label(card, "🔒 " .. Names.achievementHint(ref), {
							TextSize = 12,
							TextColor3 = Theme.dim,
							LayoutOrder = 3,
							Size = UDim2.new(1, 0, 0, 40),
						})
					else
						Names.buyButton(card, view, ref, command, { Size = UDim2.new(1, 0, 0, 40), LayoutOrder = 3 })
					end
				end
			end
		end
	end
end

return Screen
