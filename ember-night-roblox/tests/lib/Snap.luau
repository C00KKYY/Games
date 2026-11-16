-- A tiny software renderer for the arena (no Studio here): draws every visible part of a Lune workspace through
-- the client's camera into an image (painter's algorithm: block and wedge faces with flat lambert shading, balls,
-- ellipsoids and cylinders as shaded convex outlines, transparency blended, Neon unlit), and the ScreenGuis as
-- rectangles (UIListLayout, UIGridLayout, UIPadding, AnchorPoint, Visible; text as bars of its colour), so the
-- look and the layout of the client can be checked as PNG files. Development aid only (tools/snapshot.luau).
local fs = require("@lune/fs")
local process = require("@lune/process")

local Snap = {}

type Img = { w: number, h: number, buf: buffer }

local function newImg(w: number, h: number, r: number, g: number, b: number): Img
	local buf = buffer.create(w * h * 3)
	for i = 0, w * h - 1 do
		buffer.writeu8(buf, i * 3, r)
		buffer.writeu8(buf, i * 3 + 1, g)
		buffer.writeu8(buf, i * 3 + 2, b)
	end
	return { w = w, h = h, buf = buf }
end

local function blendSpan(img: Img, y: number, x0: number, x1: number, r: number, g: number, b: number, a: number)
	if y < 0 or y >= img.h then
		return
	end
	x0 = math.max(0, math.floor(x0 + 0.5))
	x1 = math.min(img.w - 1, math.floor(x1 - 0.5))
	local buf = img.buf
	local ia = 1 - a
	for x = x0, x1 do
		local o = (y * img.w + x) * 3
		if a >= 0.999 then
			buffer.writeu8(buf, o, r)
			buffer.writeu8(buf, o + 1, g)
			buffer.writeu8(buf, o + 2, b)
		else
			buffer.writeu8(buf, o, math.floor(buffer.readu8(buf, o) * ia + r * a))
			buffer.writeu8(buf, o + 1, math.floor(buffer.readu8(buf, o + 1) * ia + g * a))
			buffer.writeu8(buf, o + 2, math.floor(buffer.readu8(buf, o + 2) * ia + b * a))
		end
	end
end

-- fill a convex polygon (list of {x, y})
local function fillPoly(img: Img, pts, r: number, g: number, b: number, a: number)
	local n = #pts
	if n < 3 then
		return
	end
	local ymin, ymax = math.huge, -math.huge
	for _, p in pts do
		ymin = math.min(ymin, p[2])
		ymax = math.max(ymax, p[2])
	end
	ymin = math.max(0, math.floor(ymin))
	ymax = math.min(img.h - 1, math.ceil(ymax))
	for y = ymin, ymax do
		local yc = y + 0.5
		local xl, xr = math.huge, -math.huge
		for i = 1, n do
			local p, q = pts[i], pts[i % n + 1]
			local y0, y1 = p[2], q[2]
			if (yc >= y0 and yc < y1) or (yc >= y1 and yc < y0) then
				local x = p[1] + (yc - y0) / (y1 - y0) * (q[1] - p[1])
				xl = math.min(xl, x)
				xr = math.max(xr, x)
			end
		end
		if xl <= xr then
			blendSpan(img, y, xl, xr, r, g, b, a)
		end
	end
end

local function hull(pts)
	table.sort(pts, function(a, b)
		return a[1] < b[1] or (a[1] == b[1] and a[2] < b[2])
	end)
	local function cross(o, a, b)
		return (a[1] - o[1]) * (b[2] - o[2]) - (a[2] - o[2]) * (b[1] - o[1])
	end
	local lower, upper = {}, {}
	for _, p in pts do
		while #lower >= 2 and cross(lower[#lower - 1], lower[#lower], p) <= 0 do
			table.remove(lower)
		end
		table.insert(lower, p)
	end
	for i = #pts, 1, -1 do
		local p = pts[i]
		while #upper >= 2 and cross(upper[#upper - 1], upper[#upper], p) <= 0 do
			table.remove(upper)
		end
		table.insert(upper, p)
	end
	table.remove(lower)
	table.remove(upper)
	for _, p in upper do
		table.insert(lower, p)
	end
	return lower
end

local function rgb(c): (number, number, number)
	return math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5)
end

-- ---------- 3D ----------
function Snap.world(ws, w: number, h: number, sky, zoom: number?)
	local img = newImg(w, h, sky and sky[1] or 8, sky and sky[2] or 6, sky and sky[3] or 14)
	local cam = ws.CurrentCamera
	local camCF = cam.CFrame
	local fov = 2 * math.atan(math.tan(math.rad(cam.FieldOfView) / 2) / (zoom or 1))
	local th = math.tan(fov / 2)
	local aspect = w / h
	local camPos = camCF.Position
	local L = (camCF.Position * 0 + require("@lune/roblox").Vector3.new(0.35, 1, 0.45)).Unit
	local prims = {}
	local function project(p)
		local rel = camCF:PointToObjectSpace(p)
		local z = -rel.Z
		if z < 0.1 then
			return nil
		end
		return { (rel.X / (z * th * aspect) * 0.5 + 0.5) * w, (0.5 - rel.Y / (z * th) * 0.5) * h, z }
	end
	local function add(pts2, depth, col, alpha, shade, neon)
		local r, g, b = rgb(col)
		if not neon then
			r, g, b = r * shade, g * shade, b * shade
		end
		table.insert(prims, {
			pts = pts2,
			depth = depth,
			r = math.min(255, math.floor(r)),
			g = math.min(255, math.floor(g)),
			b = math.min(255, math.floor(b)),
			a = alpha,
		})
	end
	for _, d in ws:GetDescendants() do
		if not d:IsA("BasePart") then
			continue
		end
		local cf = d.CFrame
		if cf.Position.Y < -200 or d.Transparency >= 0.99 then
			continue
		end
		local size = d.Size
		local hx, hy, hz = size.X / 2, size.Y / 2, size.Z / 2
		-- ground plates first, whatever their centre depth
		local ground = size.X > 60 and size.Z > 60
		local neon = d.Material.Name == "Neon"
		local alpha = 1 - d.Transparency
		local col = d.Color
		local mesh = d:FindFirstChildOfClass("SpecialMesh")
		local isWedge = d:IsA("WedgePart")
		local shape = if isWedge then "Wedge" elseif mesh then "Ellipsoid" else d.Shape.Name
		if shape == "Block" or shape == "Wedge" then
			local V = function(x, y, z)
				return cf * require("@lune/roblox").Vector3.new(x, y, z)
			end
			local faces
			if shape == "Block" then
				faces = {
					{ V(hx, -hy, -hz), V(hx, hy, -hz), V(hx, hy, hz), V(hx, -hy, hz) },
					{ V(-hx, -hy, hz), V(-hx, hy, hz), V(-hx, hy, -hz), V(-hx, -hy, -hz) },
					{ V(-hx, hy, -hz), V(-hx, hy, hz), V(hx, hy, hz), V(hx, hy, -hz) },
					{ V(-hx, -hy, hz), V(-hx, -hy, -hz), V(hx, -hy, -hz), V(hx, -hy, hz) },
					{ V(-hx, -hy, hz), V(hx, -hy, hz), V(hx, hy, hz), V(-hx, hy, hz) },
					{ V(hx, -hy, -hz), V(-hx, -hy, -hz), V(-hx, hy, -hz), V(hx, hy, -hz) },
				}
			else
				-- Roblox wedge: slope from the top back edge (+Y, +Z... ) to the bottom front: top face at -Z side missing
				faces = {
					{ V(-hx, -hy, hz), V(hx, -hy, hz), V(hx, hy, hz), V(-hx, hy, hz) },
					{ V(-hx, -hy, -hz), V(hx, -hy, -hz), V(hx, -hy, hz), V(-hx, -hy, hz) },
					{ V(-hx, -hy, -hz), V(-hx, hy, hz), V(hx, hy, hz), V(hx, -hy, -hz) },
					{ V(hx, -hy, -hz), V(hx, -hy, hz), V(hx, hy, hz) },
					{ V(-hx, -hy, -hz), V(-hx, hy, hz), V(-hx, -hy, hz) },
				}
			end
			for _, f in faces do
				local c = f[1]
				for i = 2, #f do
					c += f[i]
				end
				c /= #f
				local nrm = (f[2] - f[1]):Cross(f[3] - f[1])
				if nrm.Magnitude < 1e-9 then
					continue
				end
				nrm = nrm.Unit
				if nrm:Dot(camPos - c) < 0 then
					nrm = -nrm
				end
				local shade = 0.45 + 0.6 * math.max(0, nrm:Dot(L))
				-- clip against the near plane in view space, then project
				local vs = {}
				for _, p in f do
					local rel = camCF:PointToObjectSpace(p)
					table.insert(vs, { rel.X, rel.Y, -rel.Z })
				end
				local clipped = {}
				local NEAR = 0.5
				for i = 1, #vs do
					local a, b = vs[i], vs[i % #vs + 1]
					local ain, bin = a[3] >= NEAR, b[3] >= NEAR
					if ain then
						table.insert(clipped, a)
					end
					if ain ~= bin then
						local t = (NEAR - a[3]) / (b[3] - a[3])
						table.insert(clipped, { a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, NEAR })
					end
				end
				local pts = {}
				for _, v in clipped do
					table.insert(
						pts,
						{ (v[1] / (v[3] * th * aspect) * 0.5 + 0.5) * w, (0.5 - v[2] / (v[3] * th) * 0.5) * h, v[3] }
					)
				end
				local ok = #pts >= 3
				if ok then
					local cz = project(c)
					add(pts, if ground then 1e9 else (cz and cz[3] or 0), col, alpha, shade, neon)
				end
			end
		else
			-- round shapes: convex outline of sampled points
			local pts = {}
			local V3 = require("@lune/roblox").Vector3
			local N = 18
			for i = 0, N - 1 do
				local a = i / N * math.pi * 2
				local ca, sa = math.cos(a), math.sin(a)
				local list
				if shape == "Cylinder" then
					list = {
						V3.new(hx, ca * hy, sa * hz),
						V3.new(-hx, ca * hy, sa * hz),
					}
				else
					local r = if shape == "Ball" then math.min(hx, hy, hz) else nil
					local ax, ay, az = r or hx, r or hy, r or hz
					list = {
						V3.new(ca * ax, sa * ay, 0),
						V3.new(ca * ax, 0, sa * az),
						V3.new(0, ca * ay, sa * az),
					}
				end
				for _, lp in list do
					local q = project(cf * lp)
					if q then
						table.insert(pts, q)
					end
				end
			end
			local cz = project(cf.Position)
			if #pts >= 3 and cz then
				local up = cf:VectorToWorldSpace(V3.new(1, 0, 0))
				local shade = if shape == "Cylinder" then 0.55 + 0.5 * math.abs(up.Y) else 0.85
				add(hull(pts), cz[3], col, alpha, shade, neon)
				if shape ~= "Cylinder" and not neon and alpha > 0.9 then
					-- a small highlight towards the light
					local hpts = {}
					for _, p in pts do
						table.insert(hpts, { cz[1] + (p[1] - cz[1]) * 0.45, cz[2] + (p[2] - cz[2]) * 0.45 - 1, p[3] })
					end
					add(hull(hpts), cz[3] - 0.01, col, 0.35, 1.25, false)
				end
			end
		end
	end
	table.sort(prims, function(a, b)
		return a.depth > b.depth
	end)
	for _, p in prims do
		fillPoly(img, p.pts, p.r, p.g, p.b, p.a)
	end
	return img
end

-- ---------- UI ----------
local function udim(u, size: number): number
	return u.Scale * size + u.Offset
end

local function isGui(d): boolean
	return d:IsA("GuiObject")
end

local function drawGui(img: Img, g, x: number, y: number, w: number, h: number, scale: number)
	-- layouts of the children
	local list = g:FindFirstChildOfClass("UIListLayout")
	local grid = g:FindFirstChildOfClass("UIGridLayout")
	local pad = g:FindFirstChildOfClass("UIPadding")
	local px, py, pw, ph = x, y, w, h
	if pad then
		local l, r = udim(pad.PaddingLeft, w) * scale, udim(pad.PaddingRight, w) * scale
		local t, b = udim(pad.PaddingTop, h) * scale, udim(pad.PaddingBottom, h) * scale
		px, py, pw, ph = x + l, y + t, w - l - r, h - t - b
	end
	local kids = {}
	for _, c in g:GetChildren() do
		if isGui(c) and c.Visible then
			table.insert(kids, c)
		end
	end
	if list or grid then
		table.sort(kids, function(a, b)
			return a.LayoutOrder < b.LayoutOrder
		end)
	end
	local cursor = 0
	local col, row, rowH = 0, 0, 0
	for _, c in kids do
		local cw = udim(c.Size.X, pw / scale) * scale
		local ch = udim(c.Size.Y, ph / scale) * scale
		local cx, cy
		if grid then
			local cell = grid.CellSize
			cw, ch = udim(cell.X, pw / scale) * scale, udim(cell.Y, ph / scale) * scale
			local gap = udim(grid.CellPadding.X, pw / scale) * scale
			local per = math.max(1, math.floor((pw + gap) / (cw + gap)))
			cx = px + col * (cw + gap)
			cy = py + row * (ch + udim(grid.CellPadding.Y, ph / scale) * scale)
			col += 1
			if col >= per then
				col = 0
				row += 1
			end
		elseif list then
			local gap = list.Padding.Offset * scale
				+ list.Padding.Scale * (if list.FillDirection.Name == "Horizontal" then pw else ph)
			if list.FillDirection.Name == "Horizontal" then
				cx = px + cursor
				cy = py
				local va = list.VerticalAlignment.Name
				if va == "Center" then
					cy = py + (ph - ch) / 2
				elseif va == "Bottom" then
					cy = py + ph - ch
				end
				cursor += cw + gap
			else
				cy = py + cursor
				local ha = list.HorizontalAlignment.Name
				cx = if ha == "Center" then px + (pw - cw) / 2 elseif ha == "Right" then px + pw - cw else px
				cursor += ch + gap
			end
		else
			local pos = c.Position
			cx = px + udim(pos.X, pw / scale) * scale - c.AnchorPoint.X * cw
			cy = py + udim(pos.Y, ph / scale) * scale - c.AnchorPoint.Y * ch
		end
		-- background
		if c.BackgroundTransparency < 0.99 and not c:IsA("ScrollingFrame") then
			local r, gg, b = rgb(c.BackgroundColor3)
			fillPoly(
				img,
				{ { cx, cy }, { cx + cw, cy }, { cx + cw, cy + ch }, { cx, cy + ch } },
				r,
				gg,
				b,
				1 - c.BackgroundTransparency
			)
		end
		if c:IsA("TextLabel") or c:IsA("TextButton") then
			local text = c.Text
			if #text > 0 and c.TextTransparency < 0.9 then
				local ts = (if c.TextScaled then math.min(ch * 0.7, 28) else c.TextSize) * scale
				local tw = math.min(cw, utf8.len(text) or #text) * 0
					+ math.min(cw - 4, (utf8.len(text) or #text) * ts * 0.5)
				local tx = cx + 2
				local xa = c.TextXAlignment.Name
				if xa == "Center" then
					tx = cx + (cw - tw) / 2
				elseif xa == "Right" then
					tx = cx + cw - tw - 2
				end
				local ty = cy + (ch - ts * 0.6) / 2
				if c.TextYAlignment.Name == "Top" then
					ty = cy + 2
				end
				local r, gg, b = rgb(c.TextColor3)
				fillPoly(
					img,
					{ { tx, ty }, { tx + tw, ty }, { tx + tw, ty + ts * 0.6 }, { tx, ty + ts * 0.6 } },
					r,
					gg,
					b,
					0.85
				)
			end
		end
		if cx + cw > -1 and cy + ch > -1 then
			drawGui(img, c, cx, cy, cw, ch, scale)
		end
	end
end

function Snap.ui(img: Img, playerGui, inset: number?)
	local guis = {}
	for _, g in playerGui:GetChildren() do
		if g:IsA("ScreenGui") and g.Enabled then
			table.insert(guis, g)
		end
	end
	table.sort(guis, function(a, b)
		return a.DisplayOrder < b.DisplayOrder
	end)
	for _, g in guis do
		local sc = g:FindFirstChildOfClass("UIScale")
		local s = if sc then sc.Scale else 1
		local top = if g.IgnoreGuiInset then 0 else (inset or 36)
		drawGui(img, g, 0, top, img.w, img.h - top, s)
	end
end

function Snap.save(img: Img, pngPath: string)
	local header = string.format("P6\n%d %d\n255\n", img.w, img.h)
	local ppm = pngPath .. ".ppm"
	fs.writeFile(ppm, header .. buffer.tostring(img.buf))
	local res = process.exec("ffmpeg", { "-loglevel", "error", "-y", "-i", ppm, pngPath })
	fs.removeFile(ppm)
	assert(res.ok, res.stderr)
end

return Snap
