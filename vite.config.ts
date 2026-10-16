import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import VueRouter from 'vue-router/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(() => ({
  plugins: [
    VueRouter({ dts: 'src/typed-router.d.ts' }),
    vue(),
    VitePWA({
      registerType: 'prompt',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [],
      },
    }),
  ],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    // Firestore is about 151 KB gzip at the current version; Vite measures the uncompressed minified chunk.
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@firebase/firestore/')) return 'firebase-firestore'
          if (id.includes('/node_modules/@firebase/auth/')) return 'firebase-auth'
          if (id.includes('/node_modules/@firebase/component/')) return 'firebase-core'
        },
      },
    },
  },
}))
