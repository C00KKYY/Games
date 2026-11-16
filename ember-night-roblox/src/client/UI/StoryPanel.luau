-- Story panel (docs/DESIGN.md §2.3, web tpl_story): the first time a player enters a land, "Land N", its name, the
-- story's premise (very first land only) and the land's intro. Non-blocking: it closes with its button or after
-- STORY_TIME seconds (the server decides when it is shown and marks it seen).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Lang = require(Shared.Lang.Lang)
local Stages = require(Shared.Sim.Data.Stages)
local Story = require(Shared.Sim.Data.Story)
local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

local StoryPanel = {}
local tr = Lang.tr

local STORY_TIME = 9
local gui: ScreenGui = nil :: any
local panel: Frame? = nil
local token = 0

function StoryPanel.init()
	gui = Kit.screen("EN_Story", 6)
end

function StoryPanel.hide()
	token += 1
	if panel then
		panel:Destroy()
		panel = nil
	end
end

function StoryPanel.show(stageId: string, premise: boolean)
	StoryPanel.hide()
	local idx, stage = 1, Stages.list[1]
	for i, s in Stages.list do
		if s.id == stageId then
			idx, stage = i, s
		end
	end
	local f = Kit.panel(gui, {
		Size = UDim2.fromOffset(480, if premise then 250 else 190),
		Position = UDim2.fromScale(0.5, 0.3),
		AnchorPoint = Vector2.new(0.5, 0.5),
	})
	panel = f
	Kit.padding(f, 12)
	Kit.list(f, false, 6)
	Kit.label(
		f,
		tr("Land {0}", idx),
		{ TextSize = 14, TextColor3 = Theme.dim, LayoutOrder = 1, Size = UDim2.new(1, 0, 0, 18) }
	)
	Kit.label(f, tr(stage.name), {
		Font = Theme.title,
		TextSize = 28,
		TextColor3 = Theme.gold,
		LayoutOrder = 2,
		Size = UDim2.new(1, 0, 0, 34),
	})
	if premise then
		Kit.label(f, tr(Story.premise), {
			TextSize = 14,
			TextColor3 = Theme.dim,
			LayoutOrder = 3,
			Size = UDim2.new(1, 0, 0, 56),
		})
	end
	Kit.label(f, tr(stage.intro), { TextSize = 16, LayoutOrder = 4, Size = UDim2.new(1, 0, 0, 44) })
	Kit.button(
		f,
		tr("Los geht’s!"),
		StoryPanel.hide,
		{ Size = UDim2.fromOffset(180, 40), LayoutOrder = 5, TextSize = 18 }
	)
	token += 1
	local my = token
	task.delay(STORY_TIME, function()
		if token == my then
			StoryPanel.hide()
		end
	end)
end

return StoryPanel
