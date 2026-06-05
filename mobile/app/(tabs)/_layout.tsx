import { Redirect, Slot } from '@/src/navigation/router';
import { useAppStore } from '@/src/store/use-app-store';

export default function TabsLayout() {
  const user = useAppStore((state) => state.user);

  if (!user) {
    return <Redirect href="/login" />;
  }

  return <Slot />;
}
