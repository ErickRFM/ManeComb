import type { SelfProfileMutationPayload } from '@/src/types/app';
import { sanitizeSelfProfilePayload } from './self-profile-authority';

describe('autoridad Mobile de self-profile', () => {
  it('preserva únicamente campos que PATCH /users/me permite', () => {
    const sanitized = sanitizeSelfProfilePayload({
      name: 'Empresa QA',
      phone: '+52 55 0000 0000',
      password: 'NuncaPersistir123!',
      currentPassword: 'Actual123!',
      userStatus: 'suspended',
      operationalSchedule: { enabled: false },
      companyProfile: {
        companyName: 'Empresa QA',
        password: 'Nested123!',
        operationalSchedule: { enabled: false },
      },
      paymentProfile: {
        preferredMethod: 'spei',
        password: 'NestedPayment123!',
      },
    });

    expect(sanitized).toEqual({
      name: 'Empresa QA',
      phone: '+52 55 0000 0000',
      companyProfile: { companyName: 'Empresa QA' },
      paymentProfile: { preferredMethod: 'spei' },
    });
    expect(JSON.stringify(sanitized)).not.toMatch(/password|operationalSchedule|userStatus/);
  });

  it('hace que TypeScript rechace credenciales y campos administrativos', () => {
    // @ts-expect-error Las credenciales pertenecen a CredentialChangePayload.
    const credential: SelfProfileMutationPayload = { password: 'Nunca123!' };
    // @ts-expect-error El estado de cuenta pertenece a managed-user authority.
    const administrative: SelfProfileMutationPayload = { userStatus: 'suspended' };
    // @ts-expect-error El horario pertenece al directorio administrado.
    const schedule: SelfProfileMutationPayload = { operationalSchedule: null };

    expect(sanitizeSelfProfilePayload(credential)).toEqual({});
    expect(sanitizeSelfProfilePayload(administrative)).toEqual({});
    expect(sanitizeSelfProfilePayload(schedule)).toEqual({});
  });
});
