import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

function validateBuildUrl(name, value, { required = false } = {}) {
  const rawValue = String(value ?? '').trim();

  if (!rawValue) {
    if (required) throw new Error(`${name} es obligatorio para construir ventas.`);
    return;
  }

  // El contenedor Nginx puede resolver /api y / en el mismo origen.
  if (rawValue.startsWith('/')) {
    if (rawValue.startsWith('//')) {
      throw new Error(`${name} no admite URLs relativas al protocolo.`);
    }
    return;
  }

  let parsed;
  try {
    parsed = new globalThis.URL(rawValue);
  } catch {
    throw new Error(`${name} debe ser una URL absoluta valida o una ruta que inicie con /.`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} solo admite http o https.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${name} no debe incluir credenciales.`);
  }
}

export default defineConfig(({ command, mode }) => {
  const loadedEnv = loadEnv(mode, process.cwd(), '');
  const env = {
    ...loadedEnv,
    ...process.env,
  };

  const apiUrl = String(env.VITE_API_URL ?? '').trim();
  const socketUrl = String(env.VITE_SOCKET_URL ?? '').trim();
  const mapboxAccessToken = String(env.VITE_MAPBOX_ACCESS_TOKEN ?? '').trim();

  if (command === 'build') {
    validateBuildUrl('VITE_API_URL', apiUrl, { required: true });
    validateBuildUrl('VITE_SOCKET_URL', socketUrl);
    console.log(mapboxAccessToken ? 'TOKEN_OK' : 'TOKEN_EMPTY');
  }

  return {
    plugins: [react()],

    define: {
      global: 'globalThis',
    },

    resolve: {
      alias: [
        // Debe preceder al alias '@': la coincidencia es por prefijo y
        // '@shared/...' quedaria capturado por '@' si se declarara despues.
        {
          find: '@shared',
          replacement: fileURLToPath(new URL('../shared', import.meta.url)),
        },
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
