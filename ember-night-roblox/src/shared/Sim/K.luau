-- Late-bound function registry of the simulation. Every Sim module registers its functions here
-- (`function K.damage(run, ...)`), and calls other modules through K at call time. This breaks the require cycles
-- of the web game's single `Game` object (damage -> kill -> drop -> ... -> damage) without changing its structure.
-- Sim/Run.luau requires every module once, so the registry is complete before the first step.
local K = {}
return K
