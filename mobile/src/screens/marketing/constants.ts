import { FALLBACK_COMMERCIAL_PLANS } from '@/src/constants/commercial';
import type { CommercialCheckoutPayload } from '@/src/types/app';

export const initialCheckoutState: CommercialCheckoutPayload = {
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  legalName: '',
  billingEmail: '',
  billingAddress: '',
  taxId: '',
  planId: FALLBACK_COMMERCIAL_PLANS[1]?.id || FALLBACK_COMMERCIAL_PLANS[0].id,
  paymentMethod: 'spei',
  needsOnboarding: true,
  needsInvoice: true,
  requestTrial: true,
  selectedAddOns: [],
  notes: '',
};
