import { resolveRuntimeUrl } from './runtime-url';

const productionApiUrl = 'https://manecomb.onrender.com/api';

describe('resolveRuntimeUrl', () => {
  it('acepta un backend HTTPS configurado sin confundirlo con produccion', () => {
    expect(
      resolveRuntimeUrl(
        'https://manecomb-backend-sandbox.onrender.com/api',
        productionApiUrl,
        'api'
      )
    ).toEqual({
      source: 'configured',
      target: 'configured',
      url: 'https://manecomb-backend-sandbox.onrender.com/api',
    });
  });

  it('acepta una IP LAN por HTTP solamente durante desarrollo', () => {
    expect(
      resolveRuntimeUrl('http://192.168.1.20:5000/api', productionApiUrl, 'api', {
        allowLocalHttp: true,
      })
    ).toEqual({
      source: 'configured',
      target: 'configured',
      url: 'http://192.168.1.20:5000/api',
    });
  });

  it('rechaza una IP LAN en un build operativo y conserva el backend productivo', () => {
    expect(
      resolveRuntimeUrl('http://192.168.1.20:5000/api', productionApiUrl, 'api', {
        allowLocalHttp: false,
      })
    ).toEqual({
      source: 'fallback',
      target: 'production',
      url: productionApiUrl,
    });
  });

  it('agrega /api cuando el origen configurado no incluye ruta', () => {
    expect(
      resolveRuntimeUrl('https://sandbox.example.com', productionApiUrl, 'api')
    ).toEqual({
      source: 'configured',
      target: 'configured',
      url: 'https://sandbox.example.com/api',
    });
  });

  it('no agrega /api al socket', () => {
    expect(
      resolveRuntimeUrl(
        'https://sandbox.example.com',
        'https://manecomb.onrender.com',
        'socket'
      )
    ).toEqual({
      source: 'configured',
      target: 'configured',
      url: 'https://sandbox.example.com',
    });
  });

  it('usa el fallback ante una URL invalida', () => {
    expect(resolveRuntimeUrl('no-es-url', productionApiUrl, 'api')).toEqual({
      source: 'fallback',
      target: 'production',
      url: productionApiUrl,
    });
  });
});
