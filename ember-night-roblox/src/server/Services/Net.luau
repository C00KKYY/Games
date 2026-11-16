-- Remotes (docs/DESIGN.md §3.1): creates ReplicatedStorage.Remotes, rate-limits and validates everything that comes
-- from clients, and offers send helpers. Other services register handlers in Net.handlers.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Protocol = require(Shared.Net.Protocol)
local Codec = require(Shared.Net.Codec)
local RateLimit = require(Shared.Server.RateLimit)
local Validate = require(Shared.Server.Validate)

local Net = {}

Net.handlers = {
	move = nil :: ((Player, any) -> ())?,
	command = nil :: ((Player, any) -> ())?,
	query = nil :: ((Player, string) -> any)?,
}

local remotes: { [string]: Instance } = {}
local moveLimit = RateLimit.new(30, 30)
local cmdLimit = RateLimit.new(20, 20)
local queryLimit = RateLimit.new(4, 8)

function Net.init()
	local folder = Instance.new("Folder")
	folder.Name = "Remotes"
	for name, class in Protocol.REMOTES do
		local r = Instance.new(class)
		r.Name = name
		r.Parent = folder
		remotes[name] = r
	end
	folder.Parent = ReplicatedStorage

	local move = remotes.Move :: UnreliableRemoteEvent
	move.OnServerEvent:Connect(function(player: Player, b: any)
		if not moveLimit:allow(player, os.clock()) then
			return
		end
		local m = Codec.decodeMove(b)
		if m and Net.handlers.move then
			Net.handlers.move(player, m)
		end
	end)

	local cmd = remotes.Cmd :: RemoteEvent
	cmd.OnServerEvent:Connect(function(player: Player, raw: any)
		if not cmdLimit:allow(player, os.clock()) then
			return
		end
		local c = Validate.command(raw)
		if c and Net.handlers.command then
			Net.handlers.command(player, c)
		end
	end)

	local query = remotes.Query :: RemoteFunction
	query.OnServerInvoke = function(player: Player, what: any)
		if type(what) ~= "string" or not queryLimit:allow(player, os.clock()) then
			return nil
		end
		if Net.handlers.query then
			return Net.handlers.query(player, what)
		end
		return nil
	end

	Players.PlayerRemoving:Connect(function(player)
		moveLimit:forget(player)
		cmdLimit:forget(player)
		queryLimit:forget(player)
	end)
end

function Net.ui(player: Player, msg: { [string]: any })
	(remotes.Ui :: RemoteEvent):FireClient(player, msg)
end

function Net.uiAll(msg: { [string]: any })
	(remotes.Ui :: RemoteEvent):FireAllClients(msg)
end

function Net.ev(player: Player, b: buffer)
	(remotes.Ev :: RemoteEvent):FireClient(player, b)
end

function Net.snap(player: Player, b: buffer)
	(remotes.Snap :: UnreliableRemoteEvent):FireClient(player, b)
end

return Net
