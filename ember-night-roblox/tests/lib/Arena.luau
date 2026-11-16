-- The whole client (src/client/App.luau with every arena view, HUD and audio module) on Lune's Roblox Instances,
-- connected to the real server services on the fake runtime (tests/lib/Roblox.luau): snapshots, event buffers and Ui
-- messages go through the real Codec exactly as over the remotes, commands go through Validate, Move packets
-- through Codec.encodeMove/decodeMove. Used by tests/arena.spec.luau.
local Roblox = require("./Roblox")
local Codec = require("../../src/shared/Net/Codec")
local Interp = require("../../src/client/Net/Interp")
local Tuning = require("../../src/shared/Config/Tuning")
local Validate = require("../../src/shared/Server/Validate")

local Arena = {}
Arena.__index = Arena

-- n players join; player 1 (UserId 1) is the local client
function Arena.new(n: number?)
	local rb = Roblox.new()
	local net = rb:fakeNet()
	rb.net = net
	rb.deps = rb:server("Services/Boot").start(net)
	local self = setmetatable({ rb = rb, net = net, players = {}, evListeners = {}, uiListeners = {}, bad = {} }, Arena)
	for uid = 1, n or 1 do
		table.insert(self.players, rb:join(uid))
	end
	local me = self.players[1]
	self.me = me
	-- client side of the remotes
	local cnet = {
		interp = Interp.new(Tuning.INTERP_DELAY * Tuning.SIM_HZ, Tuning.SIM_HZ),
		moveAcc = 0,
		seq = 0,
		sentMoves = 0,
	}
	function cnet.onEvent(fn)
		table.insert(self.evListeners, fn)
	end
	function cnet.onUi(t, fn)
		self.uiListeners[t] = self.uiListeners[t] or {}
		table.insert(self.uiListeners[t], fn)
	end
	function cnet.command(raw)
		local c = Validate.command(raw)
		if not c then
			table.insert(self.bad, tostring(raw.op))
			return
		end
		net.handlers.command(me, c)
	end
	function cnet.query(what)
		return net.handlers.query and net.handlers.query(me, what)
	end
	function cnet.sendMove(dt, x, y, dx, dy, moving)
		cnet.moveAcc += dt
		if cnet.moveAcc < 1 / Tuning.MOVE_HZ then
			return
		end
		cnet.moveAcc = 0
		cnet.seq = (cnet.seq + 1) % 65536
		local m = Codec.decodeMove(Codec.encodeMove(cnet.seq, x, y, dx, dy, moving))
		if m and net.handlers.move then
			cnet.sentMoves += 1
			net.handlers.move(me, m)
		end
	end
	function cnet.init() end
	self.cnet = cnet
	-- server -> client
	local uiRecord = net.ui
	net.ui = function(player, msg)
		uiRecord(player, msg)
		if player == me then
			local list = self.uiListeners[msg.t]
			if list then
				for _, fn in list do
					rb.S.task.spawn(fn, msg)
				end
			end
		end
	end
	net.uiAll = function(msg)
		for _, p in rb.Players.list do
			net.ui(p, msg)
		end
	end
	net.ev = function(player, b)
		if player ~= me then
			return
		end
		local evs = Codec.decodeEvents(b)
		for _, e in evs do
			for _, fn in self.evListeners do
				fn(e)
			end
		end
	end
	net.snap = function(player, b)
		if player == me then
			cnet.interp:push(Codec.decodeSnapshot(b))
		end
	end
	self.App = rb:client("App")
	self.App.start(cnet)
	rb:advance(1)
	return self
end

function Arena:client(name: string)
	return self.rb:client(name)
end

-- one server step (1/30 s) and one client frame of the same length
function Arena:frame(god: boolean?)
	local run = self.rb.deps.RunHost.current()
	if god and run then
		for _, p in run.plist do
			p.iframe = 1e9
			if p.state == "active" then
				p.hp = p.stats.maxHp
			end
		end
	end
	self.rb:advance(1 / 30, true)
	self.App.frame(1 / 30)
end

-- answer the solo dialogs like a player: card 1 by its key binding, the chest's Continue button
function Arena:answerDialogs()
	local run = self:run()
	if not run then
		return
	end
	local mine = run.players[1]
	if mine and mine.offer and self.rb.boundActions.EN_card1 then
		self.rb.boundActions.EN_card1("EN_card1", Roblox.Enum.UserInputState.Begin)
	end
	if run.state == "chest" then
		for _, g in self.rb.playerGui:GetChildren() do
			if g.Name == "EN_Cards" then
				for _, b in Roblox.buttons(g) do
					self.rb:click(b)
				end
			end
		end
	end
end

function Arena:frames(seconds: number, god: boolean?, each: ((number) -> ())?)
	for i = 1, math.floor(seconds * 30 + 0.5) do
		self:frame(god)
		if i % 6 == 0 then
			self:answerDialogs()
		end
		if each then
			each(i)
		end
	end
end

function Arena:run()
	return self.rb.deps.RunHost.current()
end

function Arena:errors(): { string }
	return self.rb:errors()
end

-- every arena part that is not parked in a pool (Pool.FAR is at Y = -300)
function Arena:visibleParts(): number
	local n = 0
	for _, d in self.rb.workspace:GetDescendants() do
		if d:IsA("BasePart") and d.CFrame.Position.Y > -200 then
			n += 1
		end
	end
	return n
end

function Arena:count(class: string): number
	local n = 0
	for _, d in self.rb.workspace:GetDescendants() do
		if d:IsA(class) then
			n += 1
		end
	end
	return n
end

Arena.Roblox = Roblox
Roblox.Enum = require("@lune/roblox").Enum
return Arena
