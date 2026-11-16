-- Loads the JSON reference dumps written by tools/port-data.js (tests/ref/*.json).
local fs = require("@lune/fs")
local serde = require("@lune/serde")

local Ref = {}
local cache = {}

local function base(): string
	if fs.isDir("tests/ref") then
		return "tests/ref/"
	end
	return "ref/"
end

function Ref.load(name: string): any
	if not cache[name] then
		cache[name] = serde.decode("json", fs.readFile(base() .. name .. ".json"))
	end
	return cache[name]
end

return Ref
