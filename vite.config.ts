import { defineConfig } from 'vite';

// Relative base: the build is a static bundle that must run from any path
// (file://, GitHub Pages subdirectory, or a plain static host). There is no
// server component — Express and MongoDB are explicit v1 non-goals.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});
