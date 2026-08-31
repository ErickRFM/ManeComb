import { validatePasswordChangeInput } from './account-security-validation';

describe('cambio dedicado de contraseña', () => {
  it.each([
    [
      { currentPassword: '', newPassword: 'NuevaRuta456!', confirmPassword: 'NuevaRuta456!' },
      'Completa tu contraseña actual',
    ],
    [
      { currentPassword: 'Ruta123!', newPassword: 'debil', confirmPassword: 'debil' },
      'debe tener mínimo',
    ],
    [
      { currentPassword: 'Ruta123!', newPassword: 'NuevaRuta456!', confirmPassword: 'OtraRuta456!' },
      'no coincide',
    ],
    [
      { currentPassword: 'Ruta123!', newPassword: 'Ruta123!', confirmPassword: 'Ruta123!' },
      'debe ser diferente',
    ],
  ])('rechaza la frontera inválida %#', (payload, expected) => {
    expect(validatePasswordChangeInput(payload)).toContain(expected);
  });

  it('acepta una intención completa y fuerte', () => {
    expect(validatePasswordChangeInput({
      currentPassword: 'Ruta123!',
      newPassword: 'NuevaRuta456!',
      confirmPassword: 'NuevaRuta456!',
    })).toBeNull();
  });
});
