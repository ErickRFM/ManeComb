import { toSupportedDocument } from './document-picker.utils';

describe('document picker wrapper', () => {
  it('normaliza un PDF válido conservando metadatos', () => {
    expect(toSupportedDocument({ uri: 'content://license.pdf', name: 'license.pdf', type: 'application/pdf', size: 2048 }))
      .toMatchObject({ name: 'license.pdf', type: 'application/pdf', size: 2048 });
  });

  it('rechaza MIME no permitido aunque el proveedor Android ignore el filtro', () => {
    expect(() => toSupportedDocument({ uri: 'content://bad.svg', name: 'bad.svg', type: 'image/svg+xml', size: 10 }))
      .toThrow('PDF, JPG, PNG o WEBP');
  });

  it('rechaza archivos mayores a 15 MB', () => {
    expect(() => toSupportedDocument({ uri: 'content://large.pdf', name: 'large.pdf', type: 'application/pdf', size: 16 * 1024 * 1024 }))
      .toThrow('15 MB');
  });
});
