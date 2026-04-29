/**
 * @pixabots/extended — Public API
 */

// Types
export type {
  CanvasSize,
  LayerDef,
  CompositorConfig,
  PartAsset,
  AvatarExportConfig,
  PartOverlay,
  AgentComposeConfig,
} from './types.js'

// Asset Loader
export { AssetLoader } from './asset-loader.js'

// Compositor
export {
  compositeFrame,
  renderPixabotToBuffer,
  batchRenderToFiles,
  compositeAgentFrame,
} from './compositor.js'

// Sprite Sheet
export {
  generateSpriteSheet,
} from './sprite-sheet.js'
export type {
  SpriteSheetMeta,
  GenerateSheetOptions,
} from './sprite-sheet.js'

// Godot Exporter
export {
  generateGodotTres,
} from './exporters/godot.js'
export type {
  GodotExportOptions,
  GodotExportResult,
} from './exporters/godot.js'

// PixiJS Exporter
export {
  generatePixiSpritesheetJSON,
  generatePixiNativeJSON,
} from './exporters/pixi.js'
export type {
  PixiExportOptions,
  PixiExportResult,
} from './exporters/pixi.js'
