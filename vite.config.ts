import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const replitDomain = process.env.REPLIT_DEV_DOMAIN

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    hmr: replitDomain
      ? {
          host: replitDomain,
          protocol: 'wss',
          clientPort: 443,
        }
      : false,
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
    assetsDir: 'assets',
    sourcemap: false,
  },
})
