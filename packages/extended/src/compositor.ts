/**
 * @pixabots/extended — Compositor
 *
 * Generic layer compositor using Sharp.
 * Takes a list of layers (each referencing a PNG file) and composites them
 * onto a canvas of configurable size.
 *
 * Render order is bottom-to-top: layers[0] is the bottom layer.
 */

import sharp from 'sharp'
import { AssetLoader } from './asset-loader.js'
import {
  decode,
  PARTS,
  LAYER_ORDER,
  resolveFrameIndex,
  type PartCategory,
} from '@pixabots/core'
import type { CompositorConfig, LayerDef, CanvasSize } from './types.js'

/** Native pixel size of source assets */
const NATIVE_SIZE = 32

/**
 * Composite a single frame from a full CompositorConfig.
 * Returns a Sharp pipeline (not yet finalized) so the caller can
 * add format-specific options (PNG, WebP, resize, etc.).
 */
export async function compositeFrame(
  loader: AssetLoader,
  config: CompositorConfig,
): Promise<sharp.Sharp> {
  const { size, layers, background, scaleUp = true } = config

  // Background color
  const bg = background && background !== 'transparent'
    ? background
    : { r: 0, g: 0, b: 0, alpha: 0 }

  // Create base canvas
  let canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bg,
    },
  })

  if (layers.length === 0) return canvas

  // Build composite operations
  const composites: sharp.OverlayOptions[] = []

  for (const layer of layers) {
    const partList = PARTS[layer.category as PartCategory]
    if (!partList) continue
    if (layer.partIndex < 0 || layer.partIndex >= partList.length) continue

    const part = partList[layer.partIndex]
    const filePath = loader.resolveFrame(layer.category, part.name, layer.frameIndex ?? 0)
    if (!filePath) continue

    // Load the part image
    let partImage = sharp(filePath)

    // Scale up if needed (nearest-neighbor to preserve pixel art)
    if (scaleUp && size > NATIVE_SIZE) {
      partImage = partImage.resize(size, size, { kernel: 'nearest' })
    }

    // Apply horizontal flip if needed
    if (layer.flipH) {
      partImage = partImage.flop()
    }

    // Get buffer for compositing
    const buf = await partImage.toBuffer()

    const overlay: sharp.OverlayOptions = { input: buf }

    // Apply offsets (only if non-zero)
    const ox = layer.offsetX ?? 0
    const oy = layer.offsetY ?? 0
    if (ox !== 0 || oy !== 0) {
      overlay.left = ox
      overlay.top = oy
    }

    composites.push(overlay)
  }

  if (composites.length > 0) {
    canvas = canvas.composite(composites)
  }

  return canvas
}

/**
 * High-level: render a pixabot ID to a PNG Buffer.
 *
 * This is the main entry point for batch avatar generation.
 */
export async function renderPixabotToBuffer(
  loader: AssetLoader,
  id: string,
  options: {
    size?: CanvasSize
    background?: string
    format?: 'png' | 'webp'
  } = {},
): Promise<Buffer> {
  const {
    size = 128,
    background,
    format = 'png',
  } = options

  const combo = decode(id)

  // Build layers in render order (bottom → top): top, body, heads, eyes
  const layers: LayerDef[] = LAYER_ORDER.map((cat: PartCategory) => ({
    category: cat,
    partIndex: combo[cat],
    frameIndex: 0,
  }))

  const config: CompositorConfig = {
    size: NATIVE_SIZE,
    layers,
    background,
  }

  // Render at native 32×32 first, then scale up
  let pipeline = await compositeFrame(loader, config)

  if (size !== NATIVE_SIZE) {
    pipeline = pipeline.resize(size, size, { kernel: 'nearest' })
  }

  if (format === 'webp') {
    return pipeline.webp({ lossless: true }).toBuffer()
  }
  return pipeline.png().toBuffer()
}

/**
 * Batch render multiple pixabot IDs to files.
 */
export async function batchRenderToFiles(
  loader: AssetLoader,
  ids: string[],
  options: {
    size?: CanvasSize
    background?: string
    format?: 'png' | 'webp'
    outputDir: string
    filenamePrefix?: string
  },
): Promise<{ id: string; filePath: string; bytes: number }[]> {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const { size = 128, format = 'png', background, outputDir, filenamePrefix = 'pixabot_' } = options

  // Ensure output dir exists
  fs.mkdirSync(outputDir, { recursive: true })

  const results: { id: string; filePath: string; bytes: number }[] = []

  for (const id of ids) {
    const buf = await renderPixabotToBuffer(loader, id, { size, background, format })
    const ext = format === 'webp' ? 'webp' : 'png'
    const filename = `${filenamePrefix}${id}.${ext}`
    const filePath = path.join(outputDir, filename)
    fs.writeFileSync(filePath, buf)
    results.push({ id, filePath, bytes: buf.length })
  }

  return results
}
