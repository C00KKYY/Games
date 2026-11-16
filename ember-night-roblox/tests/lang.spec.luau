-- Every tr("...") key used in src/ has an English entry; placeholders match.
local T = require("./lib/T")
local fs = require("@lune/fs")
local EnBase = require("../src/shared/Lang/En")
local EnRoblox = require("../src/shared/Lang/EnRoblox")
local En = table.clone(EnBase)
for k, v in EnRoblox do
	En[k] = v
end
local Lang = require("../src/shared/Lang/Lang")
local Stages = require("../src/shared/Sim/Data/Stages")

local suite = T.new("lang")

local function root()
	return if fs.isDir("src") then "src" else "../src"
end

local function scan(dir, out)
	for _, name in fs.readDir(dir) do
		local p = dir .. "/" .. name
		if fs.isDir(p) then
			scan(p, out)
		elseif string.match(name, "%.luau$") and name ~= "En.luau" and name ~= "World.luau" then
			local src = fs.readFile(p)
			for key in string.gmatch(src, 'tr%(%s*"([^"]+)"') do
				out[key] = p
			end
			-- banner/text keys emitted by the sim: K.banner(run, "...") and K.text(run, x, y, "...")
			for key in string.gmatch(src, 'K%.banner%(run,%s*"([^"]+)"') do
				out[key] = p
			end
			for key in string.gmatch(src, 'K%.text%(%s*run,[^"]-"([^"]+)"') do
				out[key] = p
			end
		end
	end
	return out
end

local function placeholders(s)
	local t = {}
	for d in string.gmatch(s, "{(%d)}") do
		t[d] = true
	end
	local out = {}
	for d in t do
		table.insert(out, d)
	end
	table.sort(out)
	return table.concat(out, ",")
end

suite:test("all used keys translated", function()
	local keys = scan(root(), {})
	local missing = {}
	for k, file in keys do
		if string.find(k, "%a") and not En[k] and not string.match(k, "^%+") then
			table.insert(missing, k .. " (" .. file .. ")")
		end
	end
	table.sort(missing)
	T.eq(#missing, 0, "missing: " .. table.concat(missing, "; "))
end)

suite:test("content names translated", function()
	for _, s in Stages.list do
		T.ok(En[s.name], s.name)
		T.ok(En[s.intro], "intro " .. s.id)
		for _, b in s.bosses do
			T.ok(En[b.name], b.name)
		end
		for _, e in s.events do
			T.ok(En[e.text], e.text)
		end
	end
end)

suite:test("placeholders match", function()
	for k, v in En do
		T.eq(placeholders(v), placeholders(k), k)
	end
end)

suite:test("tr, fmtNum, fmtTime", function()
	Lang.setLang("en")
	T.eq(Lang.tr("{0} erscheint!", "X"), "X appears!")
	Lang.setLang("de")
	T.eq(Lang.tr("{0} erscheint!", "X"), "X erscheint!")
	T.eq(Lang.fmtNum(1234), "1.234")
	T.eq(Lang.fmtNum(12345), "12,3k")
	Lang.setLang("en")
	T.eq(Lang.fmtNum(1234), "1,234")
	T.eq(Lang.fmtNum(2500000), "2.5M")
	T.eq(Lang.fmtTime(125), "2:05")
	T.eq(Lang.fromLocale("de-DE"), "de")
	T.eq(Lang.fromLocale("en-us"), "en")
end)

return suite
