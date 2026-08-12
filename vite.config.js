import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: "/", // Root-absolute -- required so asset URLs still resolve correctly
            // when the SPA is deep-linked/refreshed on a nested route
            // (e.g. /leads) behind Vercel's catch-all rewrite to index.html.
  build: {
    outDir: "dist",
  },
})
