--!native
-- Gems and pickups (docs/DESIGN.md §3.5): spawned once, attracted toward a hero when the sim says so, removed when
-- collected. Placeholder looks: gems are small blue/green/red diamonds by value, pickups coloured shapes; chests
-- carry their owner's hero colour.
local Pool = require(script.Parent.Pool)
local Coords = require(script.Parent.Coords)

local PickupView = {}

local S = Coords.S
type Item = { part: BasePart, x: number, y: number, slot: number, sp: number, h: number }
local items: { [number]: Item } = {}
local bulkP: { BasePart } = {}
local bulkC: { CFrame } = {}
local heroPos: (number) -> (number?, number?) = function(_)
	return nil, nil
end
local ownerColor: (number) -> Color3 = function(_)
	return Color3.new(1, 1, 1)
end

local KIND = {
	coin = { "Cylinder", Vector3.new(0.3, 1.2, 1.2), Color3.fromHex("#ffd23f"), 0.7 },
	bag = { "Ball", Vector3.one * 1.8, Color3.fromHex("#c89a3a"), 0.9 },
	heart = { "Ball", Vector3.one * 1.6, Color3.fromHex("#ff4f6e"), 0.9 },
	magnet = { "Block", Vector3.new(1.4, 1.4, 0.6), Color3.fromHex("#ff6060"), 0.9 },
	bomb = { "Ball", Vector3.one * 1.6, Color3.fromHex("#30303a"), 0.9 },
	chest = { "Block", Vector3.new(2.6, 1.8, 1.8), Color3.fromHex("#b07a3a"), 1.1 },
}

function PickupView.setHeroPosition(fn, colorFn)
	heroPos = fn
	ownerColor = colorFn
end

function PickupView.gem(e)
	local col = if e.v >= 20 then Color3.fromHex("#ff5a6e") elseif e.v >= 5 then Color3.fromHex("#5dff8f") else Color3.fromHex("#5ab8ff")
	local size = if e.v >= 20 then 1.2 elseif e.v >= 5 then 1.0 else 0.8
	local p = Pool.get("Block", Vector3.one * size, col, Enum.Material.Neon, 0)
	items[e.id] = { part = p, x = e.x, y = e.y, slot = 0, sp = 0, h = 0.7 }
end

function PickupView.pickup(e)
	local k = KIND[e.kind] or KIND.coin
	local p = Pool.get(k[1], k[2], k[3], Enum.Material.SmoothPlastic, 0)
	if e.kind == "chest" and e.owner and e.owner > 0 then
		-- chests carry their owner's hero colour (only the owner can open them)
		p.Color = k[3]:Lerp(ownerColor(e.owner), 0.6)
		p.Material = Enum.Material.Neon
	end
	items[e.id] = { part = p, x = e.x, y = e.y, slot = 0, sp = 0, h = k[4] }
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
		Pool.put(it.part)
		items[id] = nil
	end
end

function PickupView.render(dt: number, now: number)
	local n = 0
	table.clear(bulkP)
	table.clear(bulkC)
	for id, it in items do
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
		n += 1
		bulkP[n] = it.part
		bulkC[n] = CFrame.new(it.x * S, it.h + math.sin(now * 3 + id) * 0.15, it.y * S) * CFrame.Angles(0, now * 2 + id, 0)
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
