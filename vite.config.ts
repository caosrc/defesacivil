import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// PWA: o service worker (public/sw.js) é copiado tal como está para a raiz do build.
// Ele cuida de cache do app shell, fallback offline e cache dos tiles do mapa.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    // Mantém os assets com hash para invalidar cache automaticamente
    assetsDir: 'assets',
    sourcemap: false,
  },
})
