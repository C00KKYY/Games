local process = require("@lune/process")
local Parity = require("./lib/Parity")
local ref = Parity.load()
local a = string.split(process.args[1], ":")
local name = table.concat(a, ":", 1, #a - 2)
Parity.full = process.env.FULL ~= nil
Parity.dump = { name, tonumber(a[#a - 1]), tonumber(a[#a]) }
for _, sc in ref.scenarios do
	if sc.name == name then
		if sc.kind == "run" then
			Parity.checkRun(sc, ref.dt, ref.rec, 1e9)
		else
			Parity.check(sc, ref.dt, ref.rec, 1e9)
		end
	end
end
