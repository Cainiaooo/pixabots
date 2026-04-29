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
} from './types.js'

// Asset Loader
export { AssetLoader } from './asset-loader.js'

// Compositor
export {
  compositeFrame,
  renderPixabotToBuffer,
  batchRenderToFiles,
} from './compositor.js'
