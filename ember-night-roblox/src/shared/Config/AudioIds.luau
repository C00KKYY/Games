-- Roblox audio asset ids (docs/DESIGN.md §9). Every id is 0 until the user uploads the files from assets/audio/
-- (tools/export-audio.sh copies them from the web game; see README "Audio"). An id of 0 means silence for that sound:
-- no Sound instance is created, nothing errors, and Studio prints one note listing the missing keys.
-- The uploads must belong to the same owner (user or group) as the experience, otherwise Roblox blocks them.
-- key = file name without .mp3
return {
	sfx = {
		achievement = 0, -- assets/audio/sfx/achievement.mp3
		alarm = 0,
		bomb = 0,
		boss = 0,
		["break"] = 0,
		buy = 0,
		chest = 0,
		chest_open = 0,
		chestpick = 0,
		click = 0,
		coin = 0,
		dash = 0,
		death = 0,
		deny = 0,
		evolve = 0,
		flask = 0,
		gem = 0,
		heal = 0,
		hit = 0,
		hurt = 0,
		item = 0,
		kill = 0,
		knife = 0,
		levelup = 0,
		magnet = 0,
		nova = 0,
		orbit = 0,
		revive = 0,
		shoot = 0,
		slam = 0,
		slash = 0,
		summon = 0,
		throw = 0,
		zap = 0,
	},
	music = {
		menu = 0, -- assets/audio/music/menu.mp3 (loop)
		battle = 0, -- loop
		boss = 0, -- loop
		victory = 0, -- sting
		gameover = 0, -- sting
	},
}
