-- Profile sessions on top of a DataStore-like backend (docs/DESIGN.md §6.2, §7.3). Pure and Lune-testable: the
-- Roblox service (Server/Services/Profiles.luau) injects the backend (UpdateAsync wrapper), the clock and `sleep`.
--
--   local store = ProfileStore.new({ backend = b, now = os.time, sleep = task.wait, jobId = game.JobId })
--   store:load(userId)                 -- session lock; nil, "error" | "newer" when the profile cannot be used
--   store:get(userId)                  -- the in-memory profile (mutate it, then save sometime)
--   store:save(userId, release?)       -- UpdateAsync with lock check; release = drop the lock and the session
--   store:grant(userId, purchaseId, productId) -- ProcessReceipt core: "granted" | "notYet", item
--
-- backend.update(key, transform) must behave like DataStore:UpdateAsync: call transform(old) (possibly several
-- times), write its result unless it returned nil, and return ok, result-or-error. It may fail before or after
-- writing; every write carries a stamp `_w` so a retry recognises its own earlier write.
--
-- All operations on one profile are serialised (a per-user mutex), so an autosave can never overwrite a receipt
-- grant that finished while it was waiting.
local Profile = if script then require(script.Parent.Parent.Sim.Profile) else require("../Sim/Profile")
local Products = if script then require(script.Parent.Parent.Config.Products) else require("../Config/Products")
local LockLogic = if script then require(script.Parent.LockLogic) else require("./LockLogic")
local ReceiptLogic = if script then require(script.Parent.ReceiptLogic) else require("./ReceiptLogic")

local ProfileStore = {}
ProfileStore.__index = ProfileStore

local deepCopy = Profile.deepCopy

export type Session = { data: any, lost: boolean, busy: boolean, loaded: boolean }

function ProfileStore.new(o)
	local self = setmetatable({}, ProfileStore)
	self.backend = o.backend
	self.now = o.now
	self.sleep = o.sleep
	self.jobId = o.jobId
	self.log = o.log or function(_) end
	self.loadTries = o.loadTries or 5 -- tries while another server holds a live lock ...
	self.loadWait = o.loadWait or 6 -- ... seconds apart, then the lock is taken over
	self.backoff = o.backoff or { 1, 2, 4 } -- retries of a failing call (4 attempts)
	self.lockStale = o.lockStale or 1800
	self.sessions = {} :: { [number]: Session }
	self.counter = 0
	return self
end

function ProfileStore.key(userId: number): string
	return "p_" .. tostring(userId)
end

-- up to #backoff + 1 attempts
function ProfileStore:retry(what: string, fn: () -> (boolean, any)): (boolean, any)
	local ok, res = false, nil
	for attempt = 1, #self.backoff + 1 do
		ok, res = fn()
		if ok then
			return true, res
		end
		self.log(string.format("%s failed (attempt %d): %s", what, attempt, tostring(res)))
		if attempt <= #self.backoff then
			self.sleep(self.backoff[attempt])
		end
	end
	return false, res
end

function ProfileStore:stamp(): string
	self.counter += 1
	return self.jobId .. "#" .. tostring(self.counter)
end

local function lock(s: Session, sleep)
	while s.busy do
		sleep(0.05)
	end
	s.busy = true
end

-- ---------- load ----------
function ProfileStore:load(userId: number): (any, string?)
	local existing = self.sessions[userId]
	if existing then
		lock(existing, self.sleep)
		existing.busy = false
		if existing.loaded then
			return existing.data, nil
		end
		return nil, "error"
	end
	local s: Session = { data = nil, lost = false, busy = true, loaded = false }
	self.sessions[userId] = s
	local key = ProfileStore.key(userId)
	for try = 1, self.loadTries + 1 do
		local force = try > self.loadTries
		local status = "error"
		local ok, res = self:retry("load " .. key, function()
			return self.backend.update(key, function(old)
				local now = self.now()
				local lk = if type(old) == "table" then old._lock else nil
				if LockLogic.loadDecision(lk, self.jobId, now, self.lockStale, force) == "wait" then
					status = "locked"
					return nil
				end
				local prof, err = Profile.migrate(old)
				if not prof then
					status = err or "error"
					return nil
				end
				if old == nil then
					prof.created = now
				end
				prof._lock = { job = self.jobId, t = now }
				prof._w = self:stamp()
				status = "ok"
				return prof
			end)
		end)
		if not ok then
			status = "error"
		end
		if status == "ok" then
			local data = deepCopy(res)
			data._lock = nil
			data._w = nil
			s.data = data
			s.loaded = true
			s.busy = false
			return data, nil
		elseif status ~= "locked" then
			self.sessions[userId] = nil
			s.busy = false
			return nil, status
		end
		if force then
			break
		end
		self.log(string.format("load %s: locked by another server, waiting (%d)", key, try))
		self.sleep(self.loadWait)
	end
	self.sessions[userId] = nil
	s.busy = false
	return nil, "error"
end

function ProfileStore:get(userId: number): any
	local s = self.sessions[userId]
	return if s and s.loaded then s.data else nil
end

function ProfileStore:isLost(userId: number): boolean
	local s = self.sessions[userId]
	return s ~= nil and s.lost
end

-- write `value` (a full profile copy) if our lock still holds; returns "ok" | "lost" | "error"
function ProfileStore:write(userId: number, value: any, release: boolean): string
	local key = ProfileStore.key(userId)
	local stamp = self:stamp()
	local status = "error"
	local ok = self:retry("save " .. key, function()
		return self.backend.update(key, function(old)
			if type(old) == "table" and old._w == stamp then
				status = "ok" -- an earlier attempt of this very write went through before its call failed
				return nil
			end
			if type(old) == "table" and not LockLogic.owns(old._lock, self.jobId) then
				status = "lost"
				return nil
			end
			local v = deepCopy(value)
			v.v = Profile.VERSION
			v.lastSave = self.now()
			v._lock = if release then nil else { job = self.jobId, t = self.now() }
			v._w = stamp
			status = "ok"
			return v
		end)
	end)
	if not ok then
		return "error"
	end
	return status
end

-- ---------- save ----------
-- returns ok, reason ("lost": another server took the profile; the session stops saving)
function ProfileStore:save(userId: number, release: boolean?): (boolean, string?)
	local s = self.sessions[userId]
	if not s or not s.loaded then
		return false, "nosession"
	end
	if s.lost then
		if release then
			self.sessions[userId] = nil
		end
		return false, "lost"
	end
	lock(s, self.sleep)
	local res = self:write(userId, s.data, release == true)
	s.busy = false
	if res == "lost" then
		s.lost = true
		self.log("save p_" .. tostring(userId) .. ": session lost to another server")
	end
	if release and self.sessions[userId] == s then
		self.sessions[userId] = nil
	end
	return res == "ok", if res == "ok" then nil else res
end

-- ---------- receipts ----------
-- ProcessReceipt core (§7.3): grants the product to the stored profile and records the receipt in ONE write; the
-- in-memory profile changes only after that write succeeded. Returns "granted" | "notYet", the item, a reason.
function ProfileStore:grant(userId: number, purchaseId: string, productId: number): (string, any, string)
	local item = Products.byProductId(productId)
	local s = self.sessions[userId]
	local decision, reason = ReceiptLogic.decide({
		item = item,
		loaded = s ~= nil and s.loaded,
		lost = s ~= nil and s.lost,
		already = false,
	})
	if decision ~= "apply" then
		return decision, item, reason
	end
	local sess = s :: Session
	lock(sess, self.sleep)
	-- re-check under the lock (a duplicate delivery may have finished while we waited)
	decision, reason = ReceiptLogic.decide({
		item = item,
		loaded = self.sessions[userId] == sess and sess.loaded,
		lost = sess.lost,
		already = sess.data and sess.data.receipts[purchaseId] ~= nil,
	})
	if decision ~= "apply" then
		sess.busy = false
		return decision, item, reason
	end
	local cand = deepCopy(sess.data)
	ReceiptLogic.apply(cand, item, purchaseId, self.now())
	local res = self:write(userId, cand, false)
	if res == "ok" then
		-- apply to the live table (not replace it: the run may have changed it while the write was waiting)
		ReceiptLogic.apply(sess.data, item, purchaseId, self.now())
		sess.busy = false
		return "granted", item, "granted"
	end
	if res == "lost" then
		sess.lost = true
	end
	sess.busy = false
	return "notYet", item, "save " .. res
end

-- every loaded session (for autosave and shutdown)
function ProfileStore:users(): { number }
	local out = {}
	for uid, s in self.sessions do
		if s.loaded then
			table.insert(out, uid)
		end
	end
	table.sort(out)
	return out
end

return ProfileStore
