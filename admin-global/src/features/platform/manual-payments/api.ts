import { createPlatformApiClient, getPlatformTokenHeader } from '@/lib/platform-api-client';

const platformApi = createPlatformApiClient('/api/platform');

export type PlatformManualPaymentEvidence = {
  id: string;
  orderId: string;
  organizationId: string;
  submittedBy: string;
  trackingKey: string;
  originBank: string;
  transferDate: string | null;
  amountMinor: number;
  amount: number;
  currency: string;
  note: string;
  status: 'pending_review' | 'reviewing' | 'approved' | 'rejected' | string;
  submittedAt: string | null;
  updatedAt: string | null;
  version: number;
  pendingDecision: 'approve' | 'reject' | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string;
};

export type PlatformManualPaymentOrder = {
  id: string;
  referenceCode: string;
  organizationId: string;
  ownerUserId: string | null;
  companyName: string;
  totalPrice: number;
  currency: string;
  paymentMethod: string;
  paymentProvider: string;
  paymentStatus: string;
  paymentApprovedAt: string | null;
  activationStatus: string;
  status: string;
  activatedAt: string | null;
};

export type PlatformManualPaymentPayload = {
  order: PlatformManualPaymentOrder;
  evidence: PlatformManualPaymentEvidence | null;
};

export async function platformManualPaymentRequest(token: string, orderId: string) {
  const { data } = await platformApi.get(
    `/manual-payments/orders/${encodeURIComponent(orderId)}`,
    { headers: getPlatformTokenHeader(token) }
  );
  return data.data as PlatformManualPaymentPayload;
}

export async function platformManualPaymentDecisionRequest(
  token: string,
  orderId: string,
  payload: {
    decision: 'approve' | 'reject';
    note?: string;
    trackingKeyConfirmation?: string;
  },
  idempotencyKey: string
) {
  const { data } = await platformApi.post(
    `/manual-payments/orders/${encodeURIComponent(orderId)}/decision`,
    payload,
    {
      headers: {
        ...getPlatformTokenHeader(token),
        'Idempotency-Key': idempotencyKey,
      },
    }
  );
  return data.data as PlatformManualPaymentPayload;
}
