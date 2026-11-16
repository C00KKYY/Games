-- Translation and number formatting (web lang.js tr/setLang/fmtDec, util.js fmtNum/fmtTime). German is the source
-- language: German strings are the keys, En.luau maps them to English.
local En = if script then require(script.Parent.En) else require("./En")

local Lang = {}

local current = "en"
Lang.misses = {} -- keys without English text (for tests)

function Lang.setLang(l: string?)
	current = if l == "de" then "de" else "en"
end

function Lang.get(): string
	return current
end

-- "de-DE" / "de" -> "de", everything else -> "en"
function Lang.fromLocale(locale: string?): string
	if type(locale) == "string" and string.lower(string.sub(locale, 1, 2)) == "de" then
		return "de"
	end
	return "en"
end

function Lang.tr(key: string, ...: any): string
	local s = key
	if current == "en" then
		local v = En[key]
		if v == nil then
			Lang.misses[key] = true
		else
			s = v
		end
	end
	local n = select("#", ...)
	if n > 0 then
		local args = { ... }
		s = string.gsub(s, "{(%d)}", function(i)
			local v = args[tonumber(i) + 1]
			return if v == nil then "" else tostring(v)
		end)
	end
	return s
end

function Lang.fmtDec(v: number): string
	local s = tostring(v)
	return if current == "de" then (string.gsub(s, "%.", ",")) else s
end

local function group(n: number, sep: string): string
	local s = tostring(math.floor(n))
	local out = string.reverse((string.gsub(string.reverse(s), "(%d%d%d)", "%1" .. string.reverse(sep))))
	if string.sub(out, 1, #sep) == sep then
		out = string.sub(out, #sep + 1)
	end
	return out
end

function Lang.fmtNum(n: number): string
	n = math.floor(n)
	local de = current == "de"
	local function dec(x: string)
		return if de then (string.gsub(x, "%.", ",")) else x
	end
	if n >= 1e6 then
		return dec(string.format("%.1f", n / 1e6)) .. (if de then " Mio." else "M")
	end
	if n >= 1e4 then
		return dec(string.format("%.1f", n / 1e3)) .. "k"
	end
	return group(n, if de then "." else ",")
end

function Lang.fmtTime(s: number): string
	s = math.max(0, math.floor(s))
	local m, r = math.floor(s / 60), s % 60
	return m .. ":" .. (if r < 10 then "0" else "") .. r
end

return Lang
