import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(process.cwd(), 'client'),
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:5050', changeOrigin: false } }
  },
  build: { outDir: resolve(process.cwd(), 'client-dist'), emptyOutDir: true }
});
