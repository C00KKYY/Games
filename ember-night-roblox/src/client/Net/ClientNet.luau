-- Client side of the remotes (docs/DESIGN.md §3.1): decodes snapshots into the interpolator, dispatches event
-- buffers and Ui messages to listeners, sends Move packets at 20 Hz and commands.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Codec = require(Shared.Net.Codec)
local Tuning = require(Shared.Config.Tuning)
local Interp = require(script.Parent.Interp)

local ClientNet = {}

local remotes = ReplicatedStorage:WaitForChild("Remotes")
local moveRemote = remotes:WaitForChild("Move") :: UnreliableRemoteEvent
local snapRemote = remotes:WaitForChild("Snap") :: UnreliableRemoteEvent
local evRemote = remotes:WaitForChild("Ev") :: RemoteEvent
local uiRemote = remotes:WaitForChild("Ui") :: RemoteEvent
local cmdRemote = remotes:WaitForChild("Cmd") :: RemoteEvent
local queryRemote = remotes:WaitForChild("Query") :: RemoteFunction

ClientNet.interp = Interp.new(Tuning.INTERP_DELAY * Tuning.SIM_HZ, Tuning.SIM_HZ)

local evListeners: { (any) -> () } = {}
local uiListeners: { [string]: { (any) -> () } } = {}
local seq = 0
local moveAcc = 0

function ClientNet.onEvent(fn: (any) -> ())
	table.insert(evListeners, fn)
end

function ClientNet.onUi(t: string, fn: (any) -> ())
	uiListeners[t] = uiListeners[t] or {}
	table.insert(uiListeners[t], fn)
end

function ClientNet.command(cmd: { [string]: any })
	cmdRemote:FireServer(cmd)
end

function ClientNet.query(what: string): any
	local ok, res = pcall(function()
		return queryRemote:InvokeServer(what)
	end)
	return if ok then res else nil
end

-- called every frame by the hero controller; sends at MOVE_HZ
function ClientNet.sendMove(dt: number, x: number, y: number, dirX: number, dirY: number, moving: boolean)
	moveAcc += dt
	if moveAcc < 1 / Tuning.MOVE_HZ then
		return
	end
	moveAcc = 0
	seq = (seq + 1) % 65536
	moveRemote:FireServer(Codec.encodeMove(seq, x, y, dirX, dirY, moving))
end

function ClientNet.init()
	snapRemote.OnClientEvent:Connect(function(b)
		if typeof(b) ~= "buffer" then
			return
		end
		local ok, s = pcall(Codec.decodeSnapshot, b)
		if ok and s then
			ClientNet.interp:push(s)
		end
	end)
	evRemote.OnClientEvent:Connect(function(b)
		if typeof(b) ~= "buffer" then
			return
		end
		local ok, evs = pcall(Codec.decodeEvents, b)
		if not ok or not evs then
			warn("[EmberNight] bad event buffer", evs)
			return
		end
		for _, e in evs do
			for _, fn in evListeners do
				fn(e)
			end
		end
	end)
	uiRemote.OnClientEvent:Connect(function(msg)
		if type(msg) ~= "table" or type(msg.t) ~= "string" then
			return
		end
		local list = uiListeners[msg.t]
		if list then
			for _, fn in list do
				task.spawn(fn, msg)
			end
		end
	end)
end

return ClientNet
