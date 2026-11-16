--!strict
--!native
-- Spatial hash for collision queries (web util.js Grid). Cells keyed by a single integer; buckets are reused.
local Grid = {}
Grid.__index = Grid

export type Grid = typeof(setmetatable(
	{} :: { cs: number, cells: { [number]: { any } }, used: { { any } }, nCells: number },
	Grid
))

function Grid.new(cell: number): Grid
	return setmetatable({ cs = cell, cells = {}, used = {}, nCells = 0 }, Grid)
end

local floor, band = math.floor, bit32.band

local function keyOf(cx: number, cy: number): number
	return band(cx, 16383) * 16384 + band(cy, 16383)
end

function Grid.clear(self: Grid)
	local used = self.used
	for i = 1, #used do
		table.clear(used[i])
		used[i] = nil
	end
	if self.nCells > 6000 then
		table.clear(self.cells)
		self.nCells = 0
	end
end

function Grid.insert(self: Grid, e: any)
	local cs = self.cs
	local k = keyOf(floor(e.x / cs), floor(e.y / cs))
	local a = self.cells[k]
	if not a then
		a = {}
		self.cells[k] = a
		self.nCells += 1
	end
	if #a == 0 then
		table.insert(self.used, a)
	end
	a[#a + 1] = e
end

-- fills `out` (cleared first) with candidates within the square around (x, y) of half size r
function Grid.query(self: Grid, x: number, y: number, r: number, out: { any }): { any }
	table.clear(out)
	local cs = self.cs
	local x0, x1 = floor((x - r) / cs), floor((x + r) / cs)
	local y0, y1 = floor((y - r) / cs), floor((y + r) / cs)
	local cells = self.cells
	local n = 0
	for cx = x0, x1 do
		for cy = y0, y1 do
			local a = cells[keyOf(cx, cy)]
			if a then
				for i = 1, #a do
					n += 1
					out[n] = a[i]
				end
			end
		end
	end
	return out
end

return Grid
