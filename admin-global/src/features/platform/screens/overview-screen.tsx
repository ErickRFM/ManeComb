import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useAdminStore } from '@/features/auth/store';
import { palette, Typography } from '@/styles/theme';
import { AdminShell } from '../components/admin-shell';
import { usePlatformStore } from '../store';

type MetricCardProps = {
  label: string;
  value: number;
  detail: string;
  width: number | string;
  tone?: 'default' | 'success' | 'warning' | 'info';
};

function MetricCard({ label, value, detail, width, tone = 'default' }: MetricCardProps) {
  return (
    <View style={[styles.metricCard, { width: width as any }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[
        styles.metricValue,
        tone === 'success' && styles.successText,
        tone === 'warning' && styles.warningText,
        tone === 'info' && styles.infoText,
      ]}>
        {new Intl.NumberFormat('es-MX').format(value)}
      </Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingGrid}>
      {[0, 1, 2, 3].map((item) => (
        <View key={item} style={styles.loadingCard}>
          <View style={styles.loadingLineSmall} />
          <View style={styles.loadingLineLarge} />
          <View style={styles.loadingLineMedium} />
        </View>
      ))}
    </View>
  );
}

export function AdminOverviewScreen() {
  const { width } = useWindowDimensions();
  const token = useAdminStore((state) => state.session?.token || '');
  const load = usePlatformStore((state) => state.load);
  const state = usePlatformStore((store) => store.state);
  const error = usePlatformStore((store) => store.error);
  const capabilities = usePlatformStore((store) => store.capabilities);
  const overview = usePlatformStore((store) => store.overview);
  const cardWidth = width >= 1180 ? '23.5%' : width >= 720 ? '48.5%' : '100%';

  useEffect(() => {
    if (token) void load(token);
  }, [load, token]);

  const refreshAction = (
    <Pressable
      accessibilityRole="button"
      disabled={!token || state === 'loading'}
      onPress={() => token && void load(token, true)}
      style={({ pressed }) => [
        styles.refreshButton,
        pressed && styles.refreshButtonPressed,
        state === 'loading' && styles.refreshButtonDisabled,
      ]}
    >
      <Text style={styles.refreshButtonText}>{state === 'loading' ? 'Actualizando…' : 'Actualizar'}</Text>
    </Pressable>
  );

  return (
    <AdminShell
      actions={refreshAction}
      subtitle="Lectura operativa de alto nivel construida desde los endpoints protegidos de Platform. No consulta posiciones GPS ni ejecuta acciones sobre clientes."
      title="Resumen global"
    >
      {state === 'loading' || state === 'idle' ? <LoadingState /> : null}

      {state === 'error' ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No se pudo cargar el resumen</Text>
          <Text style={styles.errorText}>{error || 'El servicio Platform no respondió correctamente.'}</Text>
          <Pressable onPress={() => token && void load(token, true)} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {state === 'ready' && capabilities && !capabilities.modules.companies ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Acceso limitado</Text>
          <Text style={styles.noticeText}>Tu rol no incluye la capacidad platform.companies.read requerida por el resumen global.</Text>
        </View>
      ) : null}

      {state === 'ready' && overview ? (
        <>
          <View style={styles.metricGrid}>
            <MetricCard
              detail="Organizaciones detectadas en los datos empresariales actuales."
              label="Empresas"
              value={overview.companies.total}
              width={cardWidth}
            />
            <MetricCard
              detail={`${overview.users.byStatus.active} activos · ${overview.users.byStatus.pending} pendientes`}
              label="Usuarios"
              tone="info"
              value={overview.users.total}
              width={cardWidth}
            />
            <MetricCard
              detail={`${overview.vehicles.byStatus.on_route} en ruta · ${overview.vehicles.byStatus.maintenance} en mantenimiento`}
              label="Unidades"
              tone="success"
              value={overview.vehicles.total}
              width={cardWidth}
            />
            {overview.commercialOrders ? (
              <MetricCard
                detail={`${overview.commercialOrders.byStatus.active} activas · ${overview.commercialOrders.byStatus.pending} pendientes`}
                label="Órdenes"
                tone="warning"
                value={overview.commercialOrders.total}
                width={cardWidth}
              />
            ) : (
              <MetricCard
                detail="Tu rol no expone información comercial."
                label="Módulos habilitados"
                value={Object.values(capabilities.modules).filter(Boolean).length}
                width={cardWidth}
              />
            )}
          </View>

          <View style={styles.sectionGrid}>
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionEyebrow}>USUARIOS</Text>
                  <Text style={styles.sectionTitle}>Estado de cuentas empresariales</Text>
                </View>
                <Text style={styles.sectionTotal}>{overview.users.total}</Text>
              </View>
              <View style={styles.statusList}>
                <StatusRow label="Activos" value={overview.users.byStatus.active} tone="success" />
                <StatusRow label="Pendientes" value={overview.users.byStatus.pending} tone="warning" />
                <StatusRow label="Suspendidos" value={overview.users.byStatus.suspended} tone="danger" />
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionEyebrow}>FLOTILLA</Text>
                  <Text style={styles.sectionTitle}>Distribución de unidades</Text>
                </View>
                <Text style={styles.sectionTotal}>{overview.vehicles.total}</Text>
              </View>
              <View style={styles.statusList}>
                <StatusRow label="En ruta" value={overview.vehicles.byStatus.on_route} tone="success" />
                <StatusRow label="Mantenimiento" value={overview.vehicles.byStatus.maintenance} tone="warning" />
                <StatusRow label="Inactivas" value={overview.vehicles.byStatus.idle} tone="muted" />
              </View>
            </View>

            {overview.commercialOrders ? (
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionEyebrow}>COMERCIAL</Text>
                    <Text style={styles.sectionTitle}>Estado de órdenes</Text>
                  </View>
                  <Text style={styles.sectionTotal}>{overview.commercialOrders.total}</Text>
                </View>
                <View style={styles.statusList}>
                  <StatusRow label="Activas" value={overview.commercialOrders.byStatus.active} tone="success" />
                  <StatusRow label="Pendientes" value={overview.commercialOrders.byStatus.pending} tone="warning" />
                  <StatusRow label="Completadas" value={overview.commercialOrders.byStatus.completed} tone="info" />
                  <StatusRow label="Canceladas" value={overview.commercialOrders.byStatus.cancelled} tone="danger" />
                </View>
              </View>
            ) : null}

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionEyebrow}>CAPACIDADES</Text>
                  <Text style={styles.sectionTitle}>Acceso efectivo del rol</Text>
                </View>
                <Text style={styles.roleText}>{capabilities.user.role.replace('platform_', '')}</Text>
              </View>
              <View style={styles.permissionWrap}>
                {Object.entries(capabilities.modules)
                  .filter(([, enabled]) => enabled)
                  .map(([module]) => (
                    <Text key={module} style={styles.permissionBadge}>{module}</Text>
                  ))}
              </View>
              <Text style={styles.generatedAt}>
                Generado {new Intl.DateTimeFormat('es-MX', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(overview.generatedAt))}
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </AdminShell>
  );
}

type StatusRowProps = {
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'muted';
};

function StatusRow({ label, value, tone }: StatusRowProps) {
  return (
    <View style={styles.statusRow}>
      <View style={styles.statusLabelRow}>
        <View style={[
          styles.statusDot,
          tone === 'success' && styles.statusDotSuccess,
          tone === 'warning' && styles.statusDotWarning,
          tone === 'danger' && styles.statusDotDanger,
          tone === 'info' && styles.statusDotInfo,
        ]} />
        <Text style={styles.statusLabel}>{label}</Text>
      </View>
      <Text style={styles.statusValue}>{new Intl.NumberFormat('es-MX').format(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  refreshButton: {
    alignItems: 'center',
    backgroundColor: palette.accent,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 18,
  },
  refreshButtonPressed: { opacity: 0.78 },
  refreshButtonDisabled: { opacity: 0.6 },
  refreshButtonText: { color: '#FFFFFF', fontFamily: Typography.body, fontSize: 12, fontWeight: '900' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metricCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 150,
    padding: 18,
  },
  metricLabel: { color: palette.muted, fontFamily: Typography.body, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  metricValue: { color: palette.text, fontFamily: Typography.display, fontSize: 38, fontWeight: '900', marginTop: 13 },
  metricDetail: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 11, lineHeight: 16, marginTop: 8 },
  successText: { color: palette.success },
  warningText: { color: palette.warning },
  infoText: { color: palette.info },
  sectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  sectionCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 290,
    padding: 19,
    width: '48%',
  },
  sectionHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 14, justifyContent: 'space-between' },
  sectionEyebrow: { color: palette.accent, fontFamily: Typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  sectionTitle: { color: palette.text, fontFamily: Typography.display, fontSize: 16, fontWeight: '900', marginTop: 5 },
  sectionTotal: { color: palette.text, fontFamily: Typography.display, fontSize: 24, fontWeight: '900' },
  roleText: { color: palette.info, fontFamily: Typography.mono, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  statusList: { borderTopColor: palette.line, borderTopWidth: 1, gap: 13, marginTop: 17, paddingTop: 15 },
  statusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  statusLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  statusDot: { backgroundColor: palette.mutedSoft, borderRadius: 999, height: 8, width: 8 },
  statusDotSuccess: { backgroundColor: palette.success },
  statusDotWarning: { backgroundColor: palette.warning },
  statusDotDanger: { backgroundColor: palette.danger },
  statusDotInfo: { backgroundColor: palette.info },
  statusLabel: { color: palette.muted, fontFamily: Typography.body, fontSize: 12, fontWeight: '700' },
  statusValue: { color: palette.text, fontFamily: Typography.mono, fontSize: 12, fontWeight: '900' },
  permissionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  permissionBadge: {
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    color: palette.muted,
    fontFamily: Typography.mono,
    fontSize: 10,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    textTransform: 'uppercase',
  },
  generatedAt: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 10, marginTop: 17 },
  errorCard: { backgroundColor: 'rgba(240, 106, 106, 0.08)', borderColor: 'rgba(240, 106, 106, 0.28)', borderRadius: 14, borderWidth: 1, padding: 20 },
  errorTitle: { color: palette.danger, fontFamily: Typography.display, fontSize: 17, fontWeight: '900' },
  errorText: { color: palette.muted, fontFamily: Typography.body, fontSize: 12, lineHeight: 18, marginTop: 7 },
  retryButton: { alignSelf: 'flex-start', borderColor: 'rgba(240, 106, 106, 0.35)', borderRadius: 9, borderWidth: 1, marginTop: 14, paddingHorizontal: 14, paddingVertical: 9 },
  retryButtonText: { color: palette.danger, fontFamily: Typography.body, fontSize: 11, fontWeight: '900' },
  noticeCard: { backgroundColor: 'rgba(240, 167, 37, 0.08)', borderColor: 'rgba(240, 167, 37, 0.28)', borderRadius: 14, borderWidth: 1, padding: 20 },
  noticeTitle: { color: palette.warning, fontFamily: Typography.display, fontSize: 17, fontWeight: '900' },
  noticeText: { color: palette.muted, fontFamily: Typography.body, fontSize: 12, lineHeight: 18, marginTop: 7 },
  loadingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  loadingCard: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, gap: 13, minHeight: 150, padding: 18, width: '48%' },
  loadingLineSmall: { backgroundColor: palette.surfaceAlt, borderRadius: 6, height: 10, width: '35%' },
  loadingLineLarge: { backgroundColor: palette.surfaceAlt, borderRadius: 8, height: 36, width: '48%' },
  loadingLineMedium: { backgroundColor: palette.surfaceAlt, borderRadius: 6, height: 10, width: '72%' },
});
