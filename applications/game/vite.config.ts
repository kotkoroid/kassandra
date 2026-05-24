import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://api.localhost:1337',
        rewrite: (path) => path.replace(/^\/api/, ''),
        changeOrigin: true,
      },
      // PR-G5: WS rides the page origin via this `/realm` proxy so the
      // HttpOnly session cookie attaches automatically. The Vite WS
      // proxy bug that motivated the earlier Bun-bridge detour was
      // specifically about the `Sec-WebSocket-Protocol` 101 response
      // header; PR-G5 dropped the bearer subprotocol entirely so that
      // mangling path no longer matters. Direct forward to the realm
      // worker.
      '/realm': {
        target: 'http://realm.localhost:1337',
        rewrite: (path) => path.replace(/^\/realm/, ''),
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
