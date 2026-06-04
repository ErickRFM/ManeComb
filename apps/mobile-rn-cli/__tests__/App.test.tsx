import { canOperate, hasPendingPayment, isAdmin, needsPlan } from '../src/utils/access';
import type { User } from '../src/types/app';

const baseUser: User = {
  id: 'user-1',
  name: 'Admin ManeComb',
  email: 'admin@manecomb.test',
  role: 'admin',
  subscriptionStatus: 'active',
  onboardingStatus: 'active',
};

describe('operational access gates', () => {
  it('blocks access when the user still needs a plan', () => {
    const user: User = {
      ...baseUser,
      subscriptionStatus: 'no_plan',
      onboardingStatus: 'pending_plan',
    };

    expect(needsPlan(user)).toBe(true);
    expect(canOperate(user)).toBe(false);
  });

  it('blocks access while a payment is pending', () => {
    const user: User = {
      ...baseUser,
      subscriptionStatus: 'pending_payment',
    };

    expect(hasPendingPayment(user)).toBe(true);
    expect(canOperate(user)).toBe(false);
  });

  it('allows an active account to operate and identifies admin roles', () => {
    expect(canOperate(baseUser)).toBe(true);
    expect(isAdmin(baseUser)).toBe(true);
  });
});
