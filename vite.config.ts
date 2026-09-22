import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API key lives in the proxy process, so the browser only ever calls /api.
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
});
