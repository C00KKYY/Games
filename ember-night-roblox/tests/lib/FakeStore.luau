-- A DataStore stand-in for ProfileStore tests: UpdateAsync semantics (transform(old) -> new or nil = no write),
-- values pass through JSON like real DataStore values, injected failures before or after the write, a hook that
-- runs while a call "yields", an optional second transform call (UpdateAsync may call it again on conflicts),
-- and a fake clock that `sleep` advances.
local serde = require("@lune/serde")

local FakeStore = {}
FakeStore.__index = FakeStore

local function roundTrip(v)
	if v == nil then
		return nil
	end
	return serde.decode("json", serde.encode("json", v))
end
FakeStore.roundTrip = roundTrip

function FakeStore.new()
	local self = setmetatable({
		data = {},
		failBefore = 0, -- next n calls fail without writing
		failAfter = 0, -- next n calls write, then fail
		twice = false, -- call the transform twice (first result discarded)
		during = nil, -- function() called inside every update (simulates other code running while it yields)
		calls = 0,
		writes = 0,
		clock = 1000000,
		slept = 0,
	}, FakeStore)
	self.backend = {
		update = function(key, transform)
			return self:update(key, transform)
		end,
	}
	return self
end

function FakeStore:update(key: string, transform)
	self.calls += 1
	if self.during then
		self.during()
	end
	if self.failBefore > 0 then
		self.failBefore -= 1
		return false, "injected failure before write"
	end
	if self.twice then
		transform(roundTrip(self.data[key]))
	end
	local new = transform(roundTrip(self.data[key]))
	if new ~= nil then
		self.data[key] = roundTrip(new)
		self.writes += 1
	end
	if self.failAfter > 0 then
		self.failAfter -= 1
		return false, "injected failure after write"
	end
	return true, roundTrip(new)
end

-- options for ProfileStore.new
function FakeStore:opts(jobId: string, extra: { [string]: any }?)
	local o = {
		backend = self.backend,
		jobId = jobId,
		now = function()
			return self.clock
		end,
		sleep = function(s)
			self.clock += s
			self.slept += s
		end,
	}
	for k, v in extra or {} do
		o[k] = v
	end
	return o
end

return FakeStore
