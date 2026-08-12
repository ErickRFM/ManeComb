import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const ALLOWED_PUBLIC_VITE_CREDENTIALS = new Set(['VITE_MAPBOX_ACCESS_TOKEN']);
const PRIVATE_CLIENT_ENV_PATTERN = /(SECRET|PASSWORD|PRIVATE_KEY|AUTH_TOKEN|ACCESS_TOKEN|REFRESH_TOKEN|WEBHOOK_SECRET|CLABE)/i;

function validateBuildUrl(name, value, { required = false, requireHttps = false } = {}) {
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
  if (requireHttps && parsed.protocol !== 'https:') {
    throw new Error(`${name} debe usar HTTPS en el build de produccion.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${name} no debe incluir credenciales.`);
  }
}

function assertNoPrivateClientEnvironment(env) {
  const leakedKeys = Object.entries(env)
    .filter(([key, value]) => (
      key.startsWith('VITE_') &&
      String(value ?? '').trim() &&
      PRIVATE_CLIENT_ENV_PATTERN.test(key) &&
      !ALLOWED_PUBLIC_VITE_CREDENTIALS.has(key)
    ))
    .map(([key]) => key);

  if (leakedKeys.length) {
    throw new Error(
      `Variables privadas no pueden compilarse al navegador: ${leakedKeys.join(', ')}. ` +
      'Mueve esos secretos al backend/Render.'
    );
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
    assertNoPrivateClientEnvironment(env);
    const productionBuild = mode === 'production';
    validateBuildUrl('VITE_API_URL', apiUrl, { required: true, requireHttps: productionBuild });
    validateBuildUrl('VITE_SOCKET_URL', socketUrl, { requireHttps: productionBuild });
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
