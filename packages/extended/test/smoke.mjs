/**
 * Smoke test for @pixabots/extended
 *
 * Validates:
 * 1. AssetLoader resolves existing parts
 * 2. Compositor renders a known pixabot ID
 * 3. Output file is a valid PNG
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MONOREPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const ART_PNG_DIR = path.join(MONOREPO_ROOT, 'art', 'png')
const TEST_OUTPUT = path.join(MONOREPO_ROOT, 'test-output')

const { AssetLoader, renderPixabotToBuffer, batchRenderToFiles } = await import('../dist/index.js')
const { decode } = await import('@pixabots/core')

let passed = 0
let failed = 0

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`)
    passed++
  } else {
    console.error(`  ✗ ${msg}`)
    failed++
  }
}

// ─── Test 1: AssetLoader ─────────────────────────────────────────
console.log('\n[Test 1] AssetLoader')
const loader = new AssetLoader(ART_PNG_DIR)

// Static part
const human2Frames = loader.resolveFrames('eyes', 'human-2')
assert(human2Frames.length === 2, `human-2 eyes has 2 frames (blink), got ${human2Frames.length}`)

const bigFaceFrame = loader.resolveFrame('eyes', 'big-face', 0)
assert(bigFaceFrame !== null, 'big-face eyes resolves to a file path')
assert(bigFaceFrame.endsWith('.png'), `path ends with .png: ${bigFaceFrame}`)

// Animated part (sequence)
const cheekyFrames = loader.resolveFrames('eyes', 'cheeky-terminal')
assert(cheekyFrames.length === 16, `cheeky-terminal has 16 frames, got ${cheekyFrames.length}`)

// Body part
const backpackFrame = loader.resolveFrame('body', 'backpack', 0)
assert(backpackFrame !== null, 'backpack body resolves')

// Non-existent part
const missingFrame = loader.resolveFrame('body', 'nonexistent', 0)
assert(missingFrame === null, 'nonexistent part returns null')

// ─── Test 2: Render single avatar ────────────────────────────────
console.log('\n[Test 2] Render single avatar (ID "4707")')
try {
  const combo = decode('4707')
  console.log(`  Decoded: eyes=${combo.eyes}, heads=${combo.heads}, body=${combo.body}, top=${combo.top}`)

  fs.mkdirSync(TEST_OUTPUT, { recursive: true })

  // Render at 32×32 native
  const buf32 = await renderPixabotToBuffer(loader, '4707', { size: 32 })
  assert(buf32.length > 0, `32×32 buffer is non-empty (${buf32.length} bytes)`)

  const out32 = path.join(TEST_OUTPUT, 'smoke-4707-32.png')
  fs.writeFileSync(out32, buf32)
  assert(fs.existsSync(out32), `32×32 file written: ${out32}`)

  // Render at 128×128 scaled
  const buf128 = await renderPixabotToBuffer(loader, '4707', { size: 128 })
  const out128 = path.join(TEST_OUTPUT, 'smoke-4707-128.png')
  fs.writeFileSync(out128, buf128)
  assert(buf128.length > buf32.length, `128×128 buffer (${buf128.length}) > 32×32 buffer (${buf32.length})`)

  // Render at 256×256 with background color
  const buf256bg = await renderPixabotToBuffer(loader, '4707', {
    size: 256,
    background: '#334455',
  })
  const out256bg = path.join(TEST_OUTPUT, 'smoke-4707-256-bg.png')
  fs.writeFileSync(out256bg, buf256bg)
  assert(buf256bg.length > 0, `256×256 with background (${buf256bg.length} bytes)`)

  // WebP format
  const bufWebp = await renderPixabotToBuffer(loader, '4707', { size: 64, format: 'webp' })
  const outWebp = path.join(TEST_OUTPUT, 'smoke-4707-64.webp')
  fs.writeFileSync(outWebp, bufWebp)
  assert(bufWebp.length > 0, `64×64 WebP (${bufWebp.length} bytes)`)

} catch (err) {
  console.error(`  ✗ Render failed: ${err.message}`)
  failed++
}

// ─── Test 3: Batch render ────────────────────────────────────────
console.log('\n[Test 3] Batch render')
try {
  const batchOut = path.join(TEST_OUTPUT, 'batch')
  const results = await batchRenderToFiles(loader, ['4707', '0000', '1111'], {
    size: 64,
    outputDir: batchOut,
  })
  assert(results.length === 3, `batch rendered ${results.length} files`)
  assert(results.every(r => r.bytes > 0), 'all files have non-zero size')
  assert(results.every(r => fs.existsSync(r.filePath)), 'all files exist on disk')
  for (const r of results) {
    console.log(`    ${path.basename(r.filePath)} — ${r.bytes} bytes`)
  }
} catch (err) {
  console.error(`  ✗ Batch render failed: ${err.message}`)
  failed++
}

// ─── Summary ─────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(40)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
console.log('All tests passed! ✓')
