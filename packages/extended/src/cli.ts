#!/usr/bin/env node
/**
 * @pixabots/extended CLI
 *
 * Usage:
 *   pixabots-extended avatar --ids 4707,abcd,1234 --size 128 --output ./out/
 *   pixabots-extended avatar --random 10 --size 256 --output ./out/
 *   pixabots-extended avatar --seed "user@example.com" --size 128 --output ./out/
 *   pixabots-extended avatar --id-file ids.txt --size 64 --output ./out/ --format webp
 */

import { parseArgs } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AssetLoader } from './asset-loader.js'
import { batchRenderToFiles } from './compositor.js'
import { randomId, seededId, isValidId } from '@pixabots/core'

// Resolve paths relative to this file's location
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MONOREPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const ART_PNG_DIR = path.join(MONOREPO_ROOT, 'art', 'png')

// ─── Command: avatar ────────────────────────────────────────────────

async function cmdAvatar(args: Record<string, any>) {
  const {
    ids: idsStr,
    random: randomCount,
    seed: seedStr,
    'id-file': idFile,
    size,
    output: outputDir,
    format,
    background,
  } = args

  const pixelSize = parseInt(size) || 128
  const fmt = format || 'png'
  const bg = background || undefined

  if (!outputDir) {
    console.error('Error: --output is required')
    process.exit(1)
  }

  // Collect IDs
  const ids: string[] = []

  if (idsStr) {
    ids.push(...String(idsStr).split(',').map(s => s.trim()).filter(Boolean))
  }

  if (idFile) {
    const content = fs.readFileSync(idFile, 'utf-8')
    ids.push(...content.split(/[\n,]/).map(s => s.trim()).filter(Boolean))
  }

  if (randomCount) {
    const count = parseInt(randomCount) || 10
    for (let i = 0; i < count; i++) {
      ids.push(randomId())
    }
  }

  if (seedStr) {
    ids.push(seededId(String(seedStr)))
  }

  // Validate IDs
  const validIds = ids.filter(id => {
    if (isValidId(id)) return true
    console.warn(`Warning: skipping invalid ID "${id}"`)
    return false
  })

  if (validIds.length === 0) {
    console.error('Error: no valid IDs to render. Use --ids, --random, --seed, or --id-file')
    process.exit(1)
  }

  console.log(`Rendering ${validIds.length} pixabot(s) at ${pixelSize}×${pixelSize} (${fmt})...`)

  const loader = new AssetLoader(ART_PNG_DIR)

  const results = await batchRenderToFiles(loader, validIds, {
    size: pixelSize as any,
    format: fmt as 'png' | 'webp',
    background: bg,
    outputDir: path.resolve(outputDir),
  })

  console.log(`\nDone! ${results.length} avatar(s) saved to ${path.resolve(outputDir)}/`)
  for (const r of results) {
    console.log(`  ${path.basename(r.filePath)} (${r.bytes} bytes)`)
  }
}

// ─── Main ───────────────────────────────────────────────────────────

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    ids:        { type: 'string', short: 'i' },
    random:     { type: 'string', short: 'r' },
    seed:       { type: 'string', short: 's' },
    'id-file':  { type: 'string' },
    size:       { type: 'string', short: 'z', default: '128' },
    output:     { type: 'string', short: 'o' },
    format:     { type: 'string', short: 'f', default: 'png' },
    background: { type: 'string', short: 'b' },
  },
})

const command = positionals[0]

if (!command || command === 'help' || command === '--help') {
  console.log(`
@pixabots/extended CLI — Pixobots avatar & sprite rendering

Commands:
  avatar    Batch render pixabot avatars

Usage:
  pixabots-extended avatar --ids 4707,abcd --size 128 --output ./out/
  pixabots-extended avatar --random 50 --size 256 --output ./out/
  pixabots-extended avatar --seed "hello" --size 64 --output ./out/ --format webp
  pixabots-extended avatar --id-file ids.txt --output ./out/ --background "#ff0000"

Options:
  --ids, -i       Comma-separated pixabot IDs
  --random, -r    Generate N random pixabots
  --seed, -s      Generate one deterministic pixabot from a seed string
  --id-file       Read IDs from a text file (one per line, or comma-separated)
  --size, -z      Output size in pixels (default: 128)
  --output, -o    Output directory (required)
  --format, -f    Output format: png or webp (default: png)
  --background    Background color hex string (default: transparent)
`)
  process.exit(0)
}

if (command === 'avatar') {
  cmdAvatar(values).catch(err => {
    console.error('Fatal:', err)
    process.exit(1)
  })
} else {
  console.error(`Unknown command: ${command}`)
  console.error('Run with --help for usage')
  process.exit(1)
}
