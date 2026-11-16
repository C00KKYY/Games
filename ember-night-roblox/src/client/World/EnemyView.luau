--!native
-- Enemies from interpolated snapshots (docs/DESIGN.md §3.5, §4.3): one pooled ball per enemy, moved once per frame
-- with workspace:BulkMoveTo. Kills hide an enemy immediately; ids not seen for 0.5 s are released.
local ModelKit = require(script.Parent.ModelKit)
local Pool = require(script.Parent.Pool)
local Coords = require(script.Parent.Coords)

local EnemyView = {}

type Slot = { part: BasePart, sig: string, seen: number, x: number, y: number, r: number }

local live: { [number]: Slot } = {}
local killed: { [number]: number } = {}
local bossNames: { [number]: string } = {}
local positions: { [number]: { x: number, y: number } } = {}
local tints: { [string]: string } = {}
local parts: { BasePart } = {}
local cframes: { CFrame } = {}
local WHITE = Color3.new(1, 1, 1)
local FROZEN = Color3.fromRGB(170, 220, 255)
local S = Coords.S

function EnemyView.setStage(stage)
	tints = stage and stage.tints or {}
end

function EnemyView.bossSpawned(id: number, name: string)
	bossNames[id] = name
end

function EnemyView.kill(id: number)
	killed[id] = os.clock()
	local s = live[id]
	if s then
		Pool.put(s.part)
		live[id] = nil
	end
	positions[id] = nil
end

-- rendered position of an enemy (telegraphs follow it)
function EnemyView.position(id: number): (number?, number?)
	local p = positions[id]
	if p then
		return p.x, p.y
	end
	return nil, nil
end

function EnemyView.clear()
	for id, s in live do
		Pool.put(s.part)
		live[id] = nil
	end
	table.clear(killed)
	table.clear(bossNames)
	table.clear(positions)
end

function EnemyView.update(interp, now: number)
	table.clear(parts)
	table.clear(cframes)
	local n = 0
	interp:eachEnemy(function(id, x, y, e)
		local k = killed[id]
		if k then
			if now - k < 1.5 then
				return
			end
			killed[id] = nil
		end
		local bossName = if e.boss then bossNames[id] else nil
		local sig = e.type .. (if e.elite then "E" else "") .. (bossName or "")
		local s = live[id]
		if not s then
			s = {
				part = Pool.get("Ball", nil, nil, Enum.Material.SmoothPlastic, 0),
				sig = "",
				seen = now,
				x = x,
				y = y,
				r = 1,
			}
			live[id] = s
		end
		if s.sig ~= sig then
			s.sig = sig
			s.r = ModelKit.enemyRadius(e.type, e.elite, bossName)
			s.part.Size = Vector3.one * s.r * 2
			s.part.Material = if e.elite or e.boss then Enum.Material.Neon else Enum.Material.SmoothPlastic
		end
		local col = ModelKit.enemyColor(e.type, tints, bossName)
		if e.flash then
			col = WHITE
		elseif e.frozen then
			col = FROZEN
		elseif e.slowed then
			col = col:Lerp(FROZEN, 0.4)
		end
		if s.part.Color ~= col then
			s.part.Color = col
		end
		local tr = if e.type == "ghost" then 0.35 else 0
		if s.part.Transparency ~= tr then
			s.part.Transparency = tr
		end
		s.seen = now
		s.x, s.y = x, y
		local p = positions[id]
		if p then
			p.x, p.y = x, y
		else
			positions[id] = { x = x, y = y }
		end
		local bob = if e.winding then math.sin(now * 30) * 0.15 else 0
		n += 1
		parts[n] = s.part
		cframes[n] = CFrame.new(x * S, s.r + bob, y * S)
	end)
	if n > 0 then
		workspace:BulkMoveTo(parts, cframes, Enum.BulkMoveMode.FireCFrameChanged)
	end
	for id, s in live do
		if now - s.seen > 0.5 then
			Pool.put(s.part)
			live[id] = nil
			positions[id] = nil
		end
	end
end

return EnemyView
