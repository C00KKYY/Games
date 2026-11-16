-- Hero selection (docs/DESIGN.md §5.2, web tpl_chars): 9 heroes, earned by achievement or unlocked with a game
-- pass; locked heroes show their achievement and, if the pass is configured, a Robux button.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Heroes = require(Shared.Sim.Data.Heroes)
local Weapons = require(Shared.Sim.Data.Weapons)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)
local Names = require(script.Parent.Names)

local Screen = { TITLE = Lang.key("Helden") }
local tr = Lang.tr

function Screen.render(body: ScrollingFrame, msg, command: (any) -> (), _open)
	local view = msg.profile
	local mine = nil
	for _, m in msg.members do
		if m.userId == msg.you then
			mine = m.hero
		end
	end
	local grid = Kit.grid(body, 180, 214, { LayoutOrder = 1 })
	for i, id in Heroes.ORDER do
		local h = Heroes.byId[id]
		local unlocked = table.find(msg.heroes, id) ~= nil
		local card = Kit.panel(grid, { LayoutOrder = i, BackgroundColor3 = if mine == id then Theme.panel2 else Theme.panel })
		Kit.padding(card, 8)
		Kit.list(card, false, 2)
		Kit.label(card, tr(h.name), { Font = Theme.title, TextSize = 22, TextColor3 = Names.heroColor(id), LayoutOrder = 1 })
		Kit.label(card, tr(h.title), { TextSize = 14, TextColor3 = Theme.dim, LayoutOrder = 2, Size = UDim2.new(1, 0, 0, 18) })
		Kit.label(card, tr(h.text), { TextSize = 14, LayoutOrder = 3, Size = UDim2.new(1, 0, 0, 36) })
		local w = Weapons.byId[h.weapon]
		Kit.label(card, "⚔ " .. (if w then tr(w.name) else h.weapon), { TextSize = 14, LayoutOrder = 4, Size = UDim2.new(1, 0, 0, 18) })
		if mine == id then
			Kit.label(card, "✔ " .. tr("Gewählt"), { TextColor3 = Theme.good, Font = Theme.title, LayoutOrder = 5 })
		elseif unlocked then
			Kit.button(card, tr("Wählen"), function()
				command({ op = "selectHero", hero = id })
			end, { Size = UDim2.new(1, 0, 0, 40), LayoutOrder = 5 })
		else
			Kit.label(card, "🔒 " .. Names.achievementHint(h.unlock or ""), {
				TextSize = 13,
				TextColor3 = Theme.dim,
				LayoutOrder = 5,
				Size = UDim2.new(1, 0, 0, 44),
			})
			Names.buyButton(card, view, "pass_hero_" .. id, command, { Size = UDim2.new(1, 0, 0, 36), LayoutOrder = 6 })
		end
	end
	local all = Names.shopItem(view, "pass_heroes_all")
	if all and not all.owned and #msg.heroes < #Heroes.ORDER then
		local row = Kit.frame(body, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 48), LayoutOrder = 2 })
		Kit.list(row, true, 10)
		Kit.label(row, Names.product("pass_heroes_all") .. " – " .. Names.productDesc("pass_heroes_all"), {
			Size = UDim2.fromOffset(460, 44),
			TextXAlignment = Enum.TextXAlignment.Left,
		})
		Names.buyButton(row, view, "pass_heroes_all", command, { Size = UDim2.fromOffset(120, 44) })
	end
end

return Screen
