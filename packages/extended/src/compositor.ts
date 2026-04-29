/**
 * @pixabots/extended — Compositor
 *
 * Generic layer compositor using Sharp.
 * Supports source assets of ANY size — automatically detects native dimensions
 * and renders accordingly. Output size is fully configurable.
 *
 * Render order is bottom-to-top: layers[0] is the bottom layer.
 */

import sharp from 'sharp'
import { AssetLoader } from './asset-loader.js'
import {
  decode,
  PARTS,
  LAYER_ORDER,
  type PartCategory,
} from '@pixabots/core'
import type { CompositorConfig, LayerDef, CanvasSize } from './types.js'

/**
 * Composite a single frame from a full CompositorConfig.
 *
 * Source assets can be any size. The compositor:
 *   - Creates a canvas at the source asset's native size
 *   - Composites all layers onto it
 *   - Caller then resizes to desired output size
 *
 * If source assets have mixed sizes, they are all resized to the
 * first asset's dimensions (the "native" size).
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

  // Create base canvas at specified size
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
    const meta = loader.getPartMeta(filePath)

    // Resize source asset to match canvas if needed
    if (meta.width !== size || meta.height !== size) {
      partImage = partImage.resize(size, size, { kernel: 'nearest', fit: 'contain' })
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
 * Automatically detects source asset size and renders at that native
 * resolution, then scales to the requested output size.
 */
export async function renderPixabotToBuffer(
  loader: AssetLoader,
  id: string,
  options: {
    size?: number
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

  // Auto-detect native size from source assets
  const native = loader.detectNativeSize()

  // Build layers in render order (bottom → top): top, body, heads, eyes
  const layers: LayerDef[] = LAYER_ORDER.map((cat: PartCategory) => ({
    category: cat,
    partIndex: combo[cat],
    frameIndex: 0,
  }))

  // Render at native source size
  const config: CompositorConfig = {
    size: native.width,
    layers,
    background,
  }

  let pipeline = await compositeFrame(loader, config)

  // Scale to output size if different from native
  if (size !== native.width) {
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
    size?: number
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

/**
 * Composite an AI agent frame with pixabots part overlays.
 *
 * Takes an AI-generated character frame as the base layer,
 * then scales and positions pixabots parts on top of it.
 *
 * Auto-scaling: pixabots parts (32×32) are scaled up to match
 * the agent frame size by default, but you can override with
 * custom offsets and scale per overlay.
 */
export async function compositeAgentFrame(
  loader: AssetLoader,
  config: import('./types.js').AgentComposeConfig,
): Promise<sharp.Sharp> {
  const {
    agentId,
    state,
    direction,
    frameIndex,
    overlays,
    outputSize,
    background,
  } = config

  // 1. Load the agent base frame
  const agentPath = loader.resolveAgentFrame(agentId, state, direction, frameIndex)
  if (!agentPath) {
    throw new Error(`Agent frame not found: ${agentId}/${state}/${direction}/${frameIndex}`)
  }

  const agentMeta = loader.getPartMeta(agentPath)
  const agentSize = Math.max(agentMeta.width, agentMeta.height)
  const targetSize = outputSize ?? agentSize

  // 2. Create canvas with optional background
  const bg = background && background !== 'transparent'
    ? background
    : { r: 0, g: 0, b: 0, alpha: 0 }

  let canvas = sharp({
    create: {
      width: targetSize,
      height: targetSize,
      channels: 4,
      background: bg,
    },
  })

  // 3. Load and resize agent frame to target
  const agentBuf = await sharp(agentPath)
    .resize(targetSize, targetSize, { kernel: 'nearest', fit: 'contain' })
    .png()
    .toBuffer()

  // 4. Build composites: agent base + part overlays
  const composites: sharp.OverlayOptions[] = []

  // Agent base layer
  composites.push({ input: agentBuf })

  // 5. Process each pixabots overlay
  for (const overlay of overlays) {
    const partList = PARTS[overlay.category as PartCategory]
    if (!partList) {
      console.warn(`Unknown category: ${overlay.category}`)
      continue
    }
    if (overlay.partIndex < 0 || overlay.partIndex >= partList.length) {
      console.warn(`Part index ${overlay.partIndex} out of range for ${overlay.category}`)
      continue
    }

    const part = partList[overlay.partIndex]
    const partPath = loader.resolveFrame(overlay.category, part.name, overlay.frameIndex ?? 0)
    if (!partPath) continue

    const partMeta = loader.getPartMeta(partPath)

    // Scale: overlay.scale or auto-scale to agent size
    const scaleFactor = overlay.scale ?? (targetSize / partMeta.width)

    const scaledW = Math.round(partMeta.width * scaleFactor)
    const scaledH = Math.round(partMeta.height * scaleFactor)

    let partImage = sharp(partPath)
      .resize(scaledW, scaledH, { kernel: 'nearest', fit: 'contain' })

    if (overlay.flipH) {
      partImage = partImage.flop()
    }

    let partBuf = await partImage.png().toBuffer()

    // Apply opacity if needed
    if (overlay.opacity !== undefined && overlay.opacity < 1) {
      partBuf = await sharp(partBuf)
        .ensureAlpha()
        .raw()
        .toBuffer()
        .then(raw => {
          // Multiply alpha channel by opacity
          for (let i = 3; i < raw.length; i += 4) {
            raw[i] = Math.round(raw[i] * (overlay.opacity ?? 1))
          }
          return sharp(raw, {
            raw: { width: scaledW, height: scaledH, channels: 4 },
          }).png().toBuffer()
        })
    }

    // Position: use provided offsets or auto-center horizontally near top
    const ox = overlay.offsetX ?? Math.round((targetSize - scaledW) / 2)
    const oy = overlay.offsetY ?? 0

    composites.push({
      input: partBuf,
      left: ox,
      top: oy,
    })
  }

  if (composites.length > 0) {
    canvas = canvas.composite(composites)
  }

  return canvas
}
