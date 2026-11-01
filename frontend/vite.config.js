import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy de /api hacia FastAPI (puerto 8000).
// Así, cuando abras un túnel HTTPS (Cloudflare Tunnel / ngrok / VS Code Port Forwarding) al puerto 5173,
// tanto el Frontend como el Backend funcionarán bajo el mismo certificado SSL sin errores de CORS ni bloqueo de cámara.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
