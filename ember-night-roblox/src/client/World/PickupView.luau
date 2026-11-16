--!native
-- Gems and pickups (docs/DESIGN.md §3.5, §4.3): spawned once, attracted toward a hero when the sim says so, removed
-- when collected. Models from ModelKit: gems are neon diamonds (blue 1, green 5+, pink 20+), coins spin, bags,
-- hearts, magnets, bombs with a sparking fuse; chests carry a band in their owner's hero colour (only the owner can
-- open them) in neon so they are found in the dark.
local ModelKit = require(script.Parent.ModelKit)
local Coords = require(script.Parent.Coords)

local PickupView = {}

local S = Coords.S
type Item = { rig: ModelKit.Rig, x: number, y: number, slot: number, sp: number, owner: number? }
local items: { [number]: Item } = {}
local bulkP: { BasePart } = {}
local bulkC: { CFrame } = {}
local st = { moving = false }
local heroPos: (number) -> (number?, number?) = function(_)
	return nil, nil
end
local ownerColor: (number) -> Color3 = function(_)
	return Color3.new(1, 1, 1)
end

function PickupView.setHeroPosition(fn, colorFn)
	heroPos = fn
	ownerColor = colorFn
end

function PickupView.gem(e)
	items[e.id] = { rig = ModelKit.gem(e.v), x = e.x, y = e.y, slot = 0, sp = 0 }
end

function PickupView.pickup(e)
	local rig
	if e.kind == "chest" then
		local owner = if e.owner and e.owner > 0 then ownerColor(e.owner) else Color3.fromHex("#ffcf3f")
		rig = ModelKit.pickup("chest", { body = Color3.fromHex("#8a5a2a"), owner = owner })
	else
		rig = ModelKit.pickup(e.kind)
	end
	items[e.id] = { rig = rig, x = e.x, y = e.y, slot = 0, sp = 0, owner = e.owner }
end

function PickupView.pull(id: number, slot: number)
	local it = items[id]
	if it then
		it.slot = slot
		it.sp = -100
	end
end

function PickupView.remove(id: number)
	local it = items[id]
	if it then
		ModelKit.release(it.rig)
		items[id] = nil
	end
end

-- chests the given slot may open (for the off-screen arrows): calls fn(x, y)
function PickupView.eachChest(slot: number, fn: (number, number) -> ())
	for _, it in items do
		if it.rig.kind == "chest" and (not it.owner or it.owner == 0 or it.owner == slot) then
			fn(it.x, it.y)
		end
	end
end

function PickupView.render(dt: number, now: number)
	local n = 0
	table.clear(bulkP)
	table.clear(bulkC)
	for _, it in items do
		if it.slot > 0 then
			local hx, hy = heroPos(it.slot)
			if hx then
				local dx, dy = hx - it.x, hy - it.y
				local d = math.max(1, math.sqrt(dx * dx + dy * dy))
				it.sp += 1100 * dt
				local step = it.sp * dt
				if step >= d then
					it.x, it.y = hx, hy
				else
					it.x += dx / d * step
					it.y += dy / d * step
				end
			end
		end
		n = ModelKit.pose(it.rig, CFrame.new(it.x * S, 0, it.y * S), now, st, bulkP, bulkC, n)
	end
	if n > 0 then
		workspace:BulkMoveTo(bulkP, bulkC, Enum.BulkMoveMode.FireCFrameChanged)
	end
end

function PickupView.clear()
	for id in items do
		PickupView.remove(id)
	end
end

return PickupView
