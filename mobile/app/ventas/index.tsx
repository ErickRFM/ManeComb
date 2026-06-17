import { Redirect } from '@/src/navigation/router';
import { useEffect } from 'react';
import { openSalesPortal } from '@/src/utils/sales-portal';

export default function VentasRoute() {
  useEffect(() => {
    openSalesPortal().catch(() => undefined);
  }, []);

  return <Redirect href="/login" />;
}
