-- Argument checks for client commands (docs/DESIGN.md §3.6: every argument is type- and range-checked on the
-- server). Pure. Returns a clean copy of the command or nil.
local Protocol = if script then require(script.Parent.Parent.Net.Protocol) else require("../Net/Protocol")
local Heroes = if script then require(script.Parent.Parent.Sim.Data.Heroes) else require("../Sim/Data/Heroes")
local Stages = if script then require(script.Parent.Parent.Sim.Data.Stages) else require("../Sim/Data/Stages")
local Forge = if script then require(script.Parent.Parent.Sim.Data.Forge) else require("../Sim/Data/Forge")
local Products = if script then require(script.Parent.Parent.Config.Products) else require("../Config/Products")
local Cosmetics = if script then require(script.Parent.Parent.Config.Cosmetics) else require("../Config/Cosmetics")

local Validate = {}

local stageIds = {}
for _, s in Stages.list do
	stageIds[s.id] = true
end
local forgeIds = {}
for _, it in Forge.list do
	forgeIds[it.id] = true
end
local SETTING_KEYS = { sfx = true, music = true, dmgNums = true, shake = true, lowFx = true, camZoom = true }

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
	forgeId = function(v)
		return type(v) == "string" and forgeIds[v] == true
	end,
	cosSlot = function(v)
		return type(v) == "string" and table.find(Cosmetics.SLOTS, v) ~= nil
	end,
	cosIdOrEmpty = function(v)
		return v == "" or (type(v) == "string" and Cosmetics.byId[v] ~= nil)
	end,
	settingKey = function(v)
		return type(v) == "string" and SETTING_KEYS[v] == true
	end,
	settingValue = function(v)
		return type(v) == "boolean" or (type(v) == "number" and v == v and math.abs(v) < 100)
	end,
	productKey = function(v)
		return type(v) == "string" and #v <= 40 and Products.byKey[v] ~= nil
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
