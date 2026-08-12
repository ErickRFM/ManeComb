import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

function validateApiOrigin(value: string) {
  let parsed: globalThis.URL;
  try {
    parsed = new globalThis.URL(value);
  } catch {
    throw new Error('VITE_API_URL debe ser un origen HTTP(S) absoluto valido.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('VITE_API_URL solo admite http o https.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('VITE_API_URL no debe incluir credenciales.');
  }
}

export default defineConfig(({ command, mode }) => {
  const env = {
    ...loadEnv(mode, process.cwd(), ''),
    ...process.env,
  };
  const targetPort = Number(env.API_PORT || 5000);
  const apiOrigin = String(env.VITE_API_URL || '').trim();

  if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
    throw new Error('API_PORT debe ser un puerto valido entre 1 y 65535.');
  }
  if (command === 'build') {
    if (!apiOrigin) {
      throw new Error('VITE_API_URL es obligatorio para construir Admin Global.');
    }
    validateApiOrigin(apiOrigin);
  }

  return {
    plugins: [react()],
    define: {
      global: 'globalThis',
    },
    resolve: {
      alias: [
        {
          find: '@shared',
          replacement: fileURLToPath(new URL('../shared', import.meta.url)),
        },
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
