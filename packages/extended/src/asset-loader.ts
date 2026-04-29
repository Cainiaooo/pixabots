/**
 * @pixabots/extended — Asset Loader
 *
 * Scans the art/png directory, resolves part PNG file paths,
 * and caches them for fast repeated access.
 *
 * Also supports detecting the actual pixel dimensions of source assets
 * so the compositor can work with any size, not just 32×32.
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

/** Cached metadata for a single part PNG file */
interface PartMeta {
  filePath: string
  width: number
  height: number
}

export class AssetLoader {
  private frameCache = new Map<string, string[]>()
  private metaCache = new Map<string, PartMeta>()
  private partsDir: string

  constructor(partsDir: string) {
    this.partsDir = partsDir
  }

  /**
   * Resolve file paths for a given part across all its frames.
   * Returns an array of absolute file paths, one per frame.
   */
  resolveFrames(category: string, partName: string): string[] {
    const key = `${category}/${partName}`
    if (this.frameCache.has(key)) return this.frameCache.get(key)!

    // 1) Try flat file: art/png/{cat}/{name}.png
    const flat = path.join(this.partsDir, category, `${partName}.png`)
    if (fs.existsSync(flat)) {
      const result = [path.resolve(flat)]
      this.frameCache.set(key, result)
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
        this.frameCache.set(key, files)
        return files
      }
    }

    this.frameCache.set(key, [])
    return []
  }

  /**
   * Get a single frame's file path.
   * Returns null if the part or frame doesn't exist.
   */
  resolveFrame(category: string, partName: string, frameIndex: number = 0): string | null {
    const frames = this.resolveFrames(category, partName)
    if (frameIndex >= 0 && frameIndex < frames.length) return frames[frameIndex]
    if (frames.length > 0) return frames[0]
    return null
  }

  /**
   * Get metadata (including dimensions) for a specific part frame.
   * Reads PNG header only (no full decode) for efficiency.
   */
  getPartMeta(filePath: string): PartMeta {
    if (this.metaCache.has(filePath)) return this.metaCache.get(filePath)!

    const buf = fs.readFileSync(filePath)

    // Parse PNG IHDR chunk for width/height (always at offset 16)
    // PNG magic: 8 bytes, then IHDR length(4) + type(4) + width(4) + height(4)
    let width = 0
    let height = 0
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
      width = buf.readUInt32BE(16)
      height = buf.readUInt32BE(20)
    }

    const meta: PartMeta = { filePath, width, height }
    this.metaCache.set(filePath, meta)
    return meta
  }

  /**
   * Detect the native size of source assets by reading the first found PNG.
   * Returns the dimensions of the first valid part PNG, or 32×32 as fallback.
   */
  detectNativeSize(): { width: number; height: number } {
    // Walk known categories and find the first PNG
    for (const catDir of fs.readdirSync(this.partsDir)) {
      const catPath = path.join(this.partsDir, catDir)
      if (!fs.statSync(catPath).isDirectory()) continue

      const entries = fs.readdirSync(catPath)
      for (const entry of entries) {
        // Check flat PNG
        if (entry.endsWith('.png')) {
          const filePath = path.join(catPath, entry)
          const meta = this.getPartMeta(filePath)
          if (meta.width > 0 && meta.height > 0) return { width: meta.width, height: meta.height }
        }
        // Check subdirectory
        const subPath = path.join(catPath, entry)
        if (fs.statSync(subPath).isDirectory()) {
          const subFiles = fs.readdirSync(subPath).filter(f => f.endsWith('.png')).sort()
          if (subFiles.length > 0) {
            const filePath = path.join(subPath, subFiles[0])
            const meta = this.getPartMeta(filePath)
            if (meta.width > 0 && meta.height > 0) return { width: meta.width, height: meta.height }
          }
        }
      }
    }

    return { width: 32, height: 32 }
  }

  /**
   * Build a full PartAsset descriptor for use in the compositor.
   */
  resolveAsset(category: string, partName: string, frameIndex: number = 0): PartAsset | null {
    const filePath = this.resolveFrame(category, partName, frameIndex)
    if (!filePath) return null
    return { category, partName, frameIndex, filePath }
  }

  /** Clear all caches */
  clearCache(): void {
    this.frameCache.clear()
    this.metaCache.clear()
  }
}
