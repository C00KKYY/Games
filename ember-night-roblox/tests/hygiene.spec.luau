-- Source hygiene (no Studio here, so the rules are checked as text): no deprecated globals (wait/spawn/delay, use
-- task.*), no Instance.new with a parent argument, no lowercase :connect, no Instance creation in the per-frame
-- render functions of the arena views, no direct MarketplaceService prompts on the client, every remote handler on
-- the server validates or rate-limits before it acts.
local T = require("./lib/T")
local fs = require("@lune/fs")

local suite = T.new("hygiene")
local ROOT = if fs.isDir("src") then "" else "../"

local function files(dir: string, out: { string }?): { string }
	out = out or {}
	for _, name in fs.readDir(dir) do
		local p = dir .. "/" .. name
		if fs.isDir(p) then
			files(p, out)
		elseif string.match(name, "%.luau$") then
			table.insert(out :: { string }, p)
		end
	end
	return out :: { string }
end

local function code(line: string): string
	-- strip comments and string contents (good enough for these checks)
	line = string.gsub(line, "%-%-.*$", "")
	line = string.gsub(line, '"[^"]*"', '""')
	return line
end

suite:test("no deprecated globals, no Instance.new parent argument, no :connect", function()
	local bad = {}
	for _, f in files(ROOT .. "src") do
		local n = 0
		for line in string.gmatch(fs.readFile(f) .. "\n", "([^\n]*)\n") do
			n += 1
			local c = code(line)
			for _, g in { "wait", "spawn", "delay" } do
				-- a bare call: not task.wait, not :Wait, not a field or method, not part of a longer name
				for pre in string.gmatch(" " .. c, "([%w_%.:]?)" .. g .. "%s*%(") do
					if pre == "" or pre == " " or pre == "(" or pre == "=" or pre == "," then
						table.insert(bad, f .. ":" .. n .. ": " .. g .. "()")
					end
				end
			end
			if string.find(c, "Instance%.new%([^%)]*,") then
				table.insert(bad, f .. ":" .. n .. ": Instance.new with parent")
			end
			if string.find(c, ":connect%(") then
				table.insert(bad, f .. ":" .. n .. ": :connect")
			end
		end
	end
	T.eq(#bad, 0, table.concat(bad, "\n"))
end)

suite:test("arena views create no Instances in their per-frame render/update functions", function()
	local bad = {}
	for _, name in { "EnemyView", "HeroView", "ShotView", "PickupView", "TeleView", "FxView", "DamageNumbers" } do
		local f = ROOT .. "src/client/World/" .. name .. ".luau"
		local src = fs.readFile(f)
		for _, fn in { "render", "update" } do
			local body = string.match(src, "\nfunction " .. name .. "%." .. fn .. "%(.-\nend\n")
			if body and string.find(body, "Instance%.new") then
				table.insert(bad, name .. "." .. fn)
			end
		end
	end
	T.eq(#bad, 0, "Instance.new in: " .. table.concat(bad, ", "))
end)

suite:test("the client never prompts purchases itself; server remotes validate and rate-limit", function()
	for _, f in files(ROOT .. "src/client") do
		local src = fs.readFile(f)
		T.ok(not string.find(src, "MarketplaceService"), f .. " uses MarketplaceService (prompts are opened by the server)")
	end
	local net = fs.readFile(ROOT .. "src/server/Services/Net.luau")
	for _, remote in { "move", "cmd", "query" } do
		local body = string.match(net, "local " .. remote .. " = .-\n\n")
		T.ok(body, "handler for " .. remote)
		T.ok(string.find(body, ":allow%("), remote .. " is rate-limited")
	end
	T.ok(string.find(net, "Validate%.command%(raw%)"), "commands go through Validate")
	T.ok(string.find(net, "Codec%.decodeMove%(b%)"), "moves are decoded and checked")
end)

return suite
