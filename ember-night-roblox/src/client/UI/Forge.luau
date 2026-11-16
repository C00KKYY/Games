-- Forge (docs/DESIGN.md §5.2, web tpl_shop): 17 permanent upgrades with level pips and price; refund everything
-- with a confirmation. Prices come from Sim/Profile.luau (same formula as the server, which decides).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Forge = require(Shared.Sim.Data.Forge)
local Profile = require(Shared.Sim.Profile)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

local Screen = { TITLE = Lang.key("Schmiede") }
local tr = Lang.tr
local confirmRefund = false

function Screen.render(body: ScrollingFrame, msg, command: (any) -> (), open: (string) -> ())
	local view = msg.profile
	local p = { shop = view.forge or {} }
	Kit.label(body, tr("Dauerhafte Verbesserungen für alle Helden. Jeder Kauf macht alle weiteren Käufe etwas teurer."), {
		TextSize = 14,
		TextColor3 = Theme.dim,
		Size = UDim2.new(1, -10, 0, 36),
		LayoutOrder = 0,
	})
	Kit.label(body, "● " .. Lang.fmtNum(view.gold) .. " " .. tr("Gold"), {
		Font = Theme.title,
		TextSize = 22,
		TextColor3 = Theme.gold,
		LayoutOrder = 1,
	})
	local grid = Kit.grid(body, 240, 112, { LayoutOrder = 2 })
	for i, it in Forge.list do
		local lvl = p.shop[it.id] or 0
		local card = Kit.panel(grid, { LayoutOrder = i })
		Kit.padding(card, 8)
		Kit.label(card, tr(it.name), { Font = Theme.title, TextSize = 18, TextXAlignment = Enum.TextXAlignment.Left })
		Kit.label(card, tr(it.text), {
			TextSize = 13,
			TextColor3 = Theme.dim,
			Position = UDim2.fromOffset(0, 24),
			Size = UDim2.new(1, 0, 0, 18),
			TextXAlignment = Enum.TextXAlignment.Left,
		})
		Kit.label(card, string.rep("■", lvl) .. string.rep("□", it.max - lvl), {
			TextColor3 = Theme.primary,
			Position = UDim2.fromOffset(0, 46),
			TextXAlignment = Enum.TextXAlignment.Left,
		})
		if lvl >= it.max then
			Kit.label(card, tr("MAX"), {
				Font = Theme.title,
				TextColor3 = Theme.good,
				Size = UDim2.fromOffset(100, 30),
				Position = UDim2.new(1, -100, 1, -30),
			})
		else
			local price = Profile.forgePrice(p, it)
			local b = Kit.button(card, "● " .. Lang.fmtNum(price), function()
				command({ op = "forgeBuy", id = it.id })
			end, { Size = UDim2.fromOffset(110, 36), Position = UDim2.new(1, -110, 1, -36), TextSize = 16 })
			if view.gold < price then
				b.BackgroundColor3 = Theme.panel2
				b.TextColor3 = Theme.dim
			end
		end
	end
	if (view.forgeRefund or 0) > 0 then
		local row = Kit.frame(body, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 50), LayoutOrder = 3 })
		Kit.list(row, true, 10)
		if confirmRefund then
			Kit.label(row, tr("Wirklich alles zurückerstatten?") .. "  (+" .. Lang.fmtNum(view.forgeRefund) .. ")", {
				Size = UDim2.fromOffset(360, 44),
			})
			Kit.button(row, tr("Ja"), function()
				confirmRefund = false
				command({ op = "forgeRefund" })
			end, { BackgroundColor3 = Theme.bad, Size = UDim2.fromOffset(90, 44) })
			Kit.button(row, tr("Nein"), function()
				confirmRefund = false
				open("forge")
			end, { BackgroundColor3 = Theme.panel2, Size = UDim2.fromOffset(90, 44) })
		else
			Kit.button(row, tr("Alles zurückerstatten"), function()
				confirmRefund = true
				open("forge")
			end, { BackgroundColor3 = Theme.panel2, Size = UDim2.fromOffset(240, 44) })
		end
	end
end

return Screen
