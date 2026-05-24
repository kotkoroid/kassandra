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
      // PR-D3e.3 dev-loop fix: the client now hits the Bun WS proxy
      // (`scripts/ws-proxy.ts` on `localhost:5555`) directly — see
      // realm-client.ts / profile-client.ts. This `/realm` proxy is
      // kept only for occasional debugging via the Vite-served origin
      // (e.g. visiting `localhost:5173/realm/parties/...` in a tab);
      // it's not on the live WS path. Vite's WS proxy mangles the
      // `Sec-WebSocket-Protocol` 101 response so this `ws: true`
      // entry only works for HTTP probes.
      '/realm': {
        target: 'http://localhost:5555',
        rewrite: (path) => path.replace(/^\/realm/, ''),
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
