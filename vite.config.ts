import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'bundle',
    target: 'node18',
    minify: true,
    // SSR entry point - bundles for Node.js
    ssr: './dist/index.js',
    rollupOptions: {
      output: {
        format: 'esm',
        entryFileNames: 'index.js'
      }
    }
  },
  ssr: {
    // Target Node.js - allows Node built-ins to be externalized
    target: 'node',
    // Bundle ALL npm dependencies (enables tree-shaking)
    noExternal: true
  }
})
