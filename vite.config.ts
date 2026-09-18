import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 0.0.0.0 so the dev server is reachable from outside its Docker
    // container, not just localhost inside it
    host: true,
    port: 5173,
    strictPort: true,
    // bind-mounted source on Windows/Docker Desktop doesn't reliably fire
    // inotify events, so HMR needs polling to notice file changes
    watch: {
      usePolling: true,
    },
  },
})
