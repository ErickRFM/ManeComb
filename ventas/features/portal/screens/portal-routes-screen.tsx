import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PortalRoutesScreen as PortalRoutesWorkspace } from './portal-routes-workspace';
import { RouteLearningV3Review } from './route-learning-v3-review';

/**
 * Compositor de Rutas.
 *
 * El workspace existente conserva creación, edición, catálogo y asignaciones.
 * V3 se monta como una capa administrativa independiente y remonta el workspace
 * únicamente después de aplicar una revisión oficial, para leer la Route recién
 * versionada sin mantener un segundo store de catálogo.
 */
export function PortalRoutesScreen() {
  const [workspaceRevision, setWorkspaceRevision] = useState(0);

  return (
    <View style={styles.root}>
      <PortalRoutesWorkspace key={workspaceRevision} />
      <RouteLearningV3Review onApplied={() => setWorkspaceRevision((current) => current + 1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: '100%',
    position: 'relative',
  },
});
