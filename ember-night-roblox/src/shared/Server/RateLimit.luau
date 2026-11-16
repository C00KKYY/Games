--!strict
-- Token bucket per key (player) for remote rate limits (docs/DESIGN.md §3.6). Pure: the caller passes the time.
local RateLimit = {}
RateLimit.__index = RateLimit

export type RateLimit = typeof(setmetatable(
	{} :: { rate: number, burst: number, buckets: { [any]: { tokens: number, t: number } } },
	RateLimit
))

-- rate = tokens per second, burst = bucket size
function RateLimit.new(rate: number, burst: number): RateLimit
	return setmetatable({ rate = rate, burst = burst, buckets = {} }, RateLimit)
end

-- true when the request of `key` at time `now` (seconds) is allowed
function RateLimit.allow(self: RateLimit, key: any, now: number): boolean
	local b = self.buckets[key]
	if not b then
		b = { tokens = self.burst, t = now }
		self.buckets[key] = b
	end
	b.tokens = math.min(self.burst, b.tokens + (now - b.t) * self.rate)
	b.t = now
	if b.tokens >= 1 then
		b.tokens -= 1
		return true
	end
	return false
end

function RateLimit.forget(self: RateLimit, key: any)
	self.buckets[key] = nil
end

return RateLimit
