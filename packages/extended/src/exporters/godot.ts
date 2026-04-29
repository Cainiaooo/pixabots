/**
 * @pixabots/extended — Godot 4 Exporter
 *
 * Exports sprite sheet + metadata as Godot 4 compatible resources:
 *   - Sprite sheet PNG (imported by Godot as texture)
 *   - .tres SpriteFrames resource (referenced by AnimatedSprite2D)
 *   - .import hints for Godot's resource system
 *
 * Usage in Godot:
 *   1. Copy sprite sheet PNG into your Godot project (e.g. assets/characters/)
 *   2. Copy the .tres file alongside it
 *   3. Add AnimatedSprite2D node, set its sprite_frames to the .tres
 *   4. Use play("walk_down"), play("walk_up"), etc.
 */

import type { SpriteSheetMeta } from '../sprite-sheet.js'

export interface GodotExportOptions {
  /** Resource name (e.g. "cyber-catgirl") */
  name: string
  /** Godot resource path prefix (e.g. "res://assets/characters/") */
  resourcePrefix?: string
  /** Animation speed (FPS), default from meta */
  speed?: number
  /** Whether animations loop (default: true) */
  loop?: boolean
  /** Sprite sheet filename (default: "{name}_sheet.png") */
  sheetFilename?: string
}

export interface GodotExportResult {
  /** .tres file content */
  tresContent: string
  /** .tres filename */
  tresFilename: string
  /** Sprite sheet filename */
  sheetFilename: string
}

/**
 * Generate a Godot 4 SpriteFrames .tres resource file.
 *
 * Creates separate animations for each direction:
 *   walk_down, walk_up, walk_left, walk_right
 *
 * Each animation references the sprite sheet PNG with
 * region rects for individual frames.
 */
export function generateGodotTres(
  meta: SpriteSheetMeta,
  options: GodotExportOptions,
): GodotExportResult {
  const {
    name,
    resourcePrefix = 'res://assets/characters/',
    speed,
    loop = true,
    sheetFilename: customSheetName,
  } = options

  const sheetFilename = customSheetName || `${name}_sheet.png`
  const tresFilename = `${name}_sprite_frames.tres`
  const animSpeed = speed ?? meta.fps
  const texPath = resourcePrefix + sheetFilename

  // Build animation entries for each direction
  const rowLabels = meta.directions || meta.states || []
  const animState = meta.state || ''
  const animNames: string[] = []
  const animSpeeds: number[] = []
  const animLoops: boolean[] = []
  const animFramesList: string[] = []

  for (let rowIdx = 0; rowIdx < rowLabels.length; rowIdx++) {
    const label = rowLabels[rowIdx]
    const animName = animState ? `${animState}_${label}` : label

    // Collect frame rects for this row
    const rowFrameEntries = meta.frames
      .filter(f => f.row === rowIdx)
      .sort((a, b) => a.frameIndex - b.frameIndex)

    // Build the frames array for this animation
    // Each frame is: duration, tex_path, region (x, y, w, h)
    const frameLines: string[] = []
    for (const frame of rowFrameEntries) {
      frameLines.push(
        `SubResource("AtlasTexture_${animName}_${frame.frameIndex}")`,
      )
    }

    animNames.push(animName)
    animSpeeds.push(animSpeed)
    animLoops.push(loop)
    animFramesList.push(frameLines.join(', '))
  }

  // Generate sub-resource IDs for AtlasTextures
  const subResources: string[] = []
  let subId = 1

  for (let rowIdx = 0; rowIdx < rowLabels.length; rowIdx++) {
    const label = rowLabels[rowIdx]
    const animName = animState ? `${animState}_${label}` : label
    const rowFrames = meta.frames
      .filter(f => f.row === rowIdx)
      .sort((a, b) => a.frameIndex - b.frameIndex)

    for (const frame of rowFrames) {
      subResources.push(
        `[sub_resource type="AtlasTexture" id="AtlasTexture_${animName}_${frame.frameIndex}"]`,
        `atlas = ExtResource("1_${name}")`,
        `region = Rect2(${frame.x}, ${frame.y}, ${meta.frameWidth}, ${meta.frameHeight})`,
        '',
      )
      subId++
    }
  }

  // Build the animation arrays for the main resource
  const animNamesStr = animNames.map(n => `"${n}"`).join(', ')
  const animSpeedsStr = animSpeeds.join(', ')
  const animLoopsStr = animLoops.map(l => l ? 'true' : 'false').join(', ')

  // Build frames array - each animation's frames as sub-array
  const framesArrays = animFramesList

  // Assemble the .tres file
  const lines: string[] = []

  // External resource (the sprite sheet texture)
  lines.push(`[gd_resource type="SpriteFrames" load_steps=2 format=3]`)
  lines.push('')
  lines.push(`[ext_resource type="Texture2D" uid="uid://auto" path="${texPath}" id="1_${name}"]`)
  lines.push('')

  // Sub-resources (AtlasTextures for each frame)
  for (const line of subResources) {
    lines.push(line)
  }

  // Main resource
  lines.push('[resource]')
  lines.push(`animations/names = PackedStringArray(${animNamesStr})`)
  lines.push(`animations/speeds = PackedFloat32Array(${animSpeedsStr})`)
  lines.push(`animations/loop = PackedBoolArray(${animLoopsStr})`)

  // Each animation's frames
  for (let i = 0; i < animNames.length; i++) {
    lines.push(`animations/${i}/frames = [${framesArrays[i]}]`)
  }

  return {
    tresContent: lines.join('\n') + '\n',
    tresFilename,
    sheetFilename,
  }
}
