-- Lifetime statistics (docs/DESIGN.md §6.3): runs, wins, records, kills, gold, play time, evolutions, bosses.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

local Screen = { TITLE = Lang.key("Statistik") }
local tr = Lang.tr

local ROWS = {
	{ "runs", Lang.key("Läufe") },
	{ "coopRuns", Lang.key("Gemeinsame Läufe") },
	{ "wins", Lang.key("Siege") },
	{ "bestTime", Lang.key("Bestzeit"), "time" },
	{ "bestLevel", Lang.key("Höchste Stufe") },
	{ "bestKills", Lang.key("Meiste Besiegte in einem Lauf") },
	{ "kills", Lang.key("Besiegt") },
	{ "bossKills", Lang.key("Bosse") },
	{ "evolutions", Lang.key("Entwicklungen") },
	{ "chests", Lang.key("Truhen") },
	{ "revivesGiven", Lang.key("Gefährten aufgerichtet") },
	{ "goldEarned", Lang.key("Gold verdient") },
	{ "playTime", Lang.key("Spielzeit"), "hours" },
}

function Screen.render(body: ScrollingFrame, msg, _command, _open)
	local st = msg.profile.stats or {}
	local grid = Kit.grid(body, 360, 40, { LayoutOrder = 1 })
	for i, r in ROWS do
		local v = st[r[1]] or 0
		local text
		if r[3] == "time" then
			text = Lang.fmtTime(v)
		elseif r[3] == "hours" then
			text = Lang.fmtDec(math.floor(v / 360) / 10) .. " h"
		else
			text = Lang.fmtNum(v)
		end
		local cell = Kit.panel(grid, { LayoutOrder = i })
		Kit.padding(cell, 6)
		Kit.label(cell, tr(r[2]), { TextXAlignment = Enum.TextXAlignment.Left, Size = UDim2.fromScale(0.65, 1) })
		Kit.label(cell, text, {
			Font = Theme.number,
			TextColor3 = Theme.gold,
			TextXAlignment = Enum.TextXAlignment.Right,
			Size = UDim2.fromScale(0.35, 1),
			Position = UDim2.fromScale(0.65, 0),
		})
	end
	Kit.label(body, "★ " .. tostring(msg.profile.stars or 0) .. "   " .. tr("Wiederbelebungen übrig: {0}", msg.profile.reviveTokens or 0), {
		TextColor3 = Theme.dim,
		LayoutOrder = 2,
	})
end

return Screen
