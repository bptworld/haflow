import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4177',
      '/ws': {
        target: 'ws://localhost:4177',
        ws: true,
      },
    },
  },
})
