-- Robux revive ("Second Ember", docs/DESIGN.md §2.8 points 5-6, §7.3 point 5). Pure: works on the run and the
-- player's profile. A purchase adds a token to the profile (persistent, idempotent); a token is consumed only when it
-- actually revives the player, at most REVIVE_MAX_PER_RUN times per player and run (enforced by the sim).
local Run = if script then require(script.Parent.Parent.Sim.Run) else require("../Sim/Run")

local ReviveFlow = {}

-- what the downed screen offers: use = a stored token can revive now, buy = the product may be prompted
function ReviveFlow.offer(
	run,
	slot: number,
	profile,
	productConfigured: boolean
): { use: boolean, buy: boolean, tokens: number }
	local can = run ~= nil and Run.canRobuxRevive(run, slot)
	local tokens = if profile then profile.reviveTokens else 0
	return {
		use = can and tokens > 0,
		buy = can and tokens == 0 and productConfigured,
		tokens = tokens,
	}
end

-- keep the sim's offer flag in line with the profile and the product configuration
function ReviveFlow.sync(run, slot: number, profile, productConfigured: boolean)
	Run.setReviveOffer(run, slot, productConfigured or (profile ~= nil and profile.reviveTokens > 0))
end

-- consume one token and revive; false (token kept) when the player cannot be revived now
function ReviveFlow.useToken(run, slot: number, profile): boolean
	if not run or not profile or profile.reviveTokens <= 0 or not Run.canRobuxRevive(run, slot) then
		return false
	end
	if Run.command(run, slot, { op = "revive" }) then
		profile.reviveTokens -= 1
		return true
	end
	return false
end

return ReviveFlow
