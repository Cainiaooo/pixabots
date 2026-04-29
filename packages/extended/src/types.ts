/**
 * @pixabots/extended — Types
 *
 * Extended type definitions for the rendering pipeline.
 */

/** Supported rendering canvas sizes */
export type CanvasSize = 32 | 48 | 64 | 128 | 256 | 512

/** Layer definition for compositing */
export interface LayerDef {
  /** Part category name */
  category: string
  /** Part index within that category */
  partIndex: number
  /** Animation frame index (0 = static / first frame) */
  frameIndex?: number
  /** Horizontal pixel offset (default 0) */
  offsetX?: number
  /** Vertical pixel offset (default 0) */
  offsetY?: number
  /** Flip horizontally (used for left direction from right assets) */
  flipH?: boolean
}

/** Configuration for compositing a single frame */
export interface CompositorConfig {
  /** Canvas size in pixels */
  size: CanvasSize
  /** Layers to composite, bottom-to-top order */
  layers: LayerDef[]
  /** Optional background color (hex string like '#ff0000' or 'transparent') */
  background?: string
  /** Scale source assets from 32×32 to target size using nearest-neighbor */
  scaleUp?: boolean
}

/** Resolved PNG buffer for a single part frame */
export interface PartAsset {
  /** Category name */
  category: string
  /** Part name */
  partName: string
  /** Frame index */
  frameIndex: number
  /** Absolute file path to the PNG */
  filePath: string
}

/** Batch avatar export configuration */
export interface AvatarExportConfig {
  /** Pixabot IDs to render */
  ids: string[]
  /** Output pixel size */
  size: CanvasSize
  /** Output format */
  format: 'png' | 'webp'
  /** Background color (default: transparent) */
  background?: string
  /** Output directory */
  outputDir: string
  /** Optional seed for deterministic random generation (if ids are 'random:N') */
  seed?: string
}
