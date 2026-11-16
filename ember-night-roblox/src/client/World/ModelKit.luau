--!native
-- Stylized models from primitives (docs/DESIGN.md §4.3): every enemy type, the bosses (sprite model x scale + crown
-- + aura light; "Die Nacht" has its own model), heroes with a weapon prop, chests, gems and pickups, land decor.
-- A model is a list of pooled parts with offsets in units of the body radius r (studs) and a named animation per
-- part; `pose` appends world CFrames to the caller's BulkMoveTo arrays, so nothing allocates Instances per frame.
-- Axes: local +X = facing direction (sim angle 0), +Y = up, +Z = the model's right side.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Enemies = require(Shared.Sim.Data.Enemies)
local Heroes = require(Shared.Sim.Data.Heroes)
local Stages = require(Shared.Sim.Data.Stages)
local Coords = require(script.Parent.Coords)
local Pool = require(script.Parent.Pool)

local ModelKit = {}

local rad = math.rad
local sin, cos = math.sin, math.cos
local V = Vector3.new
local NEON = Enum.Material.Neon
local ICE = Enum.Material.Ice

local bossR: { [string]: number } = {}
local bossTint: { [string]: string } = {}
local bossSprite: { [string]: string } = {}
for _, s in Stages.list do
	for _, b in s.bosses do
		bossR[b.name] = b.r
		bossTint[b.name] = b.tint
		bossSprite[b.name] = b.sprite
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

-- enemy body colour (boss tint > land tint > base colour)
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

-- the sprite a boss uses (slime, skel, wraith, golem, night)
function ModelKit.bossSprite(bossName: string?): string?
	return bossName and bossSprite[bossName]
end

-- ---------- model specs ----------
-- part = { shape, size (x r), pos (x r), rot (degrees, XYZ), role, mat?, tr?, anim? }
-- roles: body, dark, light, eye, white, black, gold, accent (hero skin accent), skin, glow (body colour, neon)
type PartSpec = {
	shape: string,
	size: Vector3,
	pos: Vector3,
	rot: Vector3?,
	role: string,
	mat: Enum.Material?,
	tr: number?,
	anim: string?,
}
export type Spec = { parts: { PartSpec }, light: number? }

local function P(shape, size, pos, role, extra): PartSpec
	local p: any = { shape = shape, size = size, pos = pos, role = role }
	if extra then
		for k, v in extra do
			p[k] = v
		end
	end
	return p
end


local SPECS: { [string]: Spec } = {
	bat = {
		parts = {
			P("Ball", V(1.5, 1.3, 1.5), V(0, 1.7, 0), "body", { anim = "flutter" }),
			P("Block", V(0.9, 0.12, 1.5), V(-0.1, 1.85, 1.2), "dark", { anim = "wingR" }),
			P("Block", V(0.9, 0.12, 1.5), V(-0.1, 1.85, -1.2), "dark", { anim = "wingL" }),
			P("Block", V(0.2, 0.22, 0.85), V(0.68, 1.85, 0), "eye", { mat = NEON, anim = "flutter" }),
		},
	},
	slime = {
		parts = {
			P("Ball", V(2.2, 1.45, 2.2), V(0, 0.72, 0), "body", { anim = "squash", tr = 0.08 }),
			P("Ball", V(0.55, 0.4, 0.55), V(-0.3, 1.25, 0.45), "white", { anim = "squash", tr = 0.3 }),
			P("Block", V(0.2, 0.3, 0.9), V(0.95, 0.95, 0), "black", { anim = "squash" }),
		},
	},
	skel = {
		parts = {
			P("Block", V(0.8, 1.2, 1.1), V(0, 1.0, 0), "body", { anim = "waddle" }),
			P("Ball", V(1.25, 1.2, 1.25), V(0.1, 2.15, 0), "body", { anim = "waddle" }),
			P("Block", V(0.15, 0.25, 0.75), V(0.68, 2.2, 0), "eye", { mat = NEON, anim = "waddle" }),
			P("Block", V(0.25, 0.25, 1.9), V(0.25, 1.35, 0), "dark", { anim = "waddle" }),
		},
	},
	ghost = {
		parts = {
			P("Ball", V(1.8, 1.8, 1.8), V(0, 2.0, 0), "body", { tr = 0.3, anim = "float" }),
			P("Ball", V(1.3, 1.5, 1.3), V(-0.15, 1.15, 0), "body", { tr = 0.5, anim = "float" }),
			P("Block", V(0.2, 0.4, 0.9), V(0.86, 2.1, 0), "black", { anim = "float" }),
		},
	},
	ghoul = {
		parts = {
			P("Block", V(1.5, 1.2, 1.4), V(-0.1, 1.0, 0), "body", { rot = V(0, 0, -18), anim = "lurch" }),
			P("Ball", V(1.0, 1.0, 1.0), V(0.75, 1.6, 0), "light", { anim = "lurch" }),
			P("Block", V(0.4, 0.35, 2.1), V(0.75, 0.85, 0), "dark", { anim = "lurch" }),
			P("Block", V(0.12, 0.2, 0.6), V(1.2, 1.7, 0), "eye", { mat = NEON, anim = "lurch" }),
		},
	},
	spitter = {
		parts = {
			P("Ball", V(2.0, 1.8, 2.0), V(0, 1.0, 0), "body", { anim = "breathe" }),
			P("Cylinder", V(1.0, 0.7, 0.7), V(1.15, 1.1, 0), "dark", { anim = "snout" }),
			P("Ball", V(0.5, 0.5, 0.5), V(1.62, 1.1, 0), "glow", { mat = NEON, anim = "snout" }),
			P("Block", V(0.15, 0.25, 1.0), V(0.85, 1.55, 0), "eye", { mat = NEON, anim = "breathe" }),
		},
	},
	cinder = {
		parts = {
			P("Cylinder", V(1.3, 2.0, 2.0), V(0, 0.75, 0), "dark", { rot = V(0, 0, 90), anim = "rock" }),
			P("Cylinder", V(0.25, 2.2, 2.2), V(0, 1.45, 0), "body", { rot = V(0, 0, 90), anim = "rock" }),
			P("Ball", V(1.6, 0.6, 1.6), V(0, 1.55, 0), "glow", { mat = NEON, anim = "rock" }),
		},
	},
	moth = {
		parts = {
			P("Ball", V(1.6, 0.8, 0.8), V(0, 1.9, 0), "body", { anim = "flit" }),
			P("Block", V(1.0, 0.08, 1.6), V(-0.2, 2.0, 1.0), "light", { anim = "mothR" }),
			P("Block", V(1.0, 0.08, 1.6), V(-0.2, 2.0, -1.0), "light", { anim = "mothL" }),
			P("Block", V(1.3, 0.12, 0.12), V(1.35, 1.9, 0), "glow", { mat = NEON, anim = "flit" }),
		},
	},
	bell = {
		parts = {
			P("Cylinder", V(1.5, 1.9, 1.9), V(0, 1.35, 0), "body", { rot = V(0, 0, 90), anim = "swing" }),
			P("Ball", V(1.3, 1.1, 1.3), V(0, 2.1, 0), "body", { anim = "swing" }),
			P("Cylinder", V(0.15, 2.2, 2.2), V(0, 0.62, 0), "dark", { rot = V(0, 0, 90), anim = "swing" }),
			P("Ball", V(0.55, 0.55, 0.55), V(0, 0.45, 0), "glow", { mat = NEON, anim = "clapper" }),
		},
	},
	wraith = {
		parts = {
			P("Ball", V(1.4, 2.4, 1.4), V(0, 1.9, 0), "body", { tr = 0.15, anim = "hover" }),
			P("Ball", V(0.6, 0.6, 0.6), V(0.35, 2.15, 0), "glow", { mat = NEON, anim = "hover" }),
			P("Block", V(1.4, 0.2, 0.7), V(-0.8, 1.2, 0), "dark", { rot = V(0, 0, 25), tr = 0.3, anim = "hover" }),
			P("Block", V(0.12, 0.2, 0.6), V(0.68, 2.55, 0), "eye", { mat = NEON, anim = "hover" }),
		},
	},
	brute = {
		parts = {
			P("Block", V(1.6, 1.5, 1.8), V(0, 1.05, 0), "body", { anim = "stomp" }),
			P("Ball", V(0.95, 0.95, 0.95), V(0.45, 2.1, 0), "body", { anim = "stomp" }),
			P("Ball", V(0.85, 0.85, 0.85), V(0.75, 0.7, 1.15), "dark", { anim = "fistR" }),
			P("Ball", V(0.85, 0.85, 0.85), V(0.75, 0.7, -1.15), "dark", { anim = "fistL" }),
			P("Block", V(0.12, 0.18, 0.55), V(0.9, 2.15, 0), "eye", { mat = NEON, anim = "stomp" }),
		},
	},
	golem = {
		parts = {
			P("Block", V(1.8, 1.0, 1.7), V(0, 0.6, 0), "dark", { anim = "slowstomp" }),
			P("Block", V(1.5, 1.1, 1.5), V(0, 1.65, 0), "body", { rot = V(0, 8, 0), anim = "slowstomp" }),
			P(
				"Block",
				V(0.06, 0.9, 0.25),
				V(0.76, 1.55, 0.3),
				"glow",
				{ mat = NEON, rot = V(0, 0, 15), anim = "slowstomp" }
			),
			P("Block", V(0.1, 0.2, 0.9), V(0.77, 1.95, 0), "eye", { mat = NEON, anim = "slowstomp" }),
		},
	},
	night = {
		light = 24,
		parts = {
			P("Ball", V(2.0, 2.0, 2.0), V(0, 2.2, 0), "black", { anim = "pulse" }),
			P("Ball", V(1.0, 1.0, 1.0), V(0.55, 2.4, 0), "glow", { mat = NEON, anim = "pulse" }),
			P("Block", V(0.3, 0.9, 0.3), V(1.6, 2.2, 0), "glow", { mat = NEON, anim = "orbit1" }),
			P("Block", V(0.3, 0.9, 0.3), V(1.6, 2.2, 0), "glow", { mat = NEON, anim = "orbit2" }),
			P("Block", V(0.3, 0.9, 0.3), V(1.6, 2.2, 0), "glow", { mat = NEON, anim = "orbit3" }),
			P("Block", V(0.3, 0.9, 0.3), V(1.6, 2.2, 0), "glow", { mat = NEON, anim = "orbit4" }),
		},
	},
	-- heroes: r = 1 hero radius (1.4 studs)
	hero = {
		parts = {
			P("Block", V(0.9, 0.7, 1.1), V(0, 0.38, 0), "black", { anim = "walk" }),
			P("Block", V(1.0, 1.25, 1.35), V(0, 1.3, 0), "body", { anim = "walk" }),
			P("Wedge", V(1.4, 1.55, 0.35), V(-0.62, 1.2, 0), "dark", { rot = V(0, 90, 0), anim = "cape" }),
			P("Ball", V(1.15, 1.15, 1.15), V(0.05, 2.45, 0), "skin", { anim = "walk" }),
			P("Block", V(0.1, 0.2, 0.55), V(0.6, 2.5, 0), "black", { anim = "walk" }),
			P("Block", V(0.75, 0.22, 1.25), V(0, 3.0, 0), "accent", { anim = "walk" }),
		},
	},
	-- elite marker: gold ring on the ground
	eliteRing = {
		parts = {
			P("Cylinder", V(0.06, 2.3, 2.3), V(0, 0.06, 0), "gold", { rot = V(0, 0, 90), mat = NEON, tr = 0.72 }),
		},
	},
	crown = {
		parts = {
			P("Cylinder", V(0.25, 0.9, 0.9), V(0, 0, 0), "gold", { rot = V(0, 0, 90), mat = NEON }),
			P("Block", V(0.18, 0.4, 0.18), V(0.35, 0.25, 0), "gold", { mat = NEON, rot = V(0, 45, 0) }),
			P("Block", V(0.18, 0.4, 0.18), V(-0.18, 0.25, 0.3), "gold", { mat = NEON, rot = V(0, 45, 0) }),
			P("Block", V(0.18, 0.4, 0.18), V(-0.18, 0.25, -0.3), "gold", { mat = NEON, rot = V(0, 45, 0) }),
		},
	},
}

-- hero weapon props (attached to the hero's front right, r = hero radius)
local WEAPON: { [string]: { PartSpec } } = {
	whip = {
		P("Cylinder", V(0.9, 0.16, 0.16), V(0.35, 1.2, 0.78), "dark", { rot = V(0, 0, -60), anim = "walk" }),
		P("Block", V(1.2, 0.08, 0.08), V(0.85, 0.6, 0.85), "white", { rot = V(0, 0, -20), anim = "walk" }),
	},
	wand = {
		P("Cylinder", V(2.2, 0.14, 0.14), V(0.35, 1.6, 0.78), "dark", { rot = V(0, 0, 80), anim = "walk" }),
		P("Ball", V(0.42, 0.42, 0.42), V(0.5, 2.7, 0.78), "weapon", { mat = NEON, anim = "walk" }),
	},
	knives = {
		P("Block", V(0.7, 0.08, 0.2), V(0.55, 1.15, 0.8), "white", { rot = V(0, 0, -10), anim = "walk" }),
		P("Block", V(0.7, 0.08, 0.2), V(0.55, 1.15, -0.8), "white", { rot = V(0, 0, -10), anim = "walk" }),
	},
	aura = {
		P("Ball", V(0.5, 0.5, 0.5), V(0.75, 1.5, 0), "weapon", { mat = NEON, anim = "hover" }),
	},
	sickle = {
		P("Cylinder", V(1.6, 0.14, 0.14), V(0.35, 1.3, 0.8), "dark", { rot = V(0, 0, 75), anim = "walk" }),
		P("Block", V(0.8, 0.1, 0.18), V(0.6, 2.05, 0.8), "white", { rot = V(0, 0, -30), anim = "walk" }),
	},
	lightning = {
		P("Block", V(0.15, 0.7, 0.15), V(0.6, 3.3, 0.3), "weapon", { mat = NEON, rot = V(0, 0, 30), anim = "walk" }),
		P("Block", V(0.15, 0.6, 0.15), V(0.6, 3.25, -0.3), "weapon", { mat = NEON, rot = V(0, 0, -30), anim = "walk" }),
	},
	nova = {
		P("Block", V(0.35, 0.35, 0.35), V(0.6, 1.4, 0.85), "weapon", { mat = NEON, rot = V(45, 45, 0), anim = "walk" }),
	},
	orbit = {
		P("Ball", V(0.35, 0.35, 0.35), V(0, 1.8, 0), "weapon", { mat = NEON, anim = "orbitHero" }),
	},
	fire = {
		P("Ball", V(0.55, 0.55, 0.55), V(0.55, 1.0, 0.85), "glass", { tr = 0.3, anim = "walk" }),
		P("Ball", V(0.35, 0.35, 0.35), V(0.55, 1.0, 0.85), "weapon", { mat = NEON, anim = "walk" }),
	},
}
local WEAPON_COLOR = {
	whip = "#ffffff",
	wand = "#b48cff",
	knives = "#d8f3ff",
	aura = "#ff9a3c",
	sickle = "#e8e0c8",
	lightning = "#9fe8ff",
	nova = "#a8e4ff",
	orbit = "#ffe27a",
	fire = "#ff7a2f",
}

-- pickups (r = 1 stud)
local PICKUP: { [string]: Spec } = {
	gem = {
		parts = {
			P("Block", V(0.75, 0.75, 0.75), V(0, 0.9, 0), "body", { mat = NEON, rot = V(45, 0, 45), anim = "spin" }),
		},
	},
	coin = { parts = { P("Cylinder", V(0.2, 1.1, 1.1), V(0, 0.75, 0), "body", { mat = NEON, anim = "spin" }) } },
	bag = {
		parts = {
			P("Ball", V(1.6, 1.4, 1.6), V(0, 0.75, 0), "body", { anim = "bob" }),
			P("Cylinder", V(0.25, 0.7, 0.7), V(0, 1.45, 0), "dark", { rot = V(0, 0, 90), anim = "bob" }),
			P("Cylinder", V(0.12, 0.5, 0.5), V(0.5, 0.85, 0.55), "gold", { mat = NEON, anim = "bob" }),
		},
	},
	heart = {
		parts = {
			P("Ball", V(0.9, 0.9, 0.9), V(0, 1.25, 0.32), "body", { mat = NEON, anim = "spinBob" }),
			P("Ball", V(0.9, 0.9, 0.9), V(0, 1.25, -0.32), "body", { mat = NEON, anim = "spinBob" }),
			P("Block", V(0.25, 0.85, 0.85), V(0, 0.9, 0), "body", { mat = NEON, rot = V(45, 0, 0), anim = "spinBob" }),
		},
	},
	magnet = {
		parts = {
			P("Block", V(0.35, 0.35, 1.3), V(0, 0.6, 0), "body", { anim = "spinBob" }),
			P("Block", V(0.35, 1.0, 0.35), V(0, 1.1, 0.48), "body", { anim = "spinBob" }),
			P("Block", V(0.35, 1.0, 0.35), V(0, 1.1, -0.48), "body", { anim = "spinBob" }),
			P("Block", V(0.36, 0.3, 1.32), V(0, 1.5, 0), "white", { anim = "spinBob" }),
		},
	},
	bomb = {
		parts = {
			P("Ball", V(1.4, 1.4, 1.4), V(0, 0.75, 0), "body", { anim = "bob" }),
			P("Cylinder", V(0.4, 0.3, 0.3), V(0, 1.55, 0), "dark", { rot = V(0, 0, 90), anim = "bob" }),
			P("Ball", V(0.3, 0.3, 0.3), V(0, 1.8, 0), "spark", { mat = NEON, anim = "spark" }),
		},
	},
	chest = {
		parts = {
			P("Block", V(2.4, 1.2, 1.6), V(0, 0.65, 0), "body", { anim = "chest" }),
			P("Block", V(2.5, 0.55, 1.7), V(0, 1.45, 0), "dark", { anim = "chest" }),
			P("Block", V(0.3, 1.9, 1.75), V(0, 1.0, 0), "owner", { mat = NEON, anim = "chest" }),
			P("Block", V(0.4, 0.4, 0.15), V(0, 1.15, 0.86), "gold", { mat = NEON, anim = "chest" }),
		},
	},
}
local PICKUP_COLOR = {
	coin = "#ffd23f",
	bag = "#c89a3a",
	heart = "#ff4f8e",
	magnet = "#d04a4a",
	bomb = "#34303e",
	chest = "#8a5a2a",
}

-- land decor (r = 1 stud, the web sprites' silhouettes)
local DECOR: { [string]: { PartSpec } } = {
	grave = {
		P("Block", V(1.6, 2.2, 0.5), V(0, 1.1, 0), "body"),
		P("Cylinder", V(0.5, 1.6, 1.6), V(0, 2.2, 0), "body", { rot = V(0, 90, 0) }),
		P("Block", V(2.0, 0.25, 1.0), V(0, 0.1, 0.4), "dark"),
	},
	cross = {
		P("Block", V(0.35, 2.6, 0.35), V(0, 1.3, 0), "body"),
		P("Block", V(1.4, 0.35, 0.35), V(0, 1.9, 0), "body"),
	},
	bones = {
		P("Cylinder", V(1.4, 0.22, 0.22), V(0, 0.15, 0), "light", { rot = V(0, 30, 0) }),
		P("Cylinder", V(1.2, 0.2, 0.2), V(0.2, 0.15, 0.3), "light", { rot = V(0, -50, 0) }),
		P("Ball", V(0.6, 0.55, 0.6), V(-0.6, 0.28, -0.3), "light"),
	},
	rock = {
		P("Ball", V(2.4, 1.4, 2.0), V(0, 0.45, 0), "body"),
		P("Ball", V(1.2, 0.9, 1.1), V(0.9, 0.3, 0.6), "dark"),
	},
	mush = {
		P("Cylinder", V(0.9, 0.4, 0.4), V(0, 0.45, 0), "light", { rot = V(0, 0, 90) }),
		P("Ball", V(1.4, 0.7, 1.4), V(0, 1.0, 0), "glow", { mat = NEON }),
	},
	stump = {
		P("Cylinder", V(1.0, 1.5, 1.5), V(0, 0.5, 0), "body", { rot = V(0, 0, 90) }),
		P("Cylinder", V(0.05, 1.2, 1.2), V(0, 1.02, 0), "light", { rot = V(0, 0, 90) }),
	},
	flower = {
		P("Cylinder", V(0.7, 0.1, 0.1), V(0, 0.35, 0), "dark", { rot = V(0, 0, 90) }),
		P("Ball", V(0.55, 0.3, 0.55), V(0, 0.75, 0), "glow", { mat = NEON }),
	},
}
local DECOR_COLOR = {
	grave = "#7d8494",
	cross = "#6d5a48",
	bones = "#e8e0c8",
	rock = "#6a6f78",
	mush = "#ff8ad8",
	stump = "#6b4a2e",
	flower = "#ffd84f",
}

-- ---------- colours ----------
local WHITE = Color3.new(1, 1, 1)
local BLACK = Color3.fromRGB(16, 12, 22)
local GOLD = Color3.fromHex("#ffcf3f")
local SKIN = Color3.fromRGB(255, 220, 190)
local EYES = Color3.fromHex("#ffe066")

export type Palette = {
	body: Color3,
	eye: Color3?,
	accent: Color3?,
	skin: Color3?,
	weapon: Color3?,
	owner: Color3?,
}

local function roleColor(role: string, pal: Palette): Color3
	local b = pal.body
	if role == "body" or role == "glow" then
		return b
	elseif role == "dark" then
		return b:Lerp(BLACK, 0.45)
	elseif role == "light" then
		return b:Lerp(WHITE, 0.4)
	elseif role == "eye" then
		return pal.eye or EYES
	elseif role == "white" then
		return WHITE
	elseif role == "black" then
		return BLACK
	elseif role == "gold" then
		return GOLD
	elseif role == "accent" then
		return pal.accent or b:Lerp(BLACK, 0.3)
	elseif role == "skin" then
		return pal.skin or SKIN
	elseif role == "weapon" then
		return pal.weapon or WHITE
	elseif role == "owner" then
		return pal.owner or GOLD
	elseif role == "glass" then
		return Color3.fromRGB(220, 240, 255)
	elseif role == "spark" then
		return Color3.fromHex("#ffb347")
	end
	return b
end

-- ---------- rigs ----------
export type Rig = {
	parts: { BasePart },
	specs: { PartSpec },
	offs: { CFrame },
	r: number,
	kind: string,
	light: PointLight?,
	bodyColor: Color3,
	state: string,
	phase: number,
}

local function rotCF(r: Vector3?): CFrame
	if not r then
		return CFrame.identity
	end
	return CFrame.Angles(rad(r.X), rad(r.Y), rad(r.Z))
end

-- build a rig from part specs, sizes scaled by r (studs)
local function buildFrom(
	kind: string,
	specs: { PartSpec },
	r: number,
	pal: Palette,
	materialOverride: Enum.Material?
): Rig
	local rig: Rig = {
		parts = {},
		specs = specs,
		offs = {},
		r = r,
		kind = kind,
		light = nil,
		bodyColor = pal.body,
		state = "",
		phase = math.random() * 10,
	}
	for i, sp in specs do
		local shape = sp.shape
		if shape == "Ball" and (sp.size.X ~= sp.size.Y or sp.size.Y ~= sp.size.Z) then
			shape = "Ellipsoid"
		end
		local part = Pool.get(
			shape,
			sp.size * r,
			roleColor(sp.role, pal),
			sp.mat or materialOverride or Enum.Material.SmoothPlastic,
			sp.tr or 0
		)
		rig.parts[i] = part
		rig.offs[i] = CFrame.new(sp.pos * r) * rotCF(sp.rot)
	end
	return rig
end

-- an enemy (or boss: bossName given) model
function ModelKit.enemy(etype: string, elite: boolean, bossName: string?, tints: { [string]: string }?): Rig
	local r = ModelKit.enemyRadius(etype, elite, bossName)
	local kind = (bossName and bossSprite[bossName]) or etype
	local spec = SPECS[kind] or SPECS.slime
	local body = ModelKit.enemyColor(etype, tints, bossName)
	if kind == "night" then
		body = Coords.color(Enemies.COLORS.night)
	end
	local specs = table.clone(spec.parts)
	if elite or bossName then
		for _, p in SPECS.eliteRing.parts do
			table.insert(specs, p)
		end
	end
	if bossName and kind ~= "night" then
		local top = 0
		for _, p in spec.parts do
			top = math.max(top, p.pos.Y + p.size.Y / 2)
		end
		for _, p in SPECS.crown.parts do
			local q = table.clone(p)
			q.pos = p.pos + V(0, top + 0.1, 0)
			q.anim = spec.parts[1].anim
			table.insert(specs, q)
		end
	end
	local rig = buildFrom(kind, specs, r, { body = body, eye = if elite then GOLD else nil })
	if bossName then
		local l = Instance.new("PointLight")
		l.Range = spec.light or 16
		l.Brightness = 1.6
		l.Color = body:Lerp(WHITE, 0.3)
		l.Shadows = false
		l.Parent = rig.parts[1]
		rig.light = l
	end
	return rig
end

-- a hero model (r = hero radius in studs); pal.body = hero or skin colour, pal.accent = skin accent
function ModelKit.hero(heroId: string?, r: number, pal: Palette): Rig
	local h = heroId and Heroes.byId[heroId]
	local weapon = if h then h.weapon else "whip"
	local specs = table.clone(SPECS.hero.parts)
	for _, p in WEAPON[weapon] or {} do
		table.insert(specs, p)
	end
	pal.weapon = pal.weapon or Coords.color(WEAPON_COLOR[weapon])
	return buildFrom("hero", specs, r, pal)
end

function ModelKit.pickup(kind: string, pal: Palette?): Rig
	local spec = PICKUP[kind] or PICKUP.coin
	local p = pal or { body = Coords.color(PICKUP_COLOR[kind]) }
	return buildFrom(kind, spec.parts, 1, p)
end

-- gems by value (web colours: blue 1, green 5+, red 20+)
function ModelKit.gem(v: number): Rig
	local col = if v >= 20 then "#ff5a8e" elseif v >= 5 then "#5dff8f" else "#5ab8ff"
	local size = if v >= 20 then 1.45 elseif v >= 5 then 1.2 else 1
	return buildFrom("gem", PICKUP.gem.parts, size, { body = Coords.color(col) })
end

-- a decor model; tint (land decorTint) darkens/tints its colours like the web sprites
function ModelKit.decor(kind: string, scale: number, tint: string?): Rig
	local body = Coords.color(DECOR_COLOR[kind] or "#777777")
	if tint then
		body = body:Lerp(Coords.color(tint), 0.55)
	end
	return buildFrom("decor", DECOR[kind] or DECOR.rock, scale, { body = body })
end

ModelKit.DECOR_KINDS = DECOR

function ModelKit.release(rig: Rig)
	if rig.light then
		rig.light:Destroy()
		rig.light = nil
	end
	for _, p in rig.parts do
		Pool.put(p)
	end
	table.clear(rig.parts)
end

-- body colour override (hit flash, frozen, slowed); only touches parts with role body/light/dark/glow on change
function ModelKit.tint(rig: Rig, state: string, base: Color3)
	if rig.state == state and rig.bodyColor == base then
		return
	end
	rig.state = state
	rig.bodyColor = base
	local col = base
	local mat: Enum.Material? = nil
	if state == "flash" then
		col = WHITE
	elseif state == "frozen" then
		col = Color3.fromRGB(170, 220, 255)
		mat = ICE
	elseif state == "slowed" then
		col = base:Lerp(Color3.fromRGB(150, 200, 255), 0.45)
	end
	for i, sp in rig.specs do
		local role = sp.role
		if role == "body" or role == "dark" or role == "light" then
			local part = rig.parts[i]
			part.Color = roleColor(role, { body = col })
			local m = mat or sp.mat or Enum.Material.SmoothPlastic
			if part.Material ~= m then
				part.Material = m
			end
		end
	end
end

-- ---------- animation ----------
-- st: moving (bool), winding (bool), speed factor; returns the extra local transform of a part
local IDENT = CFrame.identity
local function anim(name: string?, t: number, st: any, rig: Rig): CFrame
	if not name then
		return IDENT
	end
	local wind = st.winding
	if name == "flutter" then
		return CFrame.new(0, sin(t * 9) * 0.12 * rig.r, 0)
	elseif name == "wingR" or name == "wingL" then
		-- hinge at the body's side
		local s = if name == "wingR" then 1 else -1
		local hinge = CFrame.new(0, 1.85 * rig.r, 0.5 * rig.r * s)
		local f = sin(t * 22) * 0.7
		return CFrame.new(0, sin(t * 9) * 0.12 * rig.r, 0) * hinge * CFrame.Angles(-f * s, 0, 0) * hinge:Inverse()
	elseif name == "squash" then
		return CFrame.new(0, math.abs(sin(t * 6)) * 0.18 * rig.r, 0)
	elseif name == "waddle" then
		return CFrame.Angles(sin(t * 8) * 0.14, 0, 0)
	elseif name == "float" then
		return CFrame.new(0, sin(t * 3) * 0.25 * rig.r, 0)
	elseif name == "lurch" then
		return CFrame.Angles(0, 0, sin(t * 5) * 0.12) * CFrame.new(0, math.abs(sin(t * 5)) * 0.08 * rig.r, 0)
	elseif name == "breathe" then
		return CFrame.new(0, sin(t * (if wind then 30 else 4)) * (if wind then 0.06 else 0.05) * rig.r, 0)
	elseif name == "snout" then
		if wind then
			return CFrame.new(-0.25 * rig.r + sin(t * 30) * 0.08 * rig.r, 0, 0)
		end
		return IDENT
	elseif name == "rock" then
		local a = if wind then sin(t * 26) * 0.18 else sin(t * 3) * 0.05
		return CFrame.Angles(a, 0, a * 0.6)
	elseif name == "flit" then
		return CFrame.new(0, sin(t * 7) * 0.2 * rig.r, cos(t * 5) * 0.1 * rig.r)
	elseif name == "mothR" or name == "mothL" then
		local s = if name == "mothR" then 1 else -1
		local hinge = CFrame.new(0, 2.0 * rig.r, 0.3 * rig.r * s)
		return CFrame.new(0, sin(t * 7) * 0.2 * rig.r, cos(t * 5) * 0.1 * rig.r)
			* hinge
			* CFrame.Angles(-sin(t * 16) * 0.5 * s, 0, 0)
			* hinge:Inverse()
	elseif name == "swing" or name == "clapper" then
		local a = if wind then sin(t * 18) * 0.35 else sin(t * 2) * 0.06
		local pivot = CFrame.new(0, 2.4 * rig.r, 0)
		local k = if name == "clapper" then 1.6 else 1
		return pivot * CFrame.Angles(a * k, 0, 0) * pivot:Inverse()
	elseif name == "hover" then
		return CFrame.new(0, sin(t * 2.5) * 0.25 * rig.r, 0)
	elseif name == "stomp" or name == "fistR" or name == "fistL" then
		local b = math.abs(sin(t * 5)) * 0.1 * rig.r
		if name == "fistR" then
			return CFrame.new(sin(t * 5) * 0.2 * rig.r, b, 0)
		elseif name == "fistL" then
			return CFrame.new(-sin(t * 5) * 0.2 * rig.r, b, 0)
		end
		return CFrame.new(0, b, 0)
	elseif name == "slowstomp" then
		return CFrame.Angles(sin(t * 2.5) * 0.06, 0, 0) * CFrame.new(0, math.abs(sin(t * 2.5)) * 0.06 * rig.r, 0)
	elseif name == "pulse" then
		return CFrame.new(0, sin(t * 2) * 0.15 * rig.r, 0)
	elseif string.sub(name, 1, 5) == "orbit" and name ~= "orbitHero" then
		local k = tonumber(string.sub(name, 6)) or 1
		local a = t * 1.6 + k * math.pi / 2
		-- shards circle the body: undo the part's +X offset, then rotate it about the model's vertical axis
		local c = CFrame.new(0, 2.2 * rig.r, 0)
		return c * CFrame.Angles(0, a, 0) * c:Inverse()
	elseif name == "walk" then
		if st.moving then
			return CFrame.new(0, math.abs(sin(t * 11)) * 0.12 * rig.r, 0) * CFrame.Angles(sin(t * 11) * 0.06, 0, 0)
		end
		return CFrame.new(0, sin(t * 2) * 0.03 * rig.r, 0)
	elseif name == "cape" then
		local w = if st.moving then 0.25 + sin(t * 11) * 0.08 else 0.05
		local c = CFrame.new(-0.55 * rig.r, 1.9 * rig.r, 0)
		return c * CFrame.Angles(0, 0, w) * c:Inverse()
	elseif name == "orbitHero" then
		local a = t * 3
		return CFrame.new(cos(a) * 1.1 * rig.r, sin(t * 4) * 0.2 * rig.r, sin(a) * 1.1 * rig.r)
	elseif name == "spin" then
		return CFrame.new(0, sin(t * 3) * 0.15 * rig.r, 0) * CFrame.Angles(0, t * 2.2, 0)
	elseif name == "bob" then
		return CFrame.new(0, sin(t * 3) * 0.1 * rig.r, 0)
	elseif name == "spinBob" then
		return CFrame.new(0, sin(t * 3) * 0.15 * rig.r, 0) * CFrame.Angles(0, t * 1.5, 0)
	elseif name == "spark" then
		return CFrame.new(0, sin(t * 3) * 0.1 * rig.r + sin(t * 37) * 0.05, 0)
	elseif name == "chest" then
		return CFrame.new(0, sin(t * 2) * 0.05, 0)
	end
	return IDENT
end

-- append the rig's parts and world CFrames (base = position + facing) to the bulk arrays; returns the new count
function ModelKit.pose(
	rig: Rig,
	base: CFrame,
	t: number,
	st: any,
	outP: { BasePart },
	outC: { CFrame },
	n: number
): number
	local tt = t + rig.phase
	local parts, offs, specs = rig.parts, rig.offs, rig.specs
	for i = 1, #parts do
		local sp = specs[i]
		local a = sp.anim
		n += 1
		outP[n] = parts[i]
		if a then
			-- animations act in the model frame: pivot-style ones already include their pivot
			outC[n] = base * anim(a, tt, st, rig) * offs[i]
		else
			outC[n] = base * offs[i]
		end
	end
	return n
end

return ModelKit
