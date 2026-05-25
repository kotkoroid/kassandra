import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Upstream packaging bug in @threlte/extras 9.4.1: `@threlte/core` is
// declared in `devDependencies` only — not in `peerDependencies` or
// `dependencies`. Vite's dev resolver walks up to the hoisted copy
// and silently succeeds, but rolldown (Vite's production bundler) is
// stricter from inside a node_module that didn't declare the import,
// and fails with "Rolldown failed to resolve import '@threlte/core'
// from ...@threlte/extras/dist/suspense/onSuspend.js" on `alchemy
// deploy`. Pin the alias to the locally-installed copy so both
// resolvers see the same instance. Remove this when extras upstream
// adds @threlte/core to peerDependencies (tracked in the threlte
// monorepo).
const threlteCorePath = fileURLToPath(
  new URL('./node_modules/@threlte/core', import.meta.url),
);

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  resolve: {
    alias: {
      '@threlte/core': threlteCorePath,
    },
    // Dedupe ensures any other path that resolves @threlte/core (e.g.
    // through a transitive that DOES declare it) lands on the same
    // copy as the alias — avoiding two parallel core instances with
    // mismatched Svelte contexts.
    dedupe: ['@threlte/core'],
  },
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
