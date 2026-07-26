import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const targetPort = env.API_PORT || 4000;

  return {
    plugins: [react()],
    define: {
      global: 'globalThis',
    },
    resolve: {
      alias: [
        {
          find: '@',
          replacement: fileURLToPath(new URL('./src', import.meta.url)),
        },
        {
          find: /^react-native$/,
          replacement: 'react-native-web',
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
    server: {
      port: 5174,
      proxy: {
        '/api': {
          target: `http://localhost:${targetPort}`,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
