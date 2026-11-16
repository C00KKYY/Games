-- Argument checks for client commands (docs/DESIGN.md §3.6: every argument is type- and range-checked on the
-- server). Pure. Returns a clean copy of the command or nil.
local Protocol = if script then require(script.Parent.Parent.Net.Protocol) else require("../Net/Protocol")
local Heroes = if script then require(script.Parent.Parent.Sim.Data.Heroes) else require("../Sim/Data/Heroes")
local Stages = if script then require(script.Parent.Parent.Sim.Data.Stages) else require("../Sim/Data/Stages")

local Validate = {}

local stageIds = {}
for _, s in Stages.list do
	stageIds[s.id] = true
end

local CHECK = {
	int1_4 = function(v)
		return type(v) == "number" and v == math.floor(v) and v >= 1 and v <= 4
	end,
	int0_5 = function(v)
		return type(v) == "number" and v == math.floor(v) and v >= 0 and v <= 5
	end,
	bool = function(v)
		return type(v) == "boolean"
	end,
	heroId = function(v)
		return type(v) == "string" and Heroes.byId[v] ~= nil
	end,
	stageId = function(v)
		return type(v) == "string" and stageIds[v] == true
	end,
	lang = function(v)
		return v == "de" or v == "en"
	end,
}

function Validate.command(cmd: any)
	if type(cmd) ~= "table" or type(cmd.op) ~= "string" then
		return nil
	end
	local spec = Protocol.COMMANDS[cmd.op]
	if not spec then
		return nil
	end
	local out = { op = cmd.op }
	for field, kind in spec do
		local v = cmd[field]
		if not CHECK[kind](v) then
			return nil
		end
		out[field] = v
	end
	return out
end

return Validate
