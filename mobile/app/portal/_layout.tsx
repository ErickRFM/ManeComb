import { Stack } from '@/src/navigation/router';

export default function PortalLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
