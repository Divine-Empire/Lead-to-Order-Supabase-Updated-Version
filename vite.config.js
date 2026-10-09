import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// One id per build, baked into the bundle (__BUILD_ID__, below) and also
// written to dist/version.json by the plugin at the bottom -- UpdateBanner
// polls that file and compares it against the id its own bundle shipped
// with, to tell an open tab its JS is now stale (see UpdateBanner.jsx for
// why this is needed: a Vite SPA tab left open across a deploy keeps
// running the old bundle indefinitely otherwise).
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'write-version-json',
      writeBundle(options) {
        fs.writeFileSync(
          path.join(options.dir || 'dist', 'version.json'),
          JSON.stringify({ buildId })
        )
      },
    },
  ],
  base: "/", // Root-absolute -- required so asset URLs still resolve correctly
            // when the SPA is deep-linked/refreshed on a nested route
            // (e.g. /leads) behind Vercel's catch-all rewrite to index.html.
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    outDir: "dist",
  },
})
