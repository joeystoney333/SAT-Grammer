import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { output: { manualChunks(id) { if(id.includes('/src/data/'))return 'study-content';if(id.includes('node_modules'))return 'vendor'; } } } },
  server: { host: '0.0.0.0', port: 5173, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } } },
});
