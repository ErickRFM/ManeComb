import { ActivityIndicator } from 'react-native';
import { EmptyStateBox } from '@/src/components/empty-state-box';

export function AlertState({
  hasIncidents,
  loading,
  theme,
}: {
  hasIncidents: boolean;
  loading: boolean;
  theme: any;
}) {
  if (loading) {
    return (
      <EmptyStateBox
        leading={<ActivityIndicator color={theme.colors.accent} />}
        title="Cargando"
      />
    );
  }

  return (
    <EmptyStateBox
      icon={hasIncidents ? 'magnify-close' : 'clipboard-text-clock-outline'}
      title={hasIncidents ? 'Sin coincidencias' : 'Sin alertas recientes'}
      subtitle={hasIncidents ? 'Ajusta los filtros o la busqueda.' : 'Sin alertas recientes'}
    />
  );
}
