# @pixabots/extended

Extended rendering pipeline for Pixabots: batch avatar generation, multi-size output, sprite sheet support.

## Install

```bash
pnpm add @pixabots/extended
```

## CLI Usage

```bash
# Batch render specific IDs
npx pixabots-extended avatar --ids 4707,0000,1111 --size 128 --output ./avatars/

# Generate random avatars
npx pixabots-extended avatar --random 50 --size 256 --output ./avatars/

# Deterministic avatar from a seed string
npx pixabots-extended avatar --seed "user@example.com" --size 128 --output ./avatars/

# WebP format with background color
npx pixabots-extended avatar --ids 4707 --size 64 --format webp --background "#1a1a2e" --output ./avatars/

# Read IDs from a file
npx pixabots-extended avatar --id-file ids.txt --output ./avatars/
```

## Programmatic API

```typescript
import { AssetLoader, renderPixabotToBuffer, batchRenderToFiles } from '@pixabots/extended'

const loader = new AssetLoader('./art/png')

// Render a single avatar
const pngBuffer = await renderPixabotToBuffer(loader, '4707', { size: 128 })
const webpBuffer = await renderPixabotToBuffer(loader, '4707', { size: 256, format: 'webp' })

// Batch render to files
const results = await batchRenderToFiles(loader, ['4707', '0000', '1111'], {
  size: 128,
  format: 'png',
  outputDir: './avatars/',
})
```

## Architecture

```
@pixabots/extended
├── src/
│   ├── index.ts          # Public API
│   ├── types.ts          # Type definitions
│   ├── asset-loader.ts   # PNG file resolution & caching
│   ├── compositor.ts     # Sharp-based layer compositing
│   └── cli.ts            # CLI entry point
├── test/
│   └── smoke.mjs         # Smoke tests
└── package.json
```

### Design Principles

- **No modifications to @pixabots/core** — extended is a pure consumer layer
- **32×32 native rendering, nearest-neighbor upscale** — pixel-perfect at any size
- **Layer-based compositing** — extensible beyond the 4 built-in categories
- **File-driven asset resolution** — convention over configuration from `art/png/`

## Test

```bash
pnpm --filter @pixabots/extended test
```

## License

MIT
