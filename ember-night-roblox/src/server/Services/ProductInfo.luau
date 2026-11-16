-- Live Robux prices (docs/DESIGN.md §7.1): MarketplaceService product info for every configured product and pass,
-- cached for 10 minutes and refreshed in the background. Items whose info cannot be fetched are hidden by the shop.
local MarketplaceService = game:GetService("MarketplaceService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Products = require(Shared.Config.Products)

local ProductInfo = {}

ProductInfo.CACHE_TIME = 600

local cache: { [string]: { price: number?, t: number } } = {}
local fetching: { [string]: boolean } = {}

-- GetProductInfoAsync is the current name; older engines only know GetProductInfo (same arguments)
local function fetch(id: number, infoType: Enum.InfoType): any
	local ok, res = pcall(function()
		return (MarketplaceService :: any):GetProductInfoAsync(id, infoType)
	end)
	if not ok then
		ok, res = pcall(function()
			return (MarketplaceService :: any):GetProductInfo(id, infoType)
		end)
	end
	return if ok then res else nil
end

local function refresh(it: Products.Item)
	if fetching[it.key] then
		return
	end
	fetching[it.key] = true
	local info = fetch(it.id, if it.kind == "pass" then Enum.InfoType.GamePass else Enum.InfoType.Product)
	local price = nil
	if type(info) == "table" and type(info.PriceInRobux) == "number" and info.PriceInRobux > 0 then
		local forSale = info.IsForSale
		if forSale ~= false then
			price = info.PriceInRobux
		end
	end
	local old = cache[it.key]
	-- a failed refresh keeps the last known price (Roblox web hiccups should not empty the shop)
	if price or not old then
		cache[it.key] = { price = price, t = os.clock() }
	else
		old.t = os.clock() - ProductInfo.CACHE_TIME + 60 -- retry in a minute
	end
	fetching[it.key] = nil
end

-- live price in Robux, or nil (not configured / not for sale / not fetched yet)
function ProductInfo.price(key: string): number?
	local it = Products.get(key)
	if not it then
		return nil
	end
	local c = cache[key]
	if not c or os.clock() - c.t > ProductInfo.CACHE_TIME then
		task.spawn(refresh, it)
	end
	return c and c.price
end

-- fetch every configured item once (yields; called in the background at start)
function ProductInfo.warm()
	for _, it in Products.list do
		if it.id > 0 then
			refresh(it)
		end
	end
end

function ProductInfo.init()
	task.spawn(function()
		while true do
			ProductInfo.warm()
			task.wait(ProductInfo.CACHE_TIME)
		end
	end)
end

return ProductInfo
