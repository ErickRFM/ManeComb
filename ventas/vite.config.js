import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => {
  // Cargar variables desde .env y desde el entorno de Cloudflare/Node
  const loadedEnv = loadEnv(mode, process.cwd(), '');

  const env = {
    ...loadedEnv,
    ...process.env,
  };

  const apiUrl = String(env.VITE_API_URL ?? '').trim();

  if (command === 'build' && !apiUrl) {
    console.error('Variables cargadas:', Object.keys(env).filter(k => k.startsWith('VITE_')));
    throw new Error(
      'VITE_API_URL es obligatorio para construir ventas en producción.'
    );
  }

  return {
    plugins: [react()],

    define: {
      global: 'globalThis',
    },

    resolve: {
      alias: [
        {
          find: '@',
          replacement: fileURLToPath(new URL('./', import.meta.url)),
        },
        {
          find: /^react-native$/,
          replacement: 'react-native-web',
        },
        {
          find: /^react-native-safe-area-context$/,
          replacement: fileURLToPath(
            new URL('./src/native/safe-area-context.tsx', import.meta.url)
          ),
        },
        {
          find: /^react-native-svg$/,
          replacement: fileURLToPath(
            new URL('./src/native/svg.tsx', import.meta.url)
          ),
        },
      ],

      extensions: [
        '.web.tsx',
        '.web.ts',
        '.tsx',
        '.ts',
        '.jsx',
        '.js',
        '.json',
      ],
    },
  };
});