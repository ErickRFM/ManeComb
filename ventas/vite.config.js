import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  if (command === 'build' && !String(env.VITE_API_URL || '').trim()) {
    throw new Error('VITE_API_URL es obligatorio para construir ventas en produccion.');
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
          replacement: fileURLToPath(new URL('./src/native/safe-area-context.tsx', import.meta.url)),
        },
        {
          find: /^react-native-svg$/,
          replacement: fileURLToPath(new URL('./src/native/svg.tsx', import.meta.url)),
        },
      ],
      extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js', '.json'],
    },
  };
});
