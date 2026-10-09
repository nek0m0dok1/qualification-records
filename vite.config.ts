import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import VueRouter from 'vue-router/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  plugins: [VueRouter({ dts: 'src/typed-router.d.ts' }), vue(), ...(mode === 'types' ? [] : [VitePWA({
    registerType: 'prompt', manifest: false,
    workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'], navigateFallback: '/index.html', runtimeCaching: [] },
  })])],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
}))
