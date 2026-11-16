-- Diagnostic runner: lune run tests/parity.luau [-- filter]  (prints every scenario's first difference)
local process = require("@lune/process")
local Parity = require("./lib/Parity")
local filter = process.args[1]
if filter == "--" then
	filter = process.args[2]
end
local ref = Parity.load()
local bad = 0
for _, sc in ref.scenarios do
	if not filter or string.find(sc.name, filter, 1, true) then
		local ok, err = pcall(Parity.check, sc, ref.dt, ref.rec)
		if not ok then
			print("ERROR " .. sc.name .. ": " .. tostring(err))
			bad += 1
		elseif err then
			print("DIFF  " .. err)
			bad += 1
		else
			print("ok    " .. sc.name)
		end
	end
end
print(bad .. " differing")
