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
import { AssetLoader } from './asset-loader.js'
import { batchRenderToFiles, compositeAgentFrame } from './compositor.js'
import { generateGodotTres } from './exporters/godot.js'
import { randomId, seededId, isValidId } from '@pixabots/core'

// Resolve paths relative to the monorepo root
// Use process.argv[1] (CLI script path) to avoid import.meta issues in CJS builds
const CLI_DIR = path.dirname(process.argv[1] || __dirname || '.')
const MONOREPO_ROOT = path.resolve(CLI_DIR, '..', '..', '..')
const ART_PNG_DIR = path.join(MONOREPO_ROOT, 'art', 'png')
const ART_EXTENDED_DIR = path.join(MONOREPO_ROOT, 'art', 'png-extended')

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

// ─── Command: compose ─────────────────────────────────────────────

async function cmdCompose(args: Record<string, any>) {
  const {
    agent: agentId,
    state,
    direction,
    frame: frameStr,
    parts: partsStr,
    'part-scale': partScaleStr,
    'part-offset-x': partOxStr,
    'part-offset-y': partOyStr,
    output: outputDir,
    size: sizeStr,
    format,
    background,
  } = args

  if (!agentId) {
    console.error('Error: --agent is required (e.g. cyber-catgirl)')
    process.exit(1)
  }
  if (!partsStr) {
    console.error('Error: --parts is required (e.g. top:horns,eyes:glasses)')
    process.exit(1)
  }
  if (!outputDir) {
    console.error('Error: --output is required')
    process.exit(1)
  }

  const animState = state || 'walk'
  const dir = direction || 'down'
  const frameIdx = parseInt(frameStr) || 0
  const fmt = format || 'png'
  const bg = background || undefined
  const outputSize = sizeStr ? parseInt(sizeStr) : undefined

  // Parse parts: "top:horns,eyes:glasses" → [{category, partIndex}]
  const { getPartIndex } = await import('@pixabots/core')
  const partEntries = String(partsStr).split(',').map(s => s.trim()).filter(Boolean)
  const overlays: import('./types.js').PartOverlay[] = []

  for (const entry of partEntries) {
    const [cat, name] = entry.split(':')
    if (!cat || !name) {
      console.warn(`Skipping invalid part: ${entry} (expected category:name)`)
      continue
    }
    const idx = getPartIndex(cat as any, name)
    if (idx < 0) {
      console.warn(`Part not found: ${cat}:${name}`)
      continue
    }
    const overlay: import('./types.js').PartOverlay = {
      category: cat,
      partIndex: idx,
    }
    if (partScaleStr) overlay.scale = parseFloat(partScaleStr)
    if (partOxStr) overlay.offsetX = parseInt(partOxStr)
    if (partOyStr) overlay.offsetY = parseInt(partOyStr)
    overlays.push(overlay)
  }

  if (overlays.length === 0) {
    console.error('Error: no valid parts to overlay')
    process.exit(1)
  }

  console.log(`Compositing: ${agentId}/${animState}/${dir}#${frameIdx} + [${overlays.map(o => o.category + '#' + o.partIndex).join(', ')}]`)

  const loader = new AssetLoader(ART_PNG_DIR)

  // If no explicit outputSize, detect from agent frame
  const agentPath = loader.resolveAgentFrame(agentId, animState, dir, frameIdx)
  if (!agentPath) {
    console.error(`Error: agent frame not found for ${agentId}/${animState}/${dir}/${frameIdx}`)
    process.exit(1)
  }

  const pipeline = await compositeAgentFrame(loader, {
    agentId,
    state: animState,
    direction: dir,
    frameIndex: frameIdx,
    overlays,
    outputSize,
    background: bg,
  })

  // Ensure output dir
  fs.mkdirSync(outputDir, { recursive: true })
  const ext = fmt === 'webp' ? 'webp' : 'png'
  const filename = `${agentId}_${animState}_${dir}_${frameIdx}_composed.${ext}`
  const filePath = path.join(outputDir, filename)

  if (fmt === 'webp') {
    await pipeline.webp({ lossless: true }).toFile(filePath)
  } else {
    await pipeline.png().toFile(filePath)
  }

  const stats = fs.statSync(filePath)
  console.log(`\nDone! ${filePath} (${stats.size} bytes)`)
}

// ─── Command: sheet ──────────────────────────────────────────────

async function cmdSheet(args: Record<string, any>) {
  const {
    agent: agentId,
    state,
    output: outputDir,
    fps: fpsStr,
    'frame-size': frameSizeStr,
    'res-prefix': resPrefix,
    padding: padStr,
  } = args

  if (!agentId) {
    console.error('Error: --agent is required')
    process.exit(1)
  }
  if (!outputDir) {
    console.error('Error: --output is required')
    process.exit(1)
  }

  const animState = state || 'walk'
  const animFps = fpsStr ? parseInt(fpsStr) : 8
  const frameSize = frameSizeStr ? parseInt(frameSizeStr) : undefined
  const padding = padStr ? parseInt(padStr) : 0

  console.log(`Generating sprite sheet: ${agentId} / ${animState} (fps=${animFps})`)

  // Call Python script for sprite sheet generation (Pillow is faster than Sharp in WSL)
  const scriptPath = path.resolve(MONOREPO_ROOT, 'scripts/generate_sprite_sheet.py')
  const pythonBin = path.resolve(MONOREPO_ROOT, '.venv/bin/python')

  const pyArgs = [
    scriptPath,
    '--agent-id', agentId,
    '--state', animState,
    '--base-dir', ART_EXTENDED_DIR,
    '--output-dir', path.resolve(outputDir),
    '--fps', String(animFps),
  ]
  if (frameSize) pyArgs.push('--frame-size', String(frameSize))
  if (padding > 0) pyArgs.push('--padding', String(padding))

  const { execFile } = await import('child_process')
  const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(pythonBin, pyArgs, { timeout: 60_000 }, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve({ stdout, stderr })
    })
  })

  if (result.stderr) console.error(result.stderr)
  console.log(result.stdout)

  // Read metadata JSON to generate Godot .tres
  const metaFilename = `${agentId}_${animState}_sheet.json`
  const metaPath = path.join(path.resolve(outputDir), metaFilename)
  const sheetFilename = `${agentId}_${animState}_sheet.png`

  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    const prefix = resPrefix || `res://assets/characters/${agentId}/`
    const { tresContent, tresFilename } = generateGodotTres(meta, {
      name: agentId,
      resourcePrefix: prefix,
      sheetFilename,
    })
    const tresPath = path.join(path.resolve(outputDir), tresFilename)
    fs.writeFileSync(tresPath, tresContent)
    console.log(`  Godot: ${tresPath}`)
  }

  console.log(`\nDone! Files generated in ${path.resolve(outputDir)}/`)
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
    // compose-specific
    agent:      { type: 'string' },
    state:      { type: 'string' },
    direction:  { type: 'string' },
    frame:      { type: 'string' },
    parts:      { type: 'string' },
    'part-scale':    { type: 'string' },
    'part-offset-x': { type: 'string' },
    'part-offset-y': { type: 'string' },
    // sheet-specific
    fps:        { type: 'string' },
    'frame-size': { type: 'string' },
    'res-prefix': { type: 'string' },
    padding:    { type: 'string' },
  },
})

const command = positionals[0]

if (!command || command === 'help' || command === '--help') {
  console.log(`
@pixabots/extended CLI — Pixobots avatar & sprite rendering

Commands:
  avatar    Batch render pixabot avatars
  compose   Compose AI agent frame + pixabots part overlays
  sheet     Generate sprite sheet + Godot .tres from AI agent frames

Usage:
  pixabots-extended avatar --ids 4707,abcd --size 128 --output ./out/
  pixabots-extended avatar --random 50 --size 256 --output ./out/
  pixabots-extended avatar --seed "hello" --size 64 --output ./out/ --format webp

  pixabots-extended compose --agent cyber-catgirl --parts top:horns,eyes:glasses --output ./out/
  pixabots-extended compose --agent cyber-catgirl --state walk --direction right --frame 2 --parts top:antenna --part-scale 0.5 --output ./out/

  pixabots-extended sheet --agent cyber-catgirl --output ./out/
  pixabots-extended sheet --agent cyber-catgirl --state walk --fps 10 --frame-size 256 --output ./out/

Options:
  --ids, -i       Comma-separated pixabot IDs
  --random, -r    Generate N random pixabots
  --seed, -s      Generate one deterministic pixabot from a seed string
  --id-file       Read IDs from a text file (one per line, or comma-separated)
  --size, -z      Output size in pixels (default: 128)
  --output, -o    Output directory (required)
  --format, -f    Output format: png or webp (default: png)
  --background    Background color hex string (default: transparent)

  --agent         Agent ID for compose (e.g. cyber-catgirl)
  --state         Animation state (default: walk)
  --direction     Direction: down, up, left, right (default: down)
  --frame         Frame index 0-based (default: 0)
  --parts         Comma-separated category:name pairs (e.g. top:horns,eyes:glasses)
  --part-scale    Override scale factor for overlays
  --part-offset-x X offset for all overlays
  --part-offset-y Y offset for all overlays

  --fps            Animation FPS for sheet (default: 8)
  --frame-size     Force frame size in pixels (default: auto-detect)
  --res-prefix     Godot resource path prefix (default: res://assets/characters/{agent}/)
  --padding        Padding between frames in pixels (default: 0)
`)
  process.exit(0)
}

if (command === 'avatar') {
  cmdAvatar(values).catch(err => {
    console.error('Fatal:', err)
    process.exit(1)
  })
} else if (command === 'compose') {
  cmdCompose(values).catch(err => {
    console.error('Fatal:', err)
    process.exit(1)
  })
} else if (command === 'sheet') {
  cmdSheet(values).catch(err => {
    console.error('Fatal:', err)
    process.exit(1)
  })
} else {
  console.error(`Unknown command: ${command}`)
  console.error('Run with --help for usage')
  process.exit(1)
}
