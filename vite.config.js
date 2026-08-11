import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',              // 👈 THIS makes asset paths relative (works in any subfolder)
  build: {
    outDir: 'build',
  },
})
