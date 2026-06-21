import { Redirect } from '@/src/navigation/router';
import { useEffect } from 'react';
import { openSalesPortal } from '@/src/utils/sales-portal';

export default function SalesLoginRoute() {
  useEffect(() => {
    openSalesPortal('/ventas/login').catch(() => undefined);
  }, []);

  return <Redirect href="/login" />;
}
