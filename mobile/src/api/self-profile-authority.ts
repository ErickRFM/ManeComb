import type {
  CompanyProfile,
  PaymentProfile,
  SelfProfileMutationPayload,
} from '@/src/types/app';

type UnknownRecord = Record<string, unknown>;

const DIRECT_SELF_PROFILE_FIELDS = [
  'name',
  'email',
  'phone',
  'avatarUrl',
  'companyName',
  'legalName',
  'taxId',
  'billingEmail',
  'billingAddress',
  'preferredMethod',
  'cardholderName',
  'cardBrand',
  'cardLast4',
  'cardExpMonth',
  'cardExpYear',
  'customerReference',
  'e2eePublicKey',
  'e2eeKeyRotatedAt',
] as const satisfies readonly (keyof SelfProfileMutationPayload)[];

const COMPANY_PROFILE_FIELDS = [
  'companyName',
  'legalName',
  'taxId',
  'billingEmail',
  'billingAddress',
] as const satisfies readonly (keyof CompanyProfile)[];

const PAYMENT_PROFILE_FIELDS = [
  'preferredMethod',
  'cardholderName',
  'cardBrand',
  'cardLast4',
  'cardExpMonth',
  'cardExpYear',
  'customerReference',
] as const satisfies readonly (keyof PaymentProfile)[];

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pickOwnFields(value: unknown, fields: readonly string[]): UnknownRecord {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    fields
      .filter((field) => Object.prototype.hasOwnProperty.call(value, field))
      .map((field) => [field, value[field]])
      .filter(([, fieldValue]) => fieldValue !== undefined)
  );
}

/**
 * Mobile mirrors the backend self-profile allowlist as a defense-in-depth
 * boundary. Credentials and managed-user fields are never profile data and
 * must not reach PATCH /users/me or the replayable offline queue.
 */
export function sanitizeSelfProfilePayload(value: unknown): SelfProfileMutationPayload {
  const source = isRecord(value) ? value : {};
  const sanitized = pickOwnFields(source, DIRECT_SELF_PROFILE_FIELDS);
  const companyProfile = pickOwnFields(source.companyProfile, COMPANY_PROFILE_FIELDS);
  const paymentProfile = pickOwnFields(source.paymentProfile, PAYMENT_PROFILE_FIELDS);

  if (Object.keys(companyProfile).length > 0) {
    sanitized.companyProfile = companyProfile;
  }
  if (Object.keys(paymentProfile).length > 0) {
    sanitized.paymentProfile = paymentProfile;
  }

  return sanitized as SelfProfileMutationPayload;
}

export function hasSelfProfileMutationFields(payload: SelfProfileMutationPayload) {
  return Object.keys(payload).length > 0;
}
