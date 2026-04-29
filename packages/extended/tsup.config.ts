import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  clean: true,
  sourcemap: true,
  // Sharp is a native module — don't bundle it
  external: ['sharp'],
})
