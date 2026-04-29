/**
 * @pixabots/extended — Sprite Sheet Generator
 *
 * Packs AI agent animation frames into a single sprite sheet PNG
 * with accompanying metadata JSON.
 *
 * Layout: rows = directions, columns = frames
 *   Row 0: down   (walk-01, walk-02, ..., walk-N)
 *   Row 1: up
 *   Row 2: left
 *   Row 3: right
 */

import sharp from 'sharp'
import { AssetLoader } from './asset-loader.js'

export interface SpriteSheetMeta {
  /** Agent ID */
  agentId: string
  /** Animation state */
  state: string
  /** Dimensions */
  sheetWidth: number
  sheetHeight: number
  /** Single frame size */
  frameWidth: number
  frameHeight: number
  /** Number of columns (frames per direction) */
  columns: number
  /** Number of rows (directions) */
  rows: number
  /** Direction order in rows */
  directions: string[]
  /** Frames per direction */
  framesPerDirection: number
  /** FPS for playback */
  fps: number
  /** Per-frame metadata */
  frames: Array<{
    row: number
    col: number
    direction: string
    frameIndex: number
    x: number
    y: number
  }>
}

export interface GenerateSheetOptions {
  /** Agent ID */
  agentId: string
  /** Animation state (default: 'walk') */
  state?: string
  /** Directions to include (default: ['down','up','left','right']) */
  directions?: string[]
  /** Output frame size (default: auto-detect from source) */
  frameSize?: number
  /** FPS for metadata (default: 8) */
  fps?: number
  /** Background color (default: transparent) */
  background?: string
  /** Padding between frames in pixels (default: 0) */
  padding?: number
}

/**
 * Generate a sprite sheet from an AI agent's animation frames.
 *
 * Returns both the PNG buffer and structured metadata.
 */
export async function generateSpriteSheet(
  loader: AssetLoader,
  options: GenerateSheetOptions,
): Promise<{ image: Buffer; meta: SpriteSheetMeta }> {
  const {
    agentId,
    state = 'walk',
    directions = ['down', 'up', 'left', 'right'],
    frameSize,
    fps = 8,
    background,
    padding = 0,
  } = options

  // Collect frames per direction
  const dirFrames: Map<string, string[]> = new Map()
  let detectedFrameSize = 0

  for (const dir of directions) {
    const frames: string[] = []
    let idx = 0
    while (true) {
      const path = loader.resolveAgentFrame(agentId, state, dir, idx)
      if (!path) break
      frames.push(path)
      if (detectedFrameSize === 0) {
        const meta = loader.getPartMeta(path)
        detectedFrameSize = Math.max(meta.width, meta.height)
      }
      idx++
    }
    if (frames.length > 0) {
      dirFrames.set(dir, frames)
    }
  }

  if (dirFrames.size === 0) {
    throw new Error(`No frames found for agent "${agentId}" state "${state}"`)
  }

  const fw = frameSize ?? detectedFrameSize
  const fh = fw
  const maxFrames = Math.max(...[...dirFrames.values()].map(f => f.length))
  const activeDirections = directions.filter(d => dirFrames.has(d))

  const cols = maxFrames
  const rows = activeDirections.length
  const pad = padding

  const sheetW = cols * fw + (cols - 1) * pad
  const sheetH = rows * fh + (rows - 1) * pad

  // Build metadata
  const meta: SpriteSheetMeta = {
    agentId,
    state,
    sheetWidth: sheetW,
    sheetHeight: sheetH,
    frameWidth: fw,
    frameHeight: fh,
    columns: cols,
    rows,
    directions: activeDirections,
    framesPerDirection: maxFrames,
    fps,
    frames: [],
  }

  // Collect all frame buffers first, then composite in one pass
  const frameBuffers: Array<{ buf: Buffer; x: number; y: number }> = []

  for (let rowIdx = 0; rowIdx < activeDirections.length; rowIdx++) {
    const dir = activeDirections[rowIdx]
    const frames = dirFrames.get(dir)!

    for (let colIdx = 0; colIdx < frames.length; colIdx++) {
      const x = colIdx * (fw + pad)
      const y = rowIdx * (fh + pad)

      let frameImg = sharp(frames[colIdx])

      // Only resize if source differs from target
      const frameMeta = loader.getPartMeta(frames[colIdx])
      if (frameMeta.width !== fw || frameMeta.height !== fh) {
        frameImg = frameImg.resize(fw, fh, { kernel: 'nearest', fit: 'contain' })
      }

      const buf = await frameImg.png().toBuffer()
      frameBuffers.push({ buf, x, y })

      meta.frames.push({
        row: rowIdx,
        col: colIdx,
        direction: dir,
        frameIndex: colIdx,
        x,
        y,
      })
    }
  }

  // Now create canvas and composite everything in one pass
  const bg = background && background !== 'transparent'
    ? background
    : { r: 0, g: 0, b: 0, alpha: 0 }

  const composites: sharp.OverlayOptions[] = frameBuffers.map(f => ({
    input: f.buf,
    left: f.x,
    top: f.y,
  }))

  let canvas = sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 4,
      background: bg,
    },
  })

  if (composites.length > 0) {
    canvas = canvas.composite(composites)
  }

  const image = await canvas.png().toBuffer()

  return { image, meta }
}
