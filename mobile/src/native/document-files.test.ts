const mockDownloadAndOpen = jest.fn();

jest.mock('@/src/api/client', () => ({ API_URL: 'https://example.test/api' }));

import { NativeModules, Platform } from 'react-native';

describe('openAuthenticatedDocument', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    NativeModules.ManeCombDocumentFile = { downloadAndOpen: mockDownloadAndOpen };
  });

  it('entrega el token solo al puente nativo y no lo agrega a la URL', async () => {
    const { openAuthenticatedDocument } = require('./document-files');
    mockDownloadAndOpen.mockResolvedValue(undefined);
    await openAuthenticatedDocument({ storageKey: 'asset/key', token: 'secret-token', fileName: 'licencia.pdf', mimeType: 'application/pdf' });
    expect(mockDownloadAndOpen).toHaveBeenCalledWith('https://example.test/api/documents/files/asset%2Fkey', 'secret-token', 'licencia.pdf', 'application/pdf');
    expect(mockDownloadAndOpen.mock.calls[0][0]).not.toContain('secret-token');
  });
});
