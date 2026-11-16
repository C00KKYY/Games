-- Runs every tests/*.spec.luau with Lune: `lune run tests/run.luau` (from the project root or tests/).
-- A spec returns a T suite (tests/lib/T.luau). Optional filter: `lune run tests/run.luau name`.
local fs = require("@lune/fs")
local process = require("@lune/process")

local filter = process.args[1]
if filter == "--" then
	filter = process.args[2]
end
local here = "tests"
if not fs.isDir(here) then
	here = "."
end

local files = {}
for _, name in fs.readDir(here) do
	if string.match(name, "%.spec%.luau$") and (not filter or string.find(name, filter, 1, true)) then
		table.insert(files, name)
	end
end
table.sort(files)

local total, failed = 0, 0
for _, name in files do
	local suite = require("./" .. string.gsub(name, "%.luau$", ""))
	local p, f = suite:run()
	total += p + f
	failed += f
	print(string.format("%-32s %d passed, %d failed", name, p, f))
end

print(string.format("== %d specs, %d cases, %d failed", #files, total, failed))
if failed > 0 or #files == 0 then
	process.exit(1)
end
