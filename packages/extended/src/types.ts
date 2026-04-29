/**
 * @pixabots/extended — Types
 *
 * Extended type definitions for the rendering pipeline.
 */

/** Supported rendering canvas sizes (or any positive integer) */
export type CanvasSize = number

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

/** A single pixabots part overlay for agent compositing */
export interface PartOverlay {
  /** Part category (eyes, heads, body, top) */
  category: string
  /** Part index within the category */
  partIndex: number
  /** Animation frame index (default 0) */
  frameIndex?: number
  /** Override offset X (pixels, relative to canvas) */
  offsetX?: number
  /** Override offset Y (pixels, relative to canvas) */
  offsetY?: number
  /** Flip horizontally */
  flipH?: boolean
  /** Override scale factor (defaults to auto: agentSize / partNativeSize) */
  scale?: number
  /** Opacity 0-1 (default 1) */
  opacity?: number
}

/** Configuration for compositing an AI agent frame + pixabots overlays */
export interface AgentComposeConfig {
  /** Agent ID (e.g. "cyber-catgirl") */
  agentId: string
  /** Animation state (e.g. "walk") */
  state: string
  /** Direction (down, up, left, right) */
  direction: string
  /** Frame index within the animation (0-based) */
  frameIndex: number
  /** Pixabots parts to overlay on top of the agent frame */
  overlays: PartOverlay[]
  /** Output size (defaults to agent frame native size) */
  outputSize?: number
  /** Background color (default: transparent) */
  background?: string
}
