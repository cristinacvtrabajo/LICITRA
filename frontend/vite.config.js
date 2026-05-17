import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
 plugins: [vue()],
 root: '.',
 // public/ contiene los archivos estáticos vanilla (js/, css/)
 // Vite los copia tal cual a dist/ sin procesarlos
 publicDir: 'public',
 build: {
 outDir: 'dist',
 emptyOutDir: true,
 rollupOptions: {
 input: 'index.html'
 }
 },
 server: {
 port: 5173,
 proxy: {
 '/api': {
 target: 'http://localhost:3000',
 changeOrigin: true,
 }
 }
 }
})
