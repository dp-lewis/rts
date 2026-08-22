import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig, type Plugin } from 'vite';

const ART_DIR = 'images';

/**
 * Copy the Kenney art pack into the bundle.
 *
 * The sprites are loaded by URL at run time rather than imported, so Vite never
 * sees them and the production bundle shipped with no textures at all — every
 * image 404'd while `npm run dev` looked perfect, because the dev server serves
 * the project root. Caught in M5 by checking `dist/` rather than by trusting a
 * green build.
 *
 * Done as a plugin instead of moving `images/` to `public/`: the pack's location
 * is documented in plan.md and README.md, and a copy step is a smaller change
 * than relocating a committed CC0 asset pack and rewriting the links to it.
 */
function copyArtPack(): Plugin {
  return {
    name: 'copy-art-pack',
    apply: 'build',
    closeBundle() {
      const from = resolve(__dirname, ART_DIR);
      if (!existsSync(from)) {
        // Loud, not silent: a bundle without art is a blank screen at run time,
        // which is far more expensive to diagnose than a failed build.
        throw new Error(`art pack missing at ${from} — the build would ship no sprites`);
      }
      cpSync(from, resolve(__dirname, 'dist', ART_DIR), { recursive: true });
    },
  };
}

// Relative base: the build is a static bundle that must run from any path
// (file://, GitHub Pages subdirectory, or a plain static host). There is no
// server component — Express and MongoDB are explicit v1 non-goals.
export default defineConfig({
  base: './',
  plugins: [copyArtPack()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});
