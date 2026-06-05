import { Redirect } from '@/src/navigation/router';
import { Platform } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/src/store/use-app-store';
import { getAuthenticatedHome } from '@/src/utils/account-routing';

export default function IndexScreen() {
  const { isHydrated, user } = useAppStore(useShallow((state) => ({
    isHydrated: state.isHydrated,
    user: state.user,
  })));

  if (!isHydrated) {
    return null;
  }

  const fallbackRoute = Platform.OS === 'web' ? '/ventas' : '/login';

  return <Redirect href={(user ? getAuthenticatedHome(user) : fallbackRoute) as never} />;
}
