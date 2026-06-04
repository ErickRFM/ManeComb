import type { User } from '../types/app';

export function needsPlan(user: User | null | undefined) {
  if (!user) {
    return false;
  }

  return (
    user.subscriptionStatus === 'no_plan' ||
    user.onboardingStatus === 'pending_plan' ||
    !user.subscriptionStatus
  );
}

export function hasPendingPayment(user: User | null | undefined) {
  return user?.subscriptionStatus === 'pending_payment' || user?.onboardingStatus === 'pending_payment';
}

export function isSubscriptionBlocked(user: User | null | undefined) {
  return user?.subscriptionStatus === 'expired' || user?.subscriptionStatus === 'past_due';
}

export function canOperate(user: User | null | undefined) {
  if (!user) {
    return false;
  }

  return !needsPlan(user) && !hasPendingPayment(user) && !isSubscriptionBlocked(user);
}

export function isAdmin(user: User | null | undefined) {
  return user?.role === 'admin' || user?.role === 'owner';
}
