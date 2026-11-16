-- Roblox API names used in the source, checked offline against Lune's bundled Roblox reflection database (no Studio
-- here; selene's pinned std only knows global names): every Enum.X.Y item, Instance.new class, GetService name,
-- IsA / FindFirstChildOfClass class, the properties set on variables created with Instance.new, and that every
-- source file compiles (optimization level 2).
local T = require("./lib/T")
local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
local luau = require("@lune/luau")

local suite = T.new("api")
local ROOT = if fs.isDir("src") then "" else "../"
local db = roblox.getReflectionDatabase()

local function files(dir: string, out: { string }?): { string }
	out = out or {}
	for _, name in fs.readDir(dir) do
		local p = dir .. "/" .. name
		if fs.isDir(p) then
			files(p, out)
		elseif string.match(name, "%.luau$") then
			table.insert(out :: { string }, p)
		end
	end
	return out :: { string }
end

local function member(class: string, name: string): boolean
	local c = db:GetClass(class)
	while c do
		if c.Properties[name] then
			return true
		end
		c = if c.Superclass then db:GetClass(c.Superclass) else nil
	end
	return false
end

-- names on Instance.new variables that are not properties but legitimate (children we add, events, methods)
local NOT_PROPS = { Changed = true, Destroying = true, Touched = true, MouseButton1Click = true, Activated = true }

suite:test("enums, classes, services and Instance.new properties exist; every file compiles", function()
	local bad = {}
	local counts = { enum = 0, class = 0, svc = 0, prop = 0, files = 0 }
	for _, f in files(ROOT .. "src") do
		local src = fs.readFile(f)
		counts.files += 1
		local ok, err = pcall(luau.compile, src, { optimizationLevel = 2 })
		if not ok then
			table.insert(bad, f .. ": does not compile: " .. tostring(err))
		end
		local vars = {}
		local n = 0
		for line in string.gmatch(src .. "\n", "([^\n]*)\n") do
			n += 1
			local c = string.gsub(line, "%-%-.*$", "")
			local where = f .. ":" .. n
			for en, item in string.gmatch(c, "Enum%.(%w+)%.(%w+)") do
				counts.enum += 1
				local ed = db:GetEnum(en)
				if not ed then
					table.insert(bad, where .. " unknown enum " .. en)
				elseif ed.Items[item] == nil then
					table.insert(bad, where .. " unknown enum item " .. en .. "." .. item)
				end
			end
			for _, pat in
				{
					'Instance%.new%("(%w+)"',
					'GetService%("(%w+)"%)',
					':IsA%("(%w+)"',
					':FindFirstChildOfClass%("(%w+)"',
				}
			do
				for cls in string.gmatch(c, pat) do
					counts.class += 1
					if not db:GetClass(cls) then
						table.insert(bad, where .. " unknown class " .. cls)
					end
				end
			end
			-- a new local of the same name (another scope) forgets the earlier Instance.new variable
			for name in string.gmatch(c, "local%s+([%w_]+)") do
				vars[name] = nil
			end
			local v, cls = string.match(c, 'local%s+([%w_]+)%s*=%s*Instance%.new%("(%w+)"')
			if not v then
				v, cls = string.match(c, '^%s*([%w_]+)%s*=%s*Instance%.new%("(%w+)"')
			end
			if v then
				vars[v] = cls
			end
			-- property assignments on those variables (v.Prop = ...)
			for var, prop in string.gmatch(c, "([%w_]+)%.(%u[%w_]*)%s*=[^=]") do
				local k = vars[var]
				if k and not NOT_PROPS[prop] then
					counts.prop += 1
					if not member(k, prop) then
						table.insert(bad, where .. " " .. var .. " (" .. k .. ")." .. prop .. " is not a property")
					end
				end
			end
		end
	end
	T.eq(#bad, 0, table.concat(bad, "\n"))
	T.ok(
		counts.files > 100 and counts.enum > 30 and counts.class > 30 and counts.prop > 200,
		"checked: "
			.. counts.files
			.. " files, "
			.. counts.enum
			.. " enum uses, "
			.. counts.class
			.. " class names, "
			.. counts.prop
			.. " property sets"
	)
end)

return suite
