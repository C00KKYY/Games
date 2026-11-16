-- The profile DataStore behind ProfileStore's `backend.update` (docs/DESIGN.md §6.2): UpdateAsync with request
-- budget waits, or an in-memory store in Studio without API access (and with Tuning.FORCE_MEMORY_STORE).
local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Tuning = require(Shared.Config.Tuning)
local Profile = require(Shared.Sim.Profile)

local DataStoreAdapter = {}

DataStoreAdapter.STORE_NAME = "EmberNight_Profiles_v1"
DataStoreAdapter.BUDGET_WAIT_MAX = 10

local memory: { [string]: any } = {}
local useMemory = Tuning.FORCE_MEMORY_STORE == true
local store: DataStore? = nil
local onMemory: { () -> () } = {}

local function switchToMemory(why: string)
	if useMemory then
		return
	end
	useMemory = true
	warn("[EmberNight] profiles are kept in memory only (" .. why .. ")")
	for _, f in onMemory do
		task.spawn(f)
	end
end

-- true while profiles are not really saved (Studio without API access)
function DataStoreAdapter.isMemory(): boolean
	return useMemory
end

function DataStoreAdapter.onMemory(f: () -> ())
	table.insert(onMemory, f)
end

local function memoryUpdate(key: string, transform: (any) -> any): (boolean, any)
	local new = transform(Profile.deepCopy(memory[key]))
	if new ~= nil then
		memory[key] = Profile.deepCopy(new)
	end
	return true, new
end

-- an error that means "this place may not use DataStores" (unpublished place / API access off in Studio)
local function isAccessError(msg: string): boolean
	return string.find(msg, "403", 1, true) ~= nil
		or string.find(msg, "Studio", 1, true) ~= nil
		or string.find(msg, "publish", 1, true) ~= nil
end

local function waitBudget(kind: Enum.DataStoreRequestType)
	local waited = 0
	while waited < DataStoreAdapter.BUDGET_WAIT_MAX do
		local ok, budget = pcall(function()
			return DataStoreService:GetRequestBudgetForRequestType(kind)
		end)
		if not ok or budget > 0 then
			return
		end
		waited += task.wait(0.5)
	end
end

function DataStoreAdapter.init()
	if useMemory then
		return
	end
	if RunService:IsStudio() and game.GameId == 0 then
		switchToMemory("unpublished place in Studio")
		return
	end
	local ok, res = pcall(function()
		return DataStoreService:GetDataStore(DataStoreAdapter.STORE_NAME)
	end)
	if ok then
		store = res
	elseif RunService:IsStudio() then
		switchToMemory(tostring(res))
	else
		warn("[EmberNight] GetDataStore failed: " .. tostring(res))
	end
end

-- ProfileStore backend: UpdateAsync semantics, returns ok, result-or-error
DataStoreAdapter.backend = {
	update = function(key: string, transform: (any) -> any): (boolean, any)
		if useMemory then
			return memoryUpdate(key, transform)
		end
		local ds = store
		if not ds then
			return false, "no DataStore"
		end
		waitBudget(Enum.DataStoreRequestType.UpdateAsync)
		local ok, res = pcall(function()
			return ds:UpdateAsync(key, function(old)
				return transform(old)
			end)
		end)
		if not ok and RunService:IsStudio() and isAccessError(tostring(res)) then
			switchToMemory(tostring(res))
			return memoryUpdate(key, transform)
		end
		return ok, res
	end,
}

return DataStoreAdapter
