-- Ported data tables equal the web tables (tests/ref/data.json written from js/data.js by tools/port-data.js).
local T = require("./lib/T")
local Ref = require("./lib/Ref")
local Weapons = require("../src/shared/Sim/Data/Weapons")
local Passives = require("../src/shared/Sim/Data/Passives")
local Enemies = require("../src/shared/Sim/Data/Enemies")
local Heroes = require("../src/shared/Sim/Data/Heroes")
local Forge = require("../src/shared/Sim/Data/Forge")
local Heat = require("../src/shared/Sim/Data/Heat")
local Stages = require("../src/shared/Sim/Data/Stages")
local Achievements = require("../src/shared/Sim/Data/Achievements")
local En = require("../src/shared/Lang/En")

local suite = T.new("data")
local ref = Ref.load("data")

-- deep compare a Luau value with a JSON value; pools/mixes in Luau are arrays of {k, w}
local function same(a: any, b: any, path: string)
	if type(b) == "table" then
		T.ok(type(a) == "table", path .. ": expected table")
		local isPool = false
		if #a > 0 and type(a[1]) == "table" and a[1].k ~= nil and a[1].w ~= nil and b[1] == nil then
			isPool = true
		end
		if isPool then
			local n = 0
			for _ in b do
				n += 1
			end
			T.eq(#a, n, path .. " pool size")
			for _, e in a do
				T.eq(e.w, b[e.k], path .. "." .. e.k)
			end
			return
		end
		for k, v in b do
			same(a[k], v, path .. "." .. tostring(k))
		end
	else
		T.eq(a, b, path)
	end
end

suite:test("counts", function()
	T.eq(#Stages.list, 5, "lands")
	T.eq(#Weapons.ORDER, 9, "weapons")
	T.eq(#Passives.ORDER, 12, "passives")
	T.eq(#Enemies.ORDER, 13, "enemy types + night")
	T.eq(#Heroes.ORDER, 9, "heroes")
	T.eq(#Forge.list, 17, "forge")
	T.eq(#Achievements.list, 31, "achievements")
	T.eq(#Heat.list, 6, "heat levels")
	local bosses = 0
	for _, s in Stages.list do
		bosses += #s.bosses
	end
	T.eq(bosses, 16, "bosses")
	local n = 0
	for _ in En do
		n += 1
	end
	T.eq(n, ref.langCount, "translations")
end)

suite:test("tables equal web data field by field", function()
	same(Weapons.byId, ref.weapons, "weapons")
	same(Passives.byId, ref.passives, "passives")
	same(Enemies.byId, ref.enemies, "enemies")
	same(Heroes.byId, ref.heroes, "heroes")
	same(Forge.list, ref.shop, "shop")
	same(Heat.list, ref.heat, "heat")
	same(Stages.list, ref.stages, "stages")
	same(Achievements.list, ref.achievements, "achievements")
	same(Enemies.COLORS, ref.enemyColors, "colors")
	for i, id in ref.weaponOrder do
		T.eq(Weapons.ORDER[i], id)
	end
end)

suite:test("pool order preserved", function()
	local w = Stages.list[1].waves[1].pool
	T.eq(w[1].k, "bat")
	T.eq(w[2].k, "slime")
	T.eq(w[3].k, "spitter")
end)

return suite
