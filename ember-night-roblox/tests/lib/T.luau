-- Minimal assertion library for Lune specs (docs/DESIGN.md §10).
local T = {}
T.__index = T

function T.new(name: string)
	return setmetatable({ name = name, cases = {} }, T)
end

function T:test(desc: string, fn: () -> ())
	table.insert(self.cases, { desc = desc, fn = fn })
end

local function fmt(v: any): string
	if type(v) == "string" then
		return string.format("%q", v)
	end
	return tostring(v)
end

function T.eq(actual: any, expected: any, msg: string?)
	if actual ~= expected then
		error(string.format("%sexpected %s, got %s", msg and (msg .. ": ") or "", fmt(expected), fmt(actual)), 2)
	end
end

function T.near(actual: number, expected: number, eps: number?, msg: string?)
	local e = eps or 1e-9
	if math.abs(actual - expected) > e then
		error(string.format("%sexpected %s ± %s, got %s", msg and (msg .. ": ") or "", fmt(expected), fmt(e), fmt(actual)), 2)
	end
end

function T.ok(cond: any, msg: string?)
	if not cond then
		error(msg or "expected truthy value", 2)
	end
end

-- Runs all cases, returns passed, failed
function T:run(): (number, number)
	local passed, failed = 0, 0
	for _, c in self.cases do
		local ok, err = pcall(c.fn)
		if ok then
			passed += 1
		else
			failed += 1
			print(string.format("  FAIL %s :: %s\n    %s", self.name, c.desc, tostring(err)))
		end
	end
	return passed, failed
end

return T
