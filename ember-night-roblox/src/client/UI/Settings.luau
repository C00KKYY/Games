-- Settings (docs/DESIGN.md §5.2, web tpl_opts): language, sound, music, damage numbers, screen shake, camera
-- distance, reduced effects. Stored in the profile by the server.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

local Screen = { TITLE = Lang.key("Einstellungen") }
local tr = Lang.tr

local TOGGLES = {
	{ "sfx", Lang.key("Soundeffekte") },
	{ "music", Lang.key("Musik") },
	{ "dmgNums", Lang.key("Schadenszahlen") },
	{ "shake", Lang.key("Wackeln") },
	{ "lowFx", Lang.key("Weniger Effekte") },
}

function Screen.render(body: ScrollingFrame, msg, command: (any) -> (), open: (string) -> ())
	local s = msg.profile.settings or {}
	local lrow = Kit.frame(body, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 48), LayoutOrder = 1 })
	Kit.list(lrow, true, 8)
	Kit.label(lrow, tr("Sprache"), { Size = UDim2.fromOffset(220, 44), TextXAlignment = Enum.TextXAlignment.Left })
	for _, l in { "de", "en" } do
		local b = Kit.button(lrow, if l == "de" then "Deutsch" else "English", function()
			Lang.setLang(l)
			command({ op = "lang", lang = l })
			open("settings")
		end, { Size = UDim2.fromOffset(130, 44) })
		b.BackgroundColor3 = if Lang.get() == l then Theme.primary else Theme.panel2
	end
	for i, t in TOGGLES do
		local key = t[1]
		local on = s[key] == true
		local row = Kit.frame(body, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 48), LayoutOrder = 1 + i })
		Kit.list(row, true, 8)
		Kit.label(row, tr(t[2]), { Size = UDim2.fromOffset(220, 44), TextXAlignment = Enum.TextXAlignment.Left })
		local b = Kit.button(row, if on then tr("An") else tr("Aus"), function()
			command({ op = "setting", key = key, value = not on })
		end, { Size = UDim2.fromOffset(130, 44) })
		b.BackgroundColor3 = if on then Theme.primary else Theme.panel2
	end
	local zrow = Kit.frame(body, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 48), LayoutOrder = 20 })
	Kit.list(zrow, true, 8)
	local z = s.camZoom or 1
	Kit.label(zrow, tr("Kameraabstand"), { Size = UDim2.fromOffset(220, 44), TextXAlignment = Enum.TextXAlignment.Left })
	Kit.button(zrow, "−", function()
		command({ op = "setting", key = "camZoom", value = z - 0.15 })
	end, { Size = UDim2.fromOffset(60, 44) })
	Kit.label(zrow, math.floor(z * 100 + 0.5) .. " %", { Size = UDim2.fromOffset(80, 44) })
	Kit.button(zrow, "+", function()
		command({ op = "setting", key = "camZoom", value = z + 0.15 })
	end, { Size = UDim2.fromOffset(60, 44) })
end

return Screen
