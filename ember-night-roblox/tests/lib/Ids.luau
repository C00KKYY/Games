-- Run a test body with product ids configured, then put every id back to 0 (Products is shared module state).
local Products = require("../../src/shared/Config/Products")

local Ids = {}

function Ids.all(): { [string]: number }
	local ids = {}
	for i, it in Products.list do
		ids[it.key] = (if it.kind == "pass" then 5000 else 9000) + i
	end
	return ids
end

function Ids.with(ids: { [string]: number }, fn: () -> ())
	Products.setIds(ids)
	local ok, err = pcall(fn)
	for _, it in Products.list do
		it.id = 0
	end
	if not ok then
		error(err, 0)
	end
end

function Ids.product(key: string): number
	return Ids.all()[key]
end

return Ids
