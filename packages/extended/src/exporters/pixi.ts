/**
 * @pixabots/extended — PixiJS Exporter
 *
 * Exports sprite sheet metadata as Aseprite JSON Hash format,
 * natively consumable by PixiJS v8 AnimatedSprite.
 *
 * Usage in PixiJS:
 *   import { AnimatedSprite, Spritesheet, Texture } from 'pixi.js'
 *   import sheetData from './claude-agent_sheet.json'
 *   import sheetImg from './claude-agent_sheet.png'
 *
 *   const texture = Texture.from(sheetImg)
 *   const spritesheet = new Spritesheet(texture, sheetData)
 *   await spritesheet.parse()
 *   const sprite = new AnimatedSprite(spritesheet.animations.idle)
 *   sprite.animationSpeed = 0.125 // 8fps
 */

import type { SpriteSheetMeta } from '../sprite-sheet.js'

export interface PixiExportOptions {
  /** Character name (e.g. "claude-agent") */
  name: string
  /** Sprite sheet filename (default: "{name}_sheet.png") */
  sheetFilename?: string
  /** Animation speed as FPS (default: from meta) */
  fps?: number
  /** Loop mode per animation (default: true for all) */
  loops?: Record<string, boolean>
}

export interface PixiExportResult {
  /** Aseprite JSON Hash content */
  jsonContent: string
  /** JSON filename */
  jsonFilename: string
  /** Sprite sheet filename */
  sheetFilename: string
}

/**
 * Generate an Aseprite JSON Hash sprite sheet descriptor
 * for PixiJS AnimatedSprite consumption.
 *
 * Supports two layouts:
 *   - "directions": rows = directions, anim names = "{state}_{dir}"
 *   - "states": rows = states, anim names = "{state}"
 *
 * The output format matches Aseprite's `--format json-hash` export,
 * which PixiJS's Spritesheet parser reads natively.
 */
export function generatePixiSpritesheetJSON(
  meta: SpriteSheetMeta,
  options: PixiExportOptions,
): PixiExportResult {
  const {
    name,
    sheetFilename: customSheetName,
    fps: customFps,
    loops = {},
  } = options

  const sheetFilename = customSheetName || `${name}_sheet.png`
  const jsonFilename = `${name}_sheet.json`
  const animFps = customFps ?? meta.fps

  // Detect layout from meta:
  //   - directions layout: meta.directions has multiple entries (down/up/left/right)
  //   - states layout: meta.directions has state names (idle/coding/thinking/error)
  const isDirectionLayout = meta.directions.length > 1 && meta.state !== 'states'
  const isStatesLayout = meta.state === 'states' ||
    meta.directions.some(d => ['idle', 'coding', 'thinking', 'error', 'done'].includes(d))

  // Build frames array (Aseprite JSON Hash format)
  const frames: Record<string, PixiFrame> = {}
  const animations: Record<string, number[]> = {}

  // Determine row labels
  const rowLabels = meta.directions

  for (let rowIdx = 0; rowIdx < rowLabels.length; rowIdx++) {
    const label = rowLabels[rowIdx]
    const rowFrames = meta.frames
      .filter(f => f.row === rowIdx)
      .sort((a, b) => a.col - b.col)

    // Animation name depends on layout
    const animName = isStatesLayout ? label : `${meta.state}_${label}`

    for (const frame of rowFrames) {
      // Frame key is "{filename} {frameNumber}" (Aseprite convention)
      const frameKey = `${sheetFilename} ${frame.col + rowIdx * meta.columns}`
      frames[frameKey] = {
        frame: { x: frame.x, y: frame.y, w: meta.frameWidth, h: meta.frameHeight },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: meta.frameWidth, h: meta.frameHeight },
        sourceSize: { w: meta.frameWidth, h: meta.frameHeight },
        duration: Math.round(1000 / animFps), // ms per frame
      }
      if (!animations[animName]) animations[animName] = []
      animations[animName].push(frame.col + rowIdx * meta.columns)
    }
  }

  // Build the full Aseprite JSON Hash structure
  const json: PixiSpritesheetJSON = {
    frames,
    animations,
    meta: {
      app: 'pixabots-extended',
      version: '1.0',
      image: sheetFilename,
      format: 'RGBA8888',
      size: { w: meta.sheetWidth, h: meta.sheetHeight },
      scale: '1',
      frameTags: Object.entries(animations).map(([name, frameIndices]) => ({
        name,
        from: frameIndices[0],
        to: frameIndices[frameIndices.length - 1],
        direction: 'forward',
        ...((loops[name] !== undefined ? !loops[name] : false) ? { direction: 'pingpong' as const } : {}),
      })),
    },
  }

  return {
    jsonContent: JSON.stringify(json, null, 2),
    jsonFilename,
    sheetFilename,
  }
}

/**
 * Alternative: generate a simpler PixiJS-only JSON format
 * (not Aseprite compatible, but more idiomatic for PixiJS)
 *
 * This format uses PixiJS's ISpritesheetData interface directly,
 * which some projects prefer over Aseprite format.
 */
export function generatePixiNativeJSON(
  meta: SpriteSheetMeta,
  options: PixiExportOptions,
): PixiExportResult {
  const {
    name,
    sheetFilename: customSheetName,
    fps: customFps,
    loops = {},
  } = options

  const sheetFilename = customSheetName || `${name}_sheet.png`
  const jsonFilename = `${name}_spritesheet.json`
  const animFps = customFps ?? meta.fps

  const isStatesLayout = meta.state === 'states' ||
    meta.directions.some(d => ['idle', 'coding', 'thinking', 'error', 'done'].includes(d))

  const frames: Record<string, PixiNativeFrame> = {}
  const animations: Record<string, PixiNativeAnim> = {}
  const rowLabels = meta.directions

  for (let rowIdx = 0; rowIdx < rowLabels.length; rowIdx++) {
    const label = rowLabels[rowIdx]
    const rowFrames = meta.frames
      .filter(f => f.row === rowIdx)
      .sort((a, b) => a.col - b.col)

    const animName = isStatesLayout ? label : `${meta.state}_${label}`

    for (const frame of rowFrames) {
      const frameKey = `frame_${frame.col}_${frame.row}`
      frames[frameKey] = {
        frame: { x: frame.x, y: frame.y, w: meta.frameWidth, h: meta.frameHeight },
      }
    }

    const frameKeys = rowFrames.map(f => `frame_${f.col}_${f.row}`)
    animations[animName] = {
      frames: frameKeys,
      speed: 1 / animFps, // PixiJS uses speed = fps reciprocal
      loop: loops[animName] !== undefined ? loops[animName] : true,
    }
  }

  const json = {
    frames,
    animations,
    meta: {
      image: sheetFilename,
      format: 'RGBA8888',
      size: { w: meta.sheetWidth, h: meta.sheetHeight },
      scale: 1,
    },
  }

  return {
    jsonContent: JSON.stringify(json, null, 2),
    jsonFilename,
    sheetFilename,
  }
}

// --- Type definitions ---

interface PixiFrame {
  frame: { x: number; y: number; w: number; h: number }
  rotated: boolean
  trimmed: boolean
  spriteSourceSize: { x: number; y: number; w: number; h: number }
  sourceSize: { w: number; h: number }
  duration: number
}

interface PixiNativeFrame {
  frame: { x: number; y: number; w: number; h: number }
}

interface PixiNativeAnim {
  frames: string[]
  speed: number
  loop: boolean
}

interface PixiSpritesheetJSON {
  frames: Record<string, PixiFrame>
  animations: Record<string, number[]>
  meta: {
    app: string
    version: string
    image: string
    format: string
    size: { w: number; h: number }
    scale: string
    frameTags: Array<{
      name: string
      from: number
      to: number
      direction: string
    }>
  }
}
