--!strict
-- Ember Night: shared constants (docs/DESIGN.md, Appendix A). Pure table, usable from Roblox and Lune.

local Tuning = {
	STUDS_PER_PX = 0.1, -- 1 stud = 10 world px (sim keeps the web game's units)

	SIM_HZ = 30,
	SIM_DT = 1 / 30,
	MAX_STEPS_PER_FRAME = 3,
	SNAP_HZ = 15,
	MOVE_HZ = 20,
	INTERP_DELAY = 0.133,
	SUBSTEP_PX = 10,

	VIEW_HW = 640,
	VIEW_HH = 360,
	VIEW_TOP = 70,
	INTEREST_HW = 900,
	INTEREST_HH = 620,
	SNAP_ENEMY_CAP = 260,
	SNAP_FAR_EVERY = 1,
	UR_MAX_BYTES = 900,

	ENEMY_CAP_TOTAL = 450,
	PLAYER_SHOT_CAP = 400,
	GEM_CAP = 320,
	PICKUP_CAP = 120,

	MAX_PLAYERS = 4,
	LEASH_RADIUS = 900,
	WARD_TIME = 1.5,
	WARD_RADIUS = 120,
	WARD_COOLDOWN = 6,
	AUTO_PICK_TIME = 15,
	BLEED_OUT = 30,
	REVIVE_RADIUS = 70,
	REVIVE_TIME = 3,
	REVIVE_TIME_STEP = 1,
	REVIVE_TIME_MAX = 6,
	REVIVE_MAX_PER_RUN = 1,
	LAST_CHANCE_TIME = 10,
	VOTE_TIME = 20,
	START_COUNTDOWN = 5,

	CAM_PITCH = 58,
	CAM_FOV = 40,
	CAM_DIST = 100,
	HUB_ORIGIN = { 0, 2000, 0 }, -- studs (x, y, z); plain numbers so the module stays Instance-free

	LOCK_STALE = 1800,
	AUTOSAVE = 60,
	FORCE_MEMORY_STORE = false,
}

return Tuning
