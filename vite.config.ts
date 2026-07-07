import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const jsquash = [
  '@jsquash/jpeg',
  '@jsquash/png',
  '@jsquash/webp',
  '@jsquash/avif',
  '@jsquash/jxl',
  '@jsquash/resize',
  '@jsquash/oxipng',
]

const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: jsquash },
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
})
