-- Braziers ("Kohlebecken") per 620 px chunk, placed by hash (web updateProps, hitProps). `Props.position` is
-- shared with the client so it can draw braziers without replication; only broken ones are sent as events.
local K = if script then require(script.Parent.K) else require("./K")
local Util = if script then require(script.Parent.Util) else require("./Util")
local Tuning = if script then require(script.Parent.Parent.Config.Tuning) else require("../Config/Tuning")

local Props = {}

local CHUNK = 620
Props.CHUNK = CHUNK
local hash2 = Util.hash2
local VIEW_HW, VIEW_HH = Tuning.VIEW_HW, Tuning.VIEW_HH

-- world position of the brazier in chunk (cx, cy), or nil when the chunk has none
function Props.position(cx: number, cy: number): (number?, number?)
	if hash2(cx, cy, 7) > 0.5 or (cx == 0 and cy == 0) then
		return nil, nil
	end
	return (cx + 0.15 + hash2(cx, cy, 8) * 0.7) * CHUNK, (cy + 0.15 + hash2(cx, cy, 9) * 0.7) * CHUNK
end

function Props.key(cx: number, cy: number): number
	return (cx + 32768) * 65536 + (cy + 32768)
end

local function around(run, p)
	local cx0, cx1 = math.floor((p.x - VIEW_HW - 200) / CHUNK), math.floor((p.x + VIEW_HW + 200) / CHUNK)
	local cy0, cy1 = math.floor((p.y - VIEW_HH - 200) / CHUNK), math.floor((p.y + VIEW_HH + 200) / CHUNK)
	local props, broken = run.props, run.broken
	for cx = cx0, cx1 do
		for cy = cy0, cy1 do
			local key = Props.key(cx, cy)
			if props[key] == nil and not broken[key] then
				local x, y = Props.position(cx, cy)
				if not x then
					props[key] = false
				else
					local pr = { key = key, cx = cx, cy = cy, x = x, y = y, r = 14 }
					props[key] = pr
					table.insert(run.propList, pr)
				end
				run.propCount += 1
			end
		end
	end
end

function K.updateProps(run)
	for _, p in run.act do
		around(run, p)
	end
	if run.propCount > 300 then
		local props = run.props
		local keep = {}
		local n = 0
		local function nearAny(x, y)
			for _, p in run.act do
				if math.abs(x - p.x) <= 3000 and math.abs(y - p.y) <= 3000 then
					return true
				end
			end
			return false
		end
		-- remove empty chunks and far braziers (iteration order does not matter: only deletions)
		for k, v in props do
			if not v or not nearAny(v.x, v.y) then
				props[k] = nil
			else
				n += 1
			end
		end
		for _, pr in run.propList do
			if props[pr.key] == pr then
				keep[#keep + 1] = pr
			end
		end
		run.propList = keep
		run.propCount = n
	end
end

function K.hitProps(run, x: number, y: number, rad: number)
	local list = run.propList
	for i = #list, 1, -1 do
		local pr = list[i]
		local rr = rad + pr.r
		if Util.dist2(x, y, pr.x, pr.y) <= rr * rr then
			table.remove(list, i)
			run.props[pr.key] = nil
			run.propCount -= 1
			run.broken[pr.key] = true
			K.ev(run, { k = "prop-", cx = pr.cx, cy = pr.cy, x = pr.x, y = pr.y })
			K.sfx(run, "break", pr.x, pr.y)
			local kind = run.rng:weighted(run.propDrops)
			K.drop(run, pr.x, pr.y, kind, if kind == "bag" then run.rng:int(10, 25) else 2)
		end
	end
end

Props.DROPS = {
	{ k = "bag", w = 40 },
	{ k = "heart", w = 26 },
	{ k = "magnet", w = 14 },
	{ k = "bomb", w = 12 },
	{ k = "coin", w = 8 },
}

return Props
