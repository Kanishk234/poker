import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon-180.png'],
      manifest: {
        name: 'Felt — Poker with friends',
        short_name: 'Felt',
        description: 'Play-money poker for friends.',
        start_url: '/',
        display: 'standalone',
        theme_color: '#08090b',
        background_color: '#08090b',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//, /^\/health/],
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:2567',
        configure(proxy) {
          proxy.on('proxyReq', (request) =>
            request.setHeader('Origin', 'http://localhost:5173'),
          );
        },
      },
      '/colyseus': {
        target: 'http://127.0.0.1:2567',
        ws: true,
        rewrite: (path) => path.replace(/^\/colyseus/, ''),
        configure(proxy) {
          proxy.on('proxyReq', (request) =>
            request.setHeader('Origin', 'http://localhost:5173'),
          );
          proxy.on('proxyReqWs', (request) =>
            request.setHeader('Origin', 'http://localhost:5173'),
          );
        },
      },
    },
  },
});
