import { Redirect, useLocalSearchParams } from '@/src/navigation/router';

export default function BuyerProfileRoute() {
  const params = useLocalSearchParams<{ planId?: string | string[]; trial?: string | string[] }>();

  return (
    <Redirect
      href={{
        pathname: '/portal',
        params,
      } as never}
    />
  );
}
