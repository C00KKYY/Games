-- Session lock decisions for the profile DataStore (docs/DESIGN.md §6.2). Pure.
-- A lock is { job = JobId, t = os.time() of the last write }; it is live while younger than LOCK_STALE.
local LockLogic = {}

-- does `lock` belong to this server?
function LockLogic.owns(lock: any, jobId: string): boolean
	return type(lock) == "table" and lock.job == jobId
end

-- is `lock` held by another server that is probably still alive?
function LockLogic.foreignLive(lock: any, jobId: string, now: number, stale: number): boolean
	if type(lock) ~= "table" or type(lock.job) ~= "string" or lock.job == jobId then
		return false
	end
	local t = if type(lock.t) == "number" then lock.t else 0
	return now - t < stale and now - t > -stale -- a clock far in the future counts as stale too
end

-- loading: "take" the profile or "wait" for the other server to release it (force = take over after retries)
function LockLogic.loadDecision(lock: any, jobId: string, now: number, stale: number, force: boolean?): string
	if not force and LockLogic.foreignLive(lock, jobId, now, stale) then
		return "wait"
	end
	return "take"
end

return LockLogic
