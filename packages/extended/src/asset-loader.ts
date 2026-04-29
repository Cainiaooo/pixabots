/**
 * @pixabots/extended — Asset Loader
 *
 * Scans the art/png directory, resolves part PNG file paths,
 * and caches them for fast repeated access.
 *
 * Directory layout:
 *   art/png/{category}/{partName}.png           — static part
 *   art/png/{category}/{partName}/              — animated part (subdirectory)
 *     {partName}-01.png .. {partName}-NN.png     — sequence frames
 *     {partName}-open.png / {partName}-closed.png — blink frames
 */

import fs from 'node:fs'
import path from 'node:path'
import type { PartAsset } from './types.js'

export class AssetLoader {
  private cache = new Map<string, string[]>()
  private partsDir: string

  constructor(partsDir: string) {
    this.partsDir = partsDir
  }

  /**
   * Resolve file paths for a given part across all its frames.
   * Returns an array of absolute file paths, one per frame.
   *
   * For static parts: returns ['art/png/eyes/big-face.png']
   * For blink parts:  returns ['art/png/eyes/human/human-open.png', '...-closed.png']
   * For sequence:     returns ['art/png/eyes/visor/visor-01.png', ..., 'visor-08.png']
   */
  resolveFrames(category: string, partName: string): string[] {
    const key = `${category}/${partName}`
    if (this.cache.has(key)) return this.cache.get(key)!

    // 1) Try flat file: art/png/{cat}/{name}.png
    const flat = path.join(this.partsDir, category, `${partName}.png`)
    if (fs.existsSync(flat)) {
      const result = [path.resolve(flat)]
      this.cache.set(key, result)
      return result
    }

    // 2) Try subdirectory: art/png/{cat}/{name}/
    const sub = path.join(this.partsDir, category, partName)
    if (fs.existsSync(sub) && fs.statSync(sub).isDirectory()) {
      const files = fs.readdirSync(sub)
        .filter(f => f.endsWith('.png'))
        .sort()
        .map(f => path.resolve(path.join(sub, f)))
      if (files.length > 0) {
        this.cache.set(key, files)
        return files
      }
    }

    // Not found — cache empty to avoid repeated FS hits
    this.cache.set(key, [])
    return []
  }

  /**
   * Get a single frame's file path.
   * Returns null if the part or frame doesn't exist.
   */
  resolveFrame(category: string, partName: string, frameIndex: number = 0): string | null {
    const frames = this.resolveFrames(category, partName)
    if (frameIndex >= 0 && frameIndex < frames.length) return frames[frameIndex]
    // Fallback to frame 0 if requested frame is out of range
    if (frames.length > 0) return frames[0]
    return null
  }

  /**
   * Build a full PartAsset descriptor for use in the compositor.
   */
  resolveAsset(category: string, partName: string, frameIndex: number = 0): PartAsset | null {
    const filePath = this.resolveFrame(category, partName, frameIndex)
    if (!filePath) return null
    return { category, partName, frameIndex, filePath }
  }

  /** Clear the resolution cache */
  clearCache(): void {
    this.cache.clear()
  }
}
