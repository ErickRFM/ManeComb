jest.mock('@/src/config/api_config', () => ({
  readRuntimeValue: () => '',
}));

import { linking } from './linking';

describe('mobile inbound linking authority', () => {
  it('no publica el self-service documental del conductor como URL externa', () => {
    const config = JSON.stringify(linking.config || {});

    expect(config).not.toContain('mis-documentos');
    expect(config).toContain('perfil-editar');
  });
});
