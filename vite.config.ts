import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

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
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192.png', 'pwa-512.png', 'maskable-512.png'],
      manifest: {
        name: 'Imagen',
        short_name: 'Imagen',
        description: 'Client-side batch image optimizer',
        theme_color: '#141310',
        background_color: '#141310',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' },
  optimizeDeps: { exclude: jsquash },
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
})
