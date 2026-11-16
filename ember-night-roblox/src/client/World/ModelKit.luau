-- Placeholder models (R1): one ball per enemy, a block hero with a ball head. Final primitive models follow in R3
-- (docs/DESIGN.md §4.3). Sizes follow the sim radius (1 px = 0.1 stud).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Enemies = require(Shared.Sim.Data.Enemies)
local Heroes = require(Shared.Sim.Data.Heroes)
local Stages = require(Shared.Sim.Data.Stages)
local Coords = require(script.Parent.Coords)

local ModelKit = {}

local bossR: { [string]: number } = {}
local bossTint: { [string]: string } = {}
for _, s in Stages.list do
	for _, b in s.bosses do
		bossR[b.name] = b.r
		bossTint[b.name] = b.tint
	end
end

-- enemy body radius in studs
function ModelKit.enemyRadius(etype: string, elite: boolean, bossName: string?): number
	if bossName and bossR[bossName] then
		return bossR[bossName] * Coords.S
	end
	local d = Enemies.byId[etype]
	local r = if d then d.r else 30
	if elite then
		r *= 1.55
	end
	return r * Coords.S
end

-- enemy body colour (land tint > base colour)
function ModelKit.enemyColor(etype: string, tints: { [string]: string }?, bossName: string?): Color3
	if bossName and bossTint[bossName] then
		return Coords.color(bossTint[bossName])
	end
	local hex = (tints and tints[etype]) or Enemies.COLORS[etype] or "#ffffff"
	return Coords.color(hex)
end

function ModelKit.heroColor(heroId: string?): Color3
	local h = heroId and Heroes.byId[heroId]
	return Coords.color(if h then h.color else "#4f8cff")
end

return ModelKit
