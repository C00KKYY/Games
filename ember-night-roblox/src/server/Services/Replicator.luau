-- Replication (docs/DESIGN.md §3.5): per step one event buffer per client (Ev, reliable), every second step the
-- snapshot packets (Snap, unreliable, interest region around the recipient's hero), Ui messages for sim events
-- (routed per player), own-hero state at most 10 Hz, run clock and boss bar at ~4 Hz.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Codec = require(Shared.Net.Codec)
local Views = require(Shared.Net.Views)

local Replicator = {}

local net: any = nil
local slots: { [Player]: number } = {}
local spectators: { [Player]: boolean } = {}
local heroSig: { [Player]: string } = {}

function Replicator.begin(_run, s: { [Player]: number }, Net)
	net = Net
	slots = s
	table.clear(spectators)
	table.clear(heroSig)
end

function Replicator.addSpectator(player: Player)
	spectators[player] = true
end

function Replicator.removeSpectator(player: Player)
	spectators[player] = nil
	heroSig[player] = nil
end

function Replicator.removePlayer(player: Player)
	heroSig[player] = nil
end

function Replicator.finish()
	table.clear(spectators)
	table.clear(heroSig)
end

-- where a recipient looks: his own hero, or (downed/fallen/spectating) the first active teammate
local function origin(run, slot: number?)
	local pl = slot and run.players[slot]
	if pl and pl.state ~= "fallen" and pl.state ~= "left" then
		return pl.x, pl.y
	end
	local a = run.act[1] or run.plist[1]
	return a.x, a.y
end

local function send(run, player: Player, slot: number?, step: number)
	local ox, oy = origin(run, slot)
	local b = Codec.encodeEvents(run.events, slot or 0, step, ox, oy)
	if b then
		net.ev(player, b)
	end
	local heroNow = false
	for _, e in run.events do
		local msg = Views.uiFromEvent(e, slot)
		if msg and (msg.slot == nil or msg.slot == slot or msg.t == "down" or msg.t == "revived" or msg.t == "left" or msg.t == "vote") then
			net.ui(player, msg)
		end
		if slot and e.slot == slot and (e.k == "build" or e.k == "levelup" or e.k == "down" or e.k == "revived") then
			heroNow = true
		end
	end
	if step % 2 == 0 then
		for _, pk in Codec.encodeSnapshot(run, step, ox, oy) do
			net.snap(player, pk)
		end
	end
	if slot then
		local pl = run.players[slot]
		if pl and (heroNow or step % 3 == 0) then
			local sig = Views.heroSig(run, pl)
			if heroNow or sig ~= heroSig[player] then
				heroSig[player] = sig
				net.ui(player, Views.hero(run, pl))
			end
		end
	end
end

function Replicator.afterStep(run, step: number)
	for player, slot in slots do
		if player.Parent then
			send(run, player, slot, step)
		end
	end
	for player in spectators do
		if player.Parent then
			send(run, player, nil, step)
		end
	end
	if step % 8 == 0 then
		local info = Views.runInfo(run)
		for player in slots do
			net.ui(player, info)
		end
		for player in spectators do
			net.ui(player, info)
		end
	end
end

return Replicator
