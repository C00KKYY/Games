-- End of a run per player and achievements (web checkAchievements, recordClear, endRun). Works on one player's
-- run view (Run.playerView) and his profile table; mutates the profile (pure, no services).
local Achievements = if script then require(script.Parent.Data.Achievements) else require("./Data/Achievements")
local Heroes = if script then require(script.Parent.Data.Heroes) else require("./Data/Heroes")
local Stages = if script then require(script.Parent.Data.Stages) else require("./Data/Stages")
local Heat = if script then require(script.Parent.Data.Heat) else require("./Data/Heat")
local Profile = if script then require(script.Parent.Profile) else require("./Profile")
local Util = if script then require(script.Parent.Util) else require("./Util")
local Run = if script then require(script.Parent.Run) else require("./Run")

local Results = {}

local function count(t): number
	local n = 0
	for _ in t do
		n += 1
	end
	return n
end

-- check functions by achievement id: (r = run view, s = profile)
local CHECK = {
	t1 = function(r)
		return r.t >= 60
	end,
	t5 = function(r)
		return r.t >= 300
	end,
	t10 = function(r)
		return r.t >= 600
	end,
	win = function(r)
		return r.won
	end,
	stage3 = function(_, s)
		return Profile.stageBest(s, "frostlake") >= 0
	end,
	night = function(_, s)
		return Profile.stageBest(s, "nightheart") >= 0
	end,
	stars10 = function(_, s)
		return Profile.totalStars(s) >= 10
	end,
	stars15 = function(_, s)
		return Profile.totalStars(s) >= 15
	end,
	lvl10 = function(r)
		return r.level >= 10
	end,
	lvl20 = function(r)
		return r.level >= 20
	end,
	lvl40 = function(r)
		return r.level >= 40
	end,
	lvl60 = function(r)
		return r.level >= 60
	end,
	kill500 = function(r)
		return r.kills >= 500
	end,
	kill2000 = function(r)
		return r.kills >= 2000
	end,
	kill5000 = function(r)
		return r.kills >= 5000
	end,
	kills3000 = function(_, s)
		return s.stats.kills >= 3000
	end,
	kills25k = function(_, s)
		return s.stats.kills >= 25000
	end,
	evo1 = function(_, s)
		return s.stats.evolutions >= 1
	end,
	evo3 = function(_, s)
		return count(s.evolved) >= 3
	end,
	evoall = function(_, s)
		return count(s.evolved) >= 9
	end,
	evo2run = function(r)
		return r.evolvedCount >= 2
	end,
	boss_slimeking = function(_, s)
		return s.bosses.slimeking == true
	end,
	boss_bonelord = function(_, s)
		return s.bosses.bonelord == true
	end,
	boss_bloodcount = function(_, s)
		return s.bosses.bloodcount == true
	end,
	boss_colossus = function(_, s)
		return s.bosses.colossus == true
	end,
	chest10 = function(_, s)
		return s.stats.chests >= 10
	end,
	gold2000 = function(_, s)
		return s.stats.goldEarned >= 2000
	end,
	nohit3 = function(r)
		return r.t >= 180 and r.firstHit == nil
	end,
	full = function(r)
		return #r.weapons >= 6 and #r.passives >= 6
	end,
	heat3 = function(r)
		return r.won and r.heat >= 3
	end,
	heat5 = function(r)
		return r.won and r.heat >= 5
	end,
}
Results.CHECK = CHECK

-- move lifetime counters gathered in the run (not yet booked) into the profile
function Results.bank(run, slot: number, profile)
	local pl = run.players[slot]
	if not pl then
		return
	end
	local b = pl.bank
	local st = profile.stats
	st.kills += b.kills
	st.evolutions += b.evolutions
	st.chests += b.chests
	st.bossKills += b.bossKills
	st.revivesGiven += b.revivesGiven
	b.kills, b.evolutions, b.chests, b.bossKills, b.revivesGiven = 0, 0, 0, 0, 0
	for id in b.bosses do
		profile.bosses[id] = true
	end
	for id in b.evolved do
		profile.evolved[id] = true
	end
	table.clear(b.bosses)
	table.clear(b.evolved)
end

-- returns the list of newly earned achievement ids (gold and hero unlocks applied to the profile)
function Results.checkAchievements(run, slot: number, profile): { string }
	Results.bank(run, slot, profile)
	local r = Run.playerView(run, slot)
	local out = {}
	for _, a in Achievements.list do
		if not profile.achievements[a.id] then
			local f = CHECK[a.id]
			local ok = false
			if f then
				local good, res = pcall(f, r, profile)
				ok = good and res == true
			end
			if ok then
				profile.achievements[a.id] = true
				profile.gold += a.gold
				profile.stats.goldEarned += a.gold
				table.insert(out, a.id)
				for _, hid in Heroes.ORDER do
					if Heroes.byId[hid].unlock == a.id and not table.find(profile.chars, hid) then
						table.insert(profile.chars, hid)
					end
				end
			end
		end
	end
	return out
end

-- land cleared: best heat, stars and unlocks (for the victory screen)
function Results.recordClear(run, slot: number, profile)
	local id = run.stage.id
	local idx = run.stageIdx
	local nextS = Stages.list[idx + 1]
	local starsBefore = Profile.stageStars(profile, id)
	local heatBefore = Profile.stageMaxHeat(profile, id)
	local nextBefore = if nextS then Profile.stageUnlocked(profile, idx + 1) else true
	profile.stages[id] = math.max(Profile.stageBest(profile, id), run.heat)
	profile.stats.wins += 1
	local pl = run.players[slot]
	if pl then
		pl.cleared = true
	end
	return {
		starsBefore = starsBefore,
		stars = Profile.stageStars(profile, id),
		newStage = if nextS and not nextBefore then nextS.id else nil,
		newHeat = if Profile.stageMaxHeat(profile, id) > heatBefore then Profile.stageMaxHeat(profile, id) else 0,
		last = nextS == nil,
	}
end

-- web endRun for one player: gold (collected + time bonus + boss bonus [+ x2 pass] + first-run gift), records,
-- achievements. opts = { gold2x = bool }. Returns the summary for the results screen.
function Results.finish(run, slot: number, profile, opts)
	opts = opts or {}
	local pl = run.players[slot]
	local r = Run.playerView(run, slot)
	if run.won and pl and not pl.cleared then
		Results.recordClear(run, slot, profile)
	end
	local mul = Heat.list[run.heat + 1].gold
	local timeBonus = Util.round(math.floor(r.t / 60) * 6 * mul)
	local bossBonus = Util.round(run.bossKills * 25 * mul)
	local runGold = r.gold + timeBonus + bossBonus
	local pass2x = if opts.gold2x then runGold else 0
	local cheapest = Profile.cheapestForgePrice(profile)
	local gift = 0
	if not profile.giftGiven then
		gift = math.max(0, cheapest - profile.gold - runGold - pass2x)
	end
	profile.giftGiven = true
	local total = runGold + pass2x + gift
	profile.gold += total
	profile.stats.goldEarned += total
	profile.stats.runs += 1
	if r.coop then
		profile.stats.coopRuns += 1
	end
	profile.stats.playTime += r.t
	profile.stats.bestTime = math.max(profile.stats.bestTime, r.t)
	profile.stats.bestLevel = math.max(profile.stats.bestLevel, r.level)
	profile.stats.bestKills = math.max(profile.stats.bestKills, r.kills)
	if pl then
		profile.lastChar = pl.heroId
	end
	local ach = Results.checkAchievements(run, slot, profile)
	return {
		won = run.won,
		t = r.t,
		level = r.level,
		kills = r.kills,
		ownKills = r.ownKills,
		collected = r.gold,
		timeBonus = timeBonus,
		bossBonus = bossBonus,
		pass2x = pass2x,
		gift = gift,
		heatMul = mul,
		total = total,
		achievements = ach,
		heroId = r.heroId,
		dmgBy = r.dmgBy,
	}
end

return Results
