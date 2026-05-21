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
      '/realm': {
        target: 'http://realm.localhost:1337',
        rewrite: (path) => path.replace(/^\/realm/, ''),
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
