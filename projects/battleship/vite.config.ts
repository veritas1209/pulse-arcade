import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5195,
    strictPort: true,
    proxy: { '/api/battleship': 'http://127.0.0.1:19095', '/ws/battleship': { target: 'ws://127.0.0.1:19095', ws: true } },
  },
  preview: {
    host: '127.0.0.1',
    port: 4195,
    strictPort: true,
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
