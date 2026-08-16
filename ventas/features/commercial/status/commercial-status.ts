export type CommercialStatus =
  | 'inactive'
  | 'pending'
  | 'active'
  | 'trial'
  | 'failed'
  | 'past_due'
  | 'suspended'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'unknown';

const PENDING = new Set([
  'pending',
  'pending_payment',
  'payment_pending',
  'pending_manual_confirmation',
  'unpaid',
  'requires_payment',
]);

const FAILED = new Set(['failed', 'payment_failed', 'rejected', 'cancelled_payment']);
const ACTIVE = new Set(['active', 'paid', 'paid_test']);
const TRIAL = new Set(['trial', 'trial_active']);
const SUSPENDED = new Set(['suspended', 'suspended_financial', 'chargeback_open', 'chargeback_lost']);
const CANCELLED = new Set(['cancelled', 'canceled']);
const EXPIRED = new Set(['expired']);
const PAST_DUE = new Set(['past_due']);
const REFUNDED = new Set(['refunded', 'partially_refunded']);

export function normalizeCommercialStatus(value?: string | null): CommercialStatus {
  const status = String(value || '').trim().toLowerCase();
  if (!status || status === 'inactive') return 'inactive';
  if (PENDING.has(status)) return 'pending';
  if (FAILED.has(status)) return 'failed';
  if (ACTIVE.has(status)) return 'active';
  if (TRIAL.has(status)) return 'trial';
  if (SUSPENDED.has(status)) return 'suspended';
  if (CANCELLED.has(status)) return 'cancelled';
  if (EXPIRED.has(status)) return 'expired';
  if (PAST_DUE.has(status)) return 'past_due';
  if (REFUNDED.has(status)) return 'refunded';
  return 'unknown';
}

export function isCommercialPaymentPending(value?: string | null) {
  return normalizeCommercialStatus(value) === 'pending';
}

export function canRetryCommercialPayment(value?: string | null) {
  const status = normalizeCommercialStatus(value);
  return status === 'pending' || status === 'failed';
}
