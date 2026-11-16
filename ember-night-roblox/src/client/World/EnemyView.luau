--!native
-- Enemies from interpolated snapshots (docs/DESIGN.md §3.5, §4.3): one primitive model per enemy (ModelKit), all
-- parts moved once per frame with workspace:BulkMoveTo. Enemies face their movement (or, standing or winding up,
-- the nearest hero); hit flash, frozen and slowed tint the body; elites and bosses stand on a gold ring, bosses wear
-- a crown and carry an aura light. Kills hide an enemy at once; ids not seen for 0.5 s are released.
local ModelKit = require(script.Parent.ModelKit)
local Coords = require(script.Parent.Coords)

local EnemyView = {}

type Slot = { rig: ModelKit.Rig, sig: string, seen: number, x: number, y: number, yaw: number }

local live: { [number]: Slot } = {}
local killed: { [number]: number } = {}
local bossNames: { [number]: string } = {}
local positions: { [number]: { x: number, y: number } } = {}
local tints: { [string]: string } = {}
local parts: { BasePart } = {}
local cframes: { CFrame } = {}
local S = Coords.S
local st = { moving = true, winding = false }
local heroes: { { x: number, y: number } } = {}
local atan2 = math.atan2

function EnemyView.setStage(stage)
	tints = stage and stage.tints or {}
end

function EnemyView.bossSpawned(id: number, name: string)
	bossNames[id] = name
end

local function release(id: number)
	local s = live[id]
	if s then
		ModelKit.release(s.rig)
		live[id] = nil
	end
	positions[id] = nil
end

function EnemyView.kill(id: number)
	killed[id] = os.clock()
	release(id)
end

-- rendered position of an enemy (telegraphs follow it)
function EnemyView.position(id: number): (number?, number?)
	local p = positions[id]
	if p then
		return p.x, p.y
	end
	return nil, nil
end

-- the boss currently in view (for the off-screen arrow): x, y or nil
function EnemyView.bossPosition(): (number?, number?)
	for id, name in bossNames do
		local p = positions[id]
		if p and name then
			return p.x, p.y
		end
	end
	return nil, nil
end

function EnemyView.count(): number
	local n = 0
	for _ in live do
		n += 1
	end
	return n
end

function EnemyView.clear()
	for id in live do
		release(id)
	end
	table.clear(killed)
	table.clear(bossNames)
	table.clear(positions)
end

local function nearestHeroAngle(x: number, y: number): number?
	local best, bx, by = math.huge, 0, 0
	for _, h in heroes do
		local d = (h.x - x) ^ 2 + (h.y - y) ^ 2
		if d < best then
			best, bx, by = d, h.x, h.y
		end
	end
	if best == math.huge then
		return nil
	end
	return atan2(by - y, bx - x)
end

local function turn(from: number, to: number, k: number): number
	local d = (to - from + math.pi) % (2 * math.pi) - math.pi
	return from + d * k
end

-- heroList: positions of the visible heroes (for facing)
function EnemyView.update(interp, now: number, heroList: { { x: number, y: number } }?, dt: number?)
	heroes = heroList or {}
	local k = math.min(1, (dt or 1 / 60) * 10)
	table.clear(parts)
	table.clear(cframes)
	local n = 0
	interp:eachEnemy(function(id, x, y, e)
		local kt = killed[id]
		if kt then
			if now - kt < 1.5 then
				return
			end
			killed[id] = nil
		end
		local bossName = if e.boss then bossNames[id] else nil
		local sig = e.type .. (if e.elite then "E" else "") .. (bossName or "")
		local s = live[id]
		if s and s.sig ~= sig then
			release(id)
			s = nil
		end
		if not s then
			s = {
				rig = ModelKit.enemy(e.type, e.elite, bossName, tints),
				sig = sig,
				seen = now,
				x = x,
				y = y,
				yaw = nearestHeroAngle(x, y) or 0,
			}
			live[id] = s
		end
		local rig = s.rig
		local state = if e.flash then "flash" elseif e.frozen then "frozen" elseif e.slowed then "slowed" else ""
		ModelKit.tint(rig, state, ModelKit.enemyColor(e.type, tints, bossName))
		-- facing: movement direction, or the nearest hero while standing / winding up
		local dx, dy = x - s.x, y - s.y
		local want: number? = nil
		if e.winding or dx * dx + dy * dy < 0.04 then
			want = nearestHeroAngle(x, y)
		else
			want = atan2(dy, dx)
		end
		if want then
			s.yaw = turn(s.yaw, want, if e.winding then 1 else k)
		end
		s.seen = now
		s.x, s.y = x, y
		local p = positions[id]
		if p then
			p.x, p.y = x, y
		else
			positions[id] = { x = x, y = y }
		end
		st.winding = e.winding
		st.moving = true
		local base = CFrame.new(x * S, 0, y * S) * CFrame.Angles(0, -s.yaw, 0)
		n = ModelKit.pose(rig, base, now, st, parts, cframes, n)
	end)
	if n > 0 then
		workspace:BulkMoveTo(parts, cframes, Enum.BulkMoveMode.FireCFrameChanged)
	end
	for id, s in live do
		if now - s.seen > 0.5 then
			release(id)
		end
	end
end

return EnemyView
