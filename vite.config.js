import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/ledger': {
        target: 'https://wfvwciawsbsekkypzzwd.supabase.co',
        changeOrigin: true,
        rewrite: () => '/functions/v1/ledger',
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}', 'netlify/**/*.test.js'],
    css: true,
  },
})

