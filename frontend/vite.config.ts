import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: mode === 'github' ? '/analise-criminal-gtb-v2/' : '/',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
}))
