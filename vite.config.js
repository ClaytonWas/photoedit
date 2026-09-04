import { defineConfig } from 'vite'

export default defineConfig({
    root: '.',
    publicDir: 'public',
    build: {
        outDir: 'dist',
        emptyOutDir: true
    },
    worker: {
        format: 'es',
        // Vite 6+ expects a factory here, not a plain array.
        plugins: () => [],
        rollupOptions: {
            output: {
                // Worker naming belongs to the worker bundle; on build.rollupOptions
                // Rollup rejects it as an unknown option and the setting is ignored.
                entryFileNames: 'workers/[name]-[hash].js'
            }
        }
    }
})
