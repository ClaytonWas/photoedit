import { defineConfig } from 'vite'

export default defineConfig({
    root: '.',
    publicDir: 'public',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                // Ensure workers are properly handled in production
                workerFileNames: 'workers/[name]-[hash].js'
            }
        }
    },
    worker: {
        format: 'es',
        plugins: []
    }
})

