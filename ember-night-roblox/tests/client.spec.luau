-- Client hub UI smoke test: the real client UI modules (src/client/UI) built with Lune's Roblox Instances (property
-- names are checked against the Roblox API), fed with lobby messages from the real server services on the fake
-- runtime. Every screen is opened and every button clicked; each command goes through Validate to the server.
local T = require("./lib/T")
local Roblox = require("./lib/Roblox")
local Ids = require("./lib/Ids")
local Validate = require("../src/shared/Server/Validate")
local Lang = require("../src/shared/Lang/Lang")

local suite = T.new("client")
local IDS = Ids.all()
local SCREENS = { "heroes", "map", "forge", "wardrobe", "achievements", "stats", "shop", "settings" }

local function setup()
	local rb = Roblox.new()
	local net = rb:fakeNet()
	rb.net = net
	rb.deps = rb:server("Services/Boot").start(net)
	local me = rb:join(1)
	rb:advance(1)
	local sent = {}
	local bad = {}
	local function command(raw)
		table.insert(sent, raw.op)
		if raw.op == "equip" and raw.id ~= "" then
			sent[raw.slot .. ":" .. tostring(raw.id)] = true
		end
		local c = Validate.command(raw)
		if not c then
			table.insert(bad, tostring(raw.op))
			return
		end
		rb.net.handlers.command(me, c)
	end
	local Router = rb:client("UI/Router")
	local Lobby = rb:client("UI/Lobby")
	local ReviveOffer = rb:client("UI/ReviveOffer")
	local Results = rb:client("UI/Results")
	Router.init(command)
	Lobby.init(command, Router.open)
	ReviveOffer.init(command)
	Results.init(function() end)
	local function sync()
		rb:advance(0.1)
		local m = rb:lastUi(me, "lobby")
		Lobby.render(m)
		Router.update(m)
	end
	sync()
	return rb, me, Router, Lobby, ReviveOffer, Results, sync, sent, bad
end

local function sig(b, root): string
	local parts = { b.Text, tostring(b.Position) }
	local p = b.Parent
	while p and p ~= root do
		local ok, lo = pcall(function()
			return p.LayoutOrder
		end)
		table.insert(parts, if ok then tostring(lo) else "-")
		p = p.Parent
	end
	return table.concat(parts, "/")
end

local function guiNamed(rb, name)
	for _, g in rb.playerGui:GetChildren() do
		if g.Name == name then
			return g
		end
	end
	return nil
end

for _, lang in { "de", "en" } do
	suite:test("every hub screen renders and every button sends a valid command (" .. lang .. ")", function()
		Ids.with(IDS, function()
			Lang.setLang(lang)
			local rb, me, Router, _, _, _, sync, sent, bad = setup()
			rb.deps.Profiles.get(me).gold = 50000
			rb.deps.Profiles.get(me).achievements.win = true
			sync()
			for _, name in SCREENS do
				Router.open(name)
				local hub = assert(guiNamed(rb, "EN_Hub"))
				local buttons = Roblox.buttons(hub)
				T.ok(#buttons > 0, name .. ": no buttons")
				-- click each button of a fresh render (a click re-renders the window); buttons are found again by a
				-- signature (layout orders of the ancestors + text), Instance child order is not stable in Lune
				local sigs = {}
				for _, b in buttons do
					table.insert(sigs, sig(b, hub))
				end
				table.sort(sigs)
				for _, want in sigs do
					Router.open(name)
					local h2 = assert(guiNamed(rb, "EN_Hub"))
					for _, b in Roblox.buttons(h2) do
						if sig(b, h2) == want then
							rb:click(b)
							sync()
							break
						end
					end
				end
				T.eq(#rb:errors(), 0, name .. ": " .. table.concat(rb:errors(), "\n"))
			end
			-- the hub bar and the party panel
			for _, b in Roblox.buttons(assert(guiNamed(rb, "EN_HubBar"))) do
				rb:click(b)
			end
			for _, b in Roblox.buttons(assert(guiNamed(rb, "EN_Lobby"))) do
				rb:click(b)
				sync()
			end
			T.eq(#bad, 0, "invalid commands: " .. table.concat(bad, ", "))
			T.eq(#rb:errors(), 0, table.concat(rb:errors(), "\n"))
			local ops = {}
			for _, op in sent do
				ops[op] = true
			end
			for _, op in { "selectHero", "selectStage", "forgeBuy", "equip", "setting", "lang", "buy" } do
				T.ok(ops[op], "no button sent " .. op)
			end
			local prof = rb.deps.Profiles.get(me)
			T.ok(next(prof.shop) ~= nil, "forge levels bought through the UI")
			T.ok(sent["trail:trail_ember"], "free trail from the 'win' achievement offered for equipping")
			T.ok(not sent["trail:trail_star"], "a paid trail that is not owned is never equipped")
			T.ok(#rb.prompts > 0, "purchase prompts opened")
			Lang.setLang("en")
		end)
	end)
end

suite:test("without product ids the shop is empty and no Robux button exists anywhere", function()
	local rb, _, Router = setup()
	for _, name in SCREENS do
		Router.open(name)
		for _, b in Roblox.buttons(assert(guiNamed(rb, "EN_Hub"))) do
			T.ok(not string.find(b.Text, "R$", 1, true), name .. " shows a price: " .. b.Text)
		end
	end
	T.eq(#rb:errors(), 0, table.concat(rb:errors(), "\n"))
end)

suite:test("revive offer and results render", function()
	local rb, _, _, _, ReviveOffer, Results = setup()
	ReviveOffer.show({ use = false, buy = true, tokens = 0, price = 25 })
	local g = assert(guiNamed(rb, "EN_Revive"))
	local bs = Roblox.buttons(g)
	T.eq(#bs, 1)
	T.ok(string.find(bs[1].Text, "R$ 25", 1, true))
	ReviveOffer.show({ use = true, buy = false, tokens = 2 })
	bs = Roblox.buttons(g)
	T.eq(#bs, 1)
	T.ok(string.find(bs[1].Text, "(2)", 1, true))
	ReviveOffer.show({ use = false, buy = false, tokens = 0 })
	T.eq(#Roblox.buttons(g), 0)
	Results.show({
		won = true,
		t = 600,
		level = 30,
		kills = 1234,
		collected = 200,
		timeBonus = 60,
		bossBonus = 75,
		pass2x = 335,
		gift = 0,
		total = 670,
		achievements = { "win" },
	})
	T.eq(#rb:errors(), 0, table.concat(rb:errors(), "\n"))
end)

return suite
