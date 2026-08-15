import type { ComponentProps } from 'react';
import { Platform } from 'react-native';
import { usePathname } from '@/src/navigation/router';
import { PortalLayout as PortalLayoutBase } from './portal-layout-base';
import { RouteLearningV3Review } from '../screens/route-learning-v3-review';

type PortalLayoutProps = ComponentProps<typeof PortalLayoutBase>;

/**
 * Portal shell compositor.
 *
 * `PortalLayoutBase` conserva intacta la autoridad visual/navegación existente.
 * La revisión V3 se monta únicamente sobre /portal/rutas y no mueve la autoridad
 * del editor ni sus contratos estáticos. Tras aplicar una revisión oficial se
 * recarga el documento web para leer Route.revision y catálogo desde backend.
 */
export function PortalLayout(props: PortalLayoutProps) {
  const pathname = usePathname();
  const isRoutesWorkspace = pathname.startsWith('/portal/rutas');

  const refreshRouteAuthority = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <>
      <PortalLayoutBase {...props} />
      {isRoutesWorkspace ? <RouteLearningV3Review onApplied={refreshRouteAuthority} /> : null}
    </>
  );
}
