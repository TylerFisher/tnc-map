import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the built page works from any subdirectory —
  // required when the embed is dropped onto an unknown host path.
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096,
    sourcemap: true,
    target: 'es2020',
  },
  server: {
    port: 5173,
    open: true,
  },
});
