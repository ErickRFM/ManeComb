import { Redirect } from '@/src/navigation/router';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/src/store/use-app-store';
import { getOperationalHome } from '@/src/utils/account-routing';

export default function ApplicationRoute() {
  const { isHydrated, user } = useAppStore(
    useShallow((state) => ({
      isHydrated: state.isHydrated,
      user: state.user,
    }))
  );

  if (!isHydrated) {
    return null;
  }

  return <Redirect href={(user ? getOperationalHome(user) : '/login') as never} />;
}
