-- A small fake Roblox runtime for server smoke tests under Lune (no Studio here). It loads the real server modules
-- from src/server with a custom environment: `game:GetService` returns scripted fakes (Players, DataStoreService,
-- MarketplaceService, RunService, ...), `script.Parent.X` and `ReplicatedStorage.Shared.X` resolve to files,
-- shared modules are loaded with Lune's own require (they use the dual require), and `task` / `os.clock` /
-- `os.time` run on a virtual clock that the test advances (Roblox.advance), so autosave loops never block.
local luau = require("@lune/luau")
local fs = require("@lune/fs")
local serde = require("@lune/serde")
local roblox = require("@lune/roblox")

-- GUI buttons: Lune's Instance has no events; Activated becomes a recorded handler that tests can "click"
-- (strong keys: Lune caches the userdata of an Instance only while it is referenced; a weak table let the wrapper be
-- collected and a later GetDescendants returned a new one that was not found here)
local clickHandlers = {}
local implemented = false
local function implementEvents()
	if implemented then
		return
	end
	implemented = true
	for _, cls in { "TextButton", "ImageButton" } do
		roblox.implementProperty(cls, "Activated", function(inst)
			return {
				Connect = function(_, f)
					clickHandlers[inst] = f
					return { Disconnect = function() end }
				end,
			}
		end)
	end
end

local Roblox = {}
Roblox.__index = Roblox

local ROOT = if fs.isDir("src") then "" else "../"

-- ---------- virtual scheduler ----------
local function newScheduler()
	local S = { now = 0, timers = {}, deferred = {}, errors = {}, seq = 0 }
	local function resume(co, ...)
		local ok, err = coroutine.resume(co, ...)
		if not ok then
			table.insert(S.errors, tostring(err) .. "\n" .. debug.traceback(co))
		end
	end
	S.resume = resume
	local function at(t, co, ...)
		S.seq += 1
		table.insert(S.timers, { t = t, seq = S.seq, co = co, args = table.pack(...) })
	end
	local task = {}
	function task.spawn(f, ...)
		local co = if type(f) == "thread" then f else coroutine.create(f)
		resume(co, ...)
		return co
	end
	function task.defer(f, ...)
		local co = if type(f) == "thread" then f else coroutine.create(f)
		table.insert(S.deferred, { co = co, args = table.pack(...) })
		return co
	end
	function task.delay(t, f, ...)
		local co = coroutine.create(f)
		at(S.now + (t or 0), co, ...)
		return co
	end
	function task.wait(t)
		local co = coroutine.running()
		local t0 = S.now
		at(S.now + math.max(t or 0, 1 / 60), co)
		coroutine.yield()
		return S.now - t0
	end
	function task.cancel(co)
		for i = #S.timers, 1, -1 do
			if S.timers[i].co == co then
				table.remove(S.timers, i)
			end
		end
	end
	S.task = task
	-- run everything due up to now + dt (timers in time order, deferred threads after each)
	function S.advance(dt)
		local target = S.now + dt
		while true do
			while #S.deferred > 0 do
				local d = table.remove(S.deferred, 1)
				resume(d.co, table.unpack(d.args, 1, d.args.n))
			end
			local best, bi = nil, nil
			for i, tm in S.timers do
				if tm.t <= target and (not best or tm.t < best.t or (tm.t == best.t and tm.seq < best.seq)) then
					best, bi = tm, i
				end
			end
			if not best then
				break
			end
			table.remove(S.timers, bi)
			S.now = math.max(S.now, best.t)
			resume(best.co, table.unpack(best.args, 1, best.args.n))
		end
		S.now = target
	end
	return S
end

-- ---------- signals ----------
local function newSignal(S)
	local sig = { handlers = {} }
	function sig:Connect(f)
		local h = { f = f, on = true }
		table.insert(self.handlers, h)
		return {
			Disconnect = function()
				h.on = false
			end,
		}
	end
	function sig:Fire(...)
		for _, h in table.clone(self.handlers) do
			if h.on then
				S.task.spawn(h.f, ...)
			end
		end
	end
	return sig
end

-- ---------- Enum ----------
local function enumProxy(path)
	local cache = {}
	return setmetatable({}, {
		__index = function(_, k)
			if not cache[k] then
				cache[k] = enumProxy(path .. "." .. k)
			end
			return cache[k]
		end,
		__tostring = function()
			return path
		end,
	})
end

-- ---------- instance paths ----------
local PathMT = {}
PathMT.__index = function(self, k)
	if k == "WaitForChild" or k == "FindFirstChild" then
		return function(_, name)
			return rawget(self, "child")(name)
		end
	end
	return rawget(self, "child")(k)
end
local function pathObj(path: string, parent)
	local o = { path = path, parent = parent }
	o.child = function(name)
		if name == "Parent" then
			return parent
		end
		return pathObj(path .. "/" .. name, o)
	end
	return setmetatable(o, PathMT)
end

function Roblox.new()
	local self = setmetatable({}, Roblox)
	local S = newScheduler()
	self.S = S
	self.modules = {}
	self.kicked = {}
	self.prompts = {}
	self.ui = {} -- [player] = { msg, ... }
	self.passOwned = {} -- [userId] = { [passId] = true }
	self.storeData = {}
	self.storeFail = 0
	self.studio = false

	local players = { list = {} }
	players.PlayerAdded = newSignal(S)
	players.PlayerRemoving = newSignal(S)
	function players:GetPlayers()
		return table.clone(self.list)
	end
	function players:GetPlayerByUserId(uid)
		for _, p in self.list do
			if p.UserId == uid then
				return p
			end
		end
		return nil
	end
	self.Players = players

	local market = {
		PromptGamePassPurchaseFinished = newSignal(S),
		PromptProductPurchaseFinished = newSignal(S),
		ProcessReceipt = nil,
	}
	function market.UserOwnsGamePassAsync(_, uid, passId)
		return (self.passOwned[uid] or {})[passId] == true
	end
	function market.PromptGamePassPurchase(_, player, id)
		table.insert(self.prompts, { kind = "pass", player = player, id = id })
	end
	function market.PromptProductPurchase(_, player, id)
		table.insert(self.prompts, { kind = "product", player = player, id = id })
	end
	function market.GetProductInfoAsync(_, id, _infoType)
		return { PriceInRobux = 40 + id % 7, IsForSale = true }
	end
	self.Market = market

	local function roundTrip(v)
		if v == nil then
			return nil
		end
		return serde.decode("json", serde.encode("json", v))
	end
	local dss = {}
	function dss.GetDataStore(_, _name)
		return {
			UpdateAsync = function(_, key, fn)
				if self.storeFail > 0 then
					self.storeFail -= 1
					error("fake DataStore error")
				end
				local new = fn(roundTrip(self.storeData[key]), nil)
				if new ~= nil then
					self.storeData[key] = roundTrip(new)
				end
				return roundTrip(new)
			end,
		}
	end
	function dss.GetRequestBudgetForRequestType(_, _kind)
		return 100
	end

	local runService = { Heartbeat = newSignal(S) }
	function runService.IsStudio()
		return self.studio
	end
	local services = {
		Players = players,
		MarketplaceService = market,
		DataStoreService = dss,
		RunService = runService,
		HttpService = {
			GenerateGUID = function()
				return "guid"
			end,
		},
		PolicyService = {
			GetPolicyInfoForPlayerAsync = function()
				return { ArePaidRandomItemsRestricted = false }
			end,
		},
		ReplicatedStorage = { WaitForChild = function(_, name)
			return pathObj(ROOT .. "src/shared", nil)
		end },
	}
	self.RunService = runService
	self.closers = {}
	self.game = {
		JobId = "job-test",
		GameId = 1,
		GetService = function(_, name)
			return assert(services[name], "no fake service " .. name)
		end,
		BindToClose = function(_, f)
			table.insert(self.closers, f)
		end,
	}
	local fakeOs = table.clone(os)
	fakeOs.clock = function()
		return S.now
	end
	fakeOs.time = function()
		return 1700000000 + math.floor(S.now)
	end
	self.os = fakeOs
	return self
end

-- require a module by path object (server files through our loader, shared ones through Lune's require)
function Roblox:require(obj)
	local path = obj.path
	if string.find(path, "src/shared", 1, true) then
		-- relative to this file (tests/lib)
		local rel = "../../" .. string.sub(path, (string.find(path, "src/shared", 1, true) :: number))
		return require(rel)
	end
	if self.modules[path] == nil then
		local file = path .. ".luau"
		local src = fs.readFile(file)
		local env = {
			game = self.game,
			script = obj,
			require = function(o)
				return self:require(o)
			end,
			task = self.S.task,
			os = self.os,
			warn = function(...)
				self.warnings = self.warnings or {}
				table.insert(self.warnings, table.concat(table.pack(...) :: any, " "))
			end,
			print = function() end,
			Enum = enumProxy("Enum"),
		}
		self.modules[path] = luau.load(src, { debugName = file, environment = env })()
	end
	return self.modules[path]
end

-- ---------- client UI ----------
-- a client module by name (e.g. "UI/Router"), loaded with Lune's Roblox datatypes and Instances
function Roblox:client(name: string)
	implementEvents()
	if not self.playerGui then
		self.playerGui = roblox.Instance.new("Folder")
		self.playerGui.Name = "PlayerGui"
		local pg = self.playerGui
		self.Players.LocalPlayer = {
			UserId = 1,
			LocaleId = "en-us",
			WaitForChild = function()
				return pg
			end,
		}
	end
	local parts = string.split(name, "/")
	local obj = pathObj(ROOT .. "src/client", nil)
	for _, p in parts do
		obj = obj.child(p)
	end
	return self:requireClient(obj)
end

function Roblox:requireClient(obj)
	local path = obj.path
	if string.find(path, "src/shared", 1, true) then
		return self:require(obj)
	end
	self.clientModules = self.clientModules or {}
	if self.clientModules[path] == nil then
		local file = path .. ".luau"
		local env = {
			game = self.game,
			script = obj,
			require = function(o)
				return self:requireClient(o)
			end,
			task = self.S.task,
			os = self.os,
			warn = function() end,
			print = function() end,
			workspace = { CurrentCamera = nil },
			Instance = roblox.Instance,
			UDim = roblox.UDim,
			UDim2 = roblox.UDim2,
			Vector2 = roblox.Vector2,
			Vector3 = roblox.Vector3,
			CFrame = roblox.CFrame,
			Color3 = roblox.Color3,
			ColorSequence = roblox.ColorSequence,
			NumberSequence = roblox.NumberSequence,
			Enum = roblox.Enum,
		}
		self.clientModules[path] = luau.load(fs.readFile(file), { debugName = file, environment = env })()
	end
	return self.clientModules[path]
end

-- every visible button under `root` (instances with a recorded Activated handler), in tree order
function Roblox.buttons(root): { any }
	local out = {}
	for _, d in root:GetDescendants() do
		if clickHandlers[d] then
			table.insert(out, d)
		end
	end
	return out
end

function Roblox:click(button)
	local f = clickHandlers[button]
	assert(f, "not a button")
	self.S.task.spawn(f)
end

-- a server module by name, e.g. rb:server("Services/Profiles")
function Roblox:server(name: string)
	local parts = string.split(name, "/")
	local obj = pathObj(ROOT .. "src/server", nil)
	for _, p in parts do
		obj = obj.child(p)
	end
	return self:require(obj)
end

-- a fake Net service that records Ui messages
function Roblox:fakeNet()
	local rb = self
	local net = { handlers = {} }
	function net.ui(player, msg)
		rb.ui[player] = rb.ui[player] or {}
		table.insert(rb.ui[player], msg)
	end
	function net.uiAll(msg)
		for _, p in rb.Players.list do
			net.ui(p, msg)
		end
	end
	function net.ev() end
	function net.snap() end
	return net
end

-- last Ui message of type t sent to player (nil when none)
function Roblox:lastUi(player, t: string)
	local list = self.ui[player] or {}
	for i = #list, 1, -1 do
		if list[i].t == t then
			return list[i]
		end
	end
	return nil
end

function Roblox:join(uid: number, locale: string?)
	local rb = self
	local p = {
		UserId = uid,
		Name = "P" .. uid,
		DisplayName = "Player" .. uid,
		LocaleId = locale or "en-us",
		Character = nil,
	}
	p.Parent = self.Players
	function p.Kick(_, msg)
		rb.kicked[uid] = msg
	end
	table.insert(self.Players.list, p)
	self.Players.PlayerAdded:Fire(p)
	return p
end

function Roblox:leave(p)
	local i = table.find(self.Players.list, p)
	if i then
		table.remove(self.Players.list, i)
	end
	self.Players.PlayerRemoving:Fire(p)
	p.Parent = nil
end

-- advance virtual time; heartbeat = fire RunService.Heartbeat every 1/30 s
function Roblox:advance(seconds: number, heartbeat: boolean?)
	if not heartbeat then
		self.S.advance(seconds)
		return
	end
	local n = math.floor(seconds * 30 + 0.5)
	for _ = 1, n do
		self.S.advance(1 / 30)
		self.RunService.Heartbeat:Fire(1 / 30)
	end
end

function Roblox:errors(): { string }
	return self.S.errors
end

return Roblox
