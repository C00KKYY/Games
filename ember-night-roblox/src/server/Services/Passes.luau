-- Game pass ownership (docs/DESIGN.md §7.2): checked live with UserOwnsGamePassAsync on join (3 tries per pass),
-- the profile's passCache is the first guess until the check is done. A purchase (PromptGamePassPurchaseFinished
-- with wasPurchased, a server-side event) counts at once; it is not re-checked, because UserOwnsGamePassAsync
-- results are cached per server and can still say "not owned" right after a purchase. Only configured passes
-- (Config/Products.luau, id > 0) exist here.
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Products = require(Shared.Config.Products)

local Passes = {}

local owned: { [Player]: { [string]: boolean } } = {}
local checked: { [Player]: boolean } = {}
local bought: { [Player]: { [string]: boolean } } = {} -- bought on this server (never overridden by a check)
local deps: any = nil

local function userOwns(userId: number, passId: number): boolean?
	for attempt = 1, 3 do
		local ok, res = pcall(function()
			return MarketplaceService:UserOwnsGamePassAsync(userId, passId)
		end)
		if ok then
			return res == true
		end
		if attempt < 3 then
			task.wait(attempt)
		end
	end
	return nil -- unknown
end

local function configuredPasses()
	local out = {}
	for _, it in Products.list do
		if it.kind == "pass" and it.id > 0 then
			table.insert(out, it)
		end
	end
	return out
end

local function check(player: Player)
	if not deps.Profiles.waitLoaded(player, 60) then
		return
	end
	local prof = deps.Profiles.get(player)
	local t = owned[player] or {}
	owned[player] = t
	-- first guess from the cache
	for key in prof.passCache do
		if Products.configured(key) then
			t[key] = true
		end
	end
	deps.Profiles.changed(player)
	for _, it in configuredPasses() do
		local res = userOwns(player.UserId, it.id)
		if not player.Parent then
			return
		end
		if res ~= nil and not (bought[player] and bought[player][it.key]) then
			t[it.key] = res or nil
			prof.passCache[it.key] = res or nil
		end
	end
	checked[player] = true
	deps.Profiles.changed(player)
end

-- confirmed (or cached) pass keys of a player: { [key] = true }
function Passes.get(player: Player): { [string]: boolean }
	return owned[player] or {}
end

function Passes.isChecked(player: Player): boolean
	return checked[player] == true
end

function Passes.init(d)
	deps = d
	Players.PlayerAdded:Connect(check)
	for _, p in Players:GetPlayers() do
		task.spawn(check, p)
	end
	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player: Player, passId: number, wasPurchased: boolean)
		if not wasPurchased then
			return
		end
		local it = Products.byPassId(passId)
		if not it then
			return
		end
		local t = owned[player] or {}
		owned[player] = t
		t[it.key] = true
		bought[player] = bought[player] or {}
		bought[player][it.key] = true
		local prof = deps.Profiles.get(player)
		if prof then
			prof.passCache[it.key] = true
		end
		deps.Net.ui(player, { t = "purchased", key = it.key })
		deps.Profiles.changed(player)
	end)
end

function Passes.onLeave(player: Player)
	owned[player] = nil
	checked[player] = nil
	bought[player] = nil
end

return Passes
