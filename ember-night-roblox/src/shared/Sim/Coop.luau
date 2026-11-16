--!strict
-- Co-op scaling with the number of players N (docs/DESIGN.md §2.6). Tune only here.
local Coop = {}

Coop.spawnRate = { 1, 1.6, 2.1, 2.5 }
Coop.spawnCap = { 1, 1.55, 2.0, 2.35 } -- tuned with the bot (docs/BALANCE.md): DESIGN start values 1, 1.5, 1.9, 2.2
Coop.enemyHp = { 1, 1.2, 1.35, 1.5 }
Coop.eliteHp = { 1, 1.6, 2.2, 2.8 }
Coop.bossHp = { 1, 1.8, 2.5, 3.2 }
Coop.eventCount = { 1, 1.4, 1.7, 2.0 }
Coop.rangedCap = { 1, 1.35, 1.7, 2.05 }
Coop.windMax = { 0, 1, 2, 3 }
Coop.xpShare = { 1, 0.62, 0.48, 0.40 }
Coop.goldShare = { 1, 0.7, 0.6, 0.5 }
Coop.eshotCap = { 120, 168, 216, 240 }
Coop.eshotCapBoss = { 160, 224, 288, 320 }
Coop.teleCap = { 32, 48, 64, 72 }

-- factor table t at player count n (clamped 1..4)
function Coop.f(t: { number }, n: number): number
	return t[math.clamp(n, 1, 4)]
end

return Coop
