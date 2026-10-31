import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const geminiKey = env.GEMINI_API_KEY || env.API_KEY || '';
    return {
      base: './',
      server: {
        port: 3000,
        host: '0.0.0.0',
        watch: {
          ignored: ['**/android/**', '**/release/**', '**/dist/**']
        }
      },
      plugins: [react(), tailwindcss()],
      define: {
        'process.env': JSON.stringify({
          GEMINI_API_KEY: geminiKey,
          API_KEY: geminiKey
        })
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
