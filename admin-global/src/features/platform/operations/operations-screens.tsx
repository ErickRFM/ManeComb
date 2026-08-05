import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from '@/components/router';
import { useAdminStore } from '@/features/auth/store';
import { palette, Typography } from '@/styles/theme';
import { AdminShell } from '../components/admin-shell';
import { usePlatformOperationsStore } from './store';
import type { PlatformCommercialOrder, ReadinessComponent } from './types';

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin registro' : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value || 0);
}

function tone(status: string | boolean | null | undefined) {
  if (status === true || ['ok', 'ready', 'paid', 'active', 'completed', 'success', 'connected'].includes(String(status))) return styles.good;
  if (['degraded', 'pending', 'warning', 'warn', 'attention'].includes(String(status))) return styles.warn;
  if (status === false || ['failed', 'error', 'critical', 'cancelled', 'refunded'].includes(String(status))) return styles.bad;
  return styles.neutral;
}

function StatusBadge({ value }: { value: string | boolean | null | undefined }) {
  return <Text style={[styles.badge, tone(value)]}>{String(value ?? 'unknown')}</Text>;
}

function StateBlock({ state, error, onRetry }: { state: string; error: string | null; onRetry: () => void }) {
  if (state === 'loading' || state === 'idle') return <View style={styles.stateCard}><Text style={styles.stateTitle}>Cargando…</Text><Text style={styles.stateText}>Consultando Platform con permisos efectivos.</Text></View>;
  if (state === 'error') return <View style={[styles.stateCard, styles.errorCard]}><Text style={[styles.stateTitle, styles.errorText]}>{error || 'No fue posible cargar la información'}</Text><Pressable onPress={onRetry} style={styles.secondaryButton}><Text style={styles.secondaryText}>Reintentar</Text></Pressable></View>;
  return null;
}

export function AdminCommercialScreen() {
  const token = useAdminStore((state) => state.session?.token || '');
  const state = usePlatformOperationsStore((store) => store.commercialState);
  const error = usePlatformOperationsStore((store) => store.commercialError);
  const orders = usePlatformOperationsStore((store) => store.orders);
  const pagination = usePlatformOperationsStore((store) => store.orderPagination);
  const loadOrders = usePlatformOperationsStore((store) => store.loadOrders);
  const [search, setSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

  useEffect(() => { if (token) void loadOrders(token, { page: 1, limit: 25 }); }, [loadOrders, token]);
  const loadPage = (page: number) => token && void loadOrders(token, { page, limit: 25, search, paymentStatus, sort: 'createdAt', order: 'desc' });

  return (
    <AdminShell title="Comercial" subtitle="Órdenes, planes, facturación y estados comerciales en modo lectura. No ejecuta cobros, reembolsos ni activaciones.">
      <View style={styles.filterCard}>
        <View style={styles.searchRow}>
          <TextInput value={search} onChangeText={setSearch} onSubmitEditing={() => loadPage(1)} placeholder="Empresa, correo, organización u orden" placeholderTextColor={palette.mutedSoft} style={styles.input} />
          <Pressable onPress={() => loadPage(1)} style={styles.primaryButton}><Text style={styles.primaryText}>Buscar</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {[null, 'pending', 'paid', 'active', 'failed', 'refunded'].map((status) => (
            <Pressable key={status || 'all'} onPress={() => setPaymentStatus(status)} style={[styles.chip, paymentStatus === status && styles.chipActive]}>
              <Text style={styles.chipText}>{status || 'Todos'}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <StateBlock state={state} error={error} onRetry={() => loadPage(pagination?.page || 1)} />
      {state === 'ready' && orders.length === 0 ? <View style={styles.stateCard}><Text style={styles.stateTitle}>Sin órdenes</Text><Text style={styles.stateText}>No hay resultados con los filtros actuales.</Text></View> : null}
      {orders.map((order) => <CommercialCard key={order.id} order={order} />)}

      {pagination ? (
        <View style={styles.pagination}>
          <Text style={styles.stateText}>Página {pagination.page} de {pagination.totalPages} · {pagination.total} órdenes</Text>
          <View style={styles.row}>
            <Pressable disabled={!pagination.hasPrev} onPress={() => loadPage(pagination.page - 1)} style={[styles.secondaryButton, !pagination.hasPrev && styles.disabled]}><Text style={styles.secondaryText}>Anterior</Text></Pressable>
            <Pressable disabled={!pagination.hasNext} onPress={() => loadPage(pagination.page + 1)} style={[styles.secondaryButton, !pagination.hasNext && styles.disabled]}><Text style={styles.secondaryText}>Siguiente</Text></Pressable>
          </View>
        </View>
      ) : null}
    </AdminShell>
  );
}

function CommercialCard({ order }: { order: PlatformCommercialOrder }) {
  return (
    <Pressable onPress={() => router.push(`/admin/commercial/${encodeURIComponent(order.id)}`)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.cardHeader}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{order.companyName}</Text>
          <Text style={styles.mono}>{order.id} · {order.organizationId || 'sin organización'}</Text>
        </View>
        <StatusBadge value={order.status.payment} />
      </View>
      <View style={styles.metricsRow}>
        <MiniMetric label="Plan" value={order.plan?.name || 'Sin plan'} />
        <MiniMetric label="Importe" value={formatMoney(order.pricing.totalPrice)} />
        <MiniMetric label="Activación" value={order.status.activation || 'unknown'} />
        <MiniMetric label="Creada" value={formatDate(order.createdAt)} />
      </View>
    </Pressable>
  );
}

export function AdminCommercialDetailScreen({ orderId }: { orderId: string }) {
  const token = useAdminStore((state) => state.session?.token || '');
  const state = usePlatformOperationsStore((store) => store.commercialState);
  const error = usePlatformOperationsStore((store) => store.commercialError);
  const order = usePlatformOperationsStore((store) => store.selectedOrder);
  const loadOrder = usePlatformOperationsStore((store) => store.loadOrder);
  useEffect(() => { if (token) void loadOrder(token, orderId); }, [loadOrder, orderId, token]);

  return (
    <AdminShell actions={<Pressable onPress={() => router.push('/admin/commercial')} style={styles.secondaryButton}><Text style={styles.secondaryText}>Volver</Text></Pressable>} title={order?.companyName || 'Orden comercial'} subtitle="Detalle sanitizado de la operación comercial. Solo lectura.">
      <StateBlock state={state} error={error} onRetry={() => token && void loadOrder(token, orderId)} />
      {state === 'ready' && order ? (
        <View style={styles.detailGrid}>
          <Section title="Identidad"><KeyValue label="Orden" value={order.id} /><KeyValue label="Organización" value={order.organizationId || 'Sin organización'} /><KeyValue label="Propietario" value={order.owner.name || 'Sin nombre'} /><KeyValue label="Correo" value={order.owner.email || 'Sin correo'} /></Section>
          <Section title="Plan y precio"><KeyValue label="Plan" value={order.plan?.name || 'Sin plan'} /><KeyValue label="Unidades" value={String(order.plan?.units || 0)} /><KeyValue label="Base" value={formatMoney(order.pricing.basePlanPrice)} /><KeyValue label="Total" value={formatMoney(order.pricing.totalPrice)} /></Section>
          <Section title="Estados"><KeyValue label="Pago" value={order.status.payment || 'unknown'} /><KeyValue label="Activación" value={order.status.activation || 'unknown'} /><KeyValue label="Onboarding" value={order.status.onboarding || 'unknown'} /><KeyValue label="Financiero" value={order.status.financial || 'unknown'} /></Section>
          <Section title="Facturación"><KeyValue label="Método" value={order.billing.paymentMethod || 'Sin método'} /><KeyValue label="Proveedor" value={order.billing.paymentProvider || 'Sin proveedor'} /><KeyValue label="Próximo cobro" value={formatDate(order.billing.nextBillingAt)} /><KeyValue label="Pagado hasta" value={formatDate(order.billing.paidUntil)} /></Section>
        </View>
      ) : null}
    </AdminShell>
  );
}

export function AdminSystemScreen() {
  const token = useAdminStore((state) => state.session?.token || '');
  const state = usePlatformOperationsStore((store) => store.systemState);
  const error = usePlatformOperationsStore((store) => store.systemError);
  const readiness = usePlatformOperationsStore((store) => store.readiness);
  const loadReadiness = usePlatformOperationsStore((store) => store.loadReadiness);
  useEffect(() => { if (token) void loadReadiness(token); }, [loadReadiness, token]);

  return (
    <AdminShell actions={<Pressable onPress={() => token && void loadReadiness(token)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Actualizar</Text></Pressable>} title="Sistema" subtitle="Readiness sanitizado de infraestructura e integraciones. Nunca expone secretos, tokens ni URLs privadas.">
      <StateBlock state={state} error={error} onRetry={() => token && void loadReadiness(token)} />
      {readiness ? (
        <>
          <View style={styles.systemHeadline}><Text style={styles.cardTitle}>Estado global</Text><StatusBadge value={readiness.status} /><Text style={styles.stateText}>Generado {formatDate(readiness.generatedAt)}</Text></View>
          <View style={styles.componentGrid}>
            {Object.entries(readiness).filter(([key]) => !['generatedAt', 'status'].includes(key)).map(([key, component]) => (
              <ReadinessCard component={component as ReadinessComponent} key={key} name={key} />
            ))}
          </View>
        </>
      ) : null}
    </AdminShell>
  );
}

function ReadinessCard({ name, component }: { name: string; component: ReadinessComponent }) {
  const primary = component.status ?? component.ready ?? component.connected ?? component.healthy ?? component.configured;
  return (
    <View style={styles.componentCard}>
      <View style={styles.cardHeader}><Text style={styles.cardTitle}>{name}</Text><StatusBadge value={primary} /></View>
      <View style={styles.componentDetails}>
        {Object.entries(component).filter(([key]) => key !== 'issues').map(([key, value]) => <KeyValue key={key} label={key} value={String(value)} />)}
        {(component.issues || []).map((issue) => <Text key={issue} style={styles.issue}>• {issue}</Text>)}
      </View>
    </View>
  );
}

export function AdminAuditScreen() {
  const token = useAdminStore((state) => state.session?.token || '');
  const state = usePlatformOperationsStore((store) => store.auditState);
  const error = usePlatformOperationsStore((store) => store.auditError);
  const entries = usePlatformOperationsStore((store) => store.auditEntries);
  const pagination = usePlatformOperationsStore((store) => store.auditPagination);
  const persistent = usePlatformOperationsStore((store) => store.auditPersistent);
  const loadAudit = usePlatformOperationsStore((store) => store.loadAudit);
  const [action, setAction] = useState('');
  const [severity, setSeverity] = useState<string | null>(null);
  useEffect(() => { if (token) void loadAudit(token, { page: 1, limit: 30 }); }, [loadAudit, token]);
  const loadPage = (page: number) => token && void loadAudit(token, { page, limit: 30, action, severity, sort: 'createdAt', order: 'desc' });

  return (
    <AdminShell title="Auditoría" subtitle="Actividad sensible de Platform con metadata allowlist. IP, user-agent y payloads crudos permanecen fuera de la interfaz.">
      <View style={styles.filterCard}>
        <View style={styles.searchRow}><TextInput value={action} onChangeText={setAction} onSubmitEditing={() => loadPage(1)} placeholder="Acción exacta, por ejemplo platform.company.view" placeholderTextColor={palette.mutedSoft} style={styles.input} /><Pressable onPress={() => loadPage(1)} style={styles.primaryButton}><Text style={styles.primaryText}>Filtrar</Text></Pressable></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{[null, 'info', 'warn', 'error', 'critical'].map((value) => <Pressable key={value || 'all'} onPress={() => setSeverity(value)} style={[styles.chip, severity === value && styles.chipActive]}><Text style={styles.chipText}>{value || 'Todas'}</Text></Pressable>)}</ScrollView>
      </View>
      {!persistent && state === 'ready' ? <View style={styles.stateCard}><Text style={styles.stateTitle}>Persistencia no disponible</Text><Text style={styles.stateText}>El entorno actual no tiene Mongo conectado; la API responde vacío en lugar de inventar eventos.</Text></View> : null}
      <StateBlock state={state} error={error} onRetry={() => loadPage(pagination?.page || 1)} />
      {entries.map((entry) => (
        <View key={entry.id} style={styles.auditRow}>
          <View style={styles.flex}><Text style={styles.cardTitle}>{entry.action}</Text><Text style={styles.mono}>{entry.actorId || 'actor desconocido'} · {formatDate(entry.createdAt)}</Text></View>
          <StatusBadge value={entry.severity} />
          <Text style={styles.auditMeta}>{entry.result || 'sin resultado'} · {entry.platformRole || 'sin rol'} · {entry.organizationId || 'sin organización'}</Text>
        </View>
      ))}
      {pagination ? <View style={styles.pagination}><Text style={styles.stateText}>Página {pagination.page} de {pagination.totalPages} · {pagination.total} eventos</Text><View style={styles.row}><Pressable disabled={!pagination.hasPrev} onPress={() => loadPage(pagination.page - 1)} style={[styles.secondaryButton, !pagination.hasPrev && styles.disabled]}><Text style={styles.secondaryText}>Anterior</Text></Pressable><Pressable disabled={!pagination.hasNext} onPress={() => loadPage(pagination.page + 1)} style={[styles.secondaryButton, !pagination.hasNext && styles.disabled]}><Text style={styles.secondaryText}>Siguiente</Text></Pressable></View></View> : null}
    </AdminShell>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) { return <View style={styles.miniMetric}><Text style={styles.metricLabel}>{label}</Text><Text numberOfLines={1} style={styles.metricValue}>{value}</Text></View>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.cardTitle}>{title}</Text><View style={styles.sectionBody}>{children}</View></View>; }
function KeyValue({ label, value }: { label: string; value: string }) { return <View style={styles.keyValue}><Text style={styles.keyLabel}>{label}</Text><Text style={styles.keyText}>{value}</Text></View>; }

const styles = StyleSheet.create({
  filterCard: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, gap: 12, padding: 17 },
  searchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  input: { backgroundColor: palette.surfaceAlt, borderColor: palette.line, borderRadius: 10, borderWidth: 1, color: palette.text, flex: 1, fontFamily: Typography.body, minHeight: 44, minWidth: 250, paddingHorizontal: 14 },
  primaryButton: { alignItems: 'center', backgroundColor: palette.accent, borderRadius: 10, justifyContent: 'center', minHeight: 44, paddingHorizontal: 20 },
  primaryText: { color: '#fff', fontFamily: Typography.body, fontSize: 12, fontWeight: '900' },
  chipRow: { gap: 8 }, chip: { backgroundColor: palette.surfaceAlt, borderColor: palette.line, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 }, chipActive: { backgroundColor: palette.accentSoft, borderColor: 'rgba(227,30,36,.35)' }, chipText: { color: palette.muted, fontFamily: Typography.body, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  card: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, padding: 18 }, cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' }, cardTitle: { color: palette.text, fontFamily: Typography.display, fontSize: 16, fontWeight: '900' }, mono: { color: palette.mutedSoft, fontFamily: Typography.mono, fontSize: 9, marginTop: 4 }, flex: { flex: 1 }, pressed: { opacity: .75 },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 17 }, miniMetric: { flexGrow: 1, minWidth: 135 }, metricLabel: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 9, textTransform: 'uppercase' }, metricValue: { color: palette.text, fontFamily: Typography.body, fontSize: 11, fontWeight: '900', marginTop: 4 },
  badge: { borderRadius: 999, fontFamily: Typography.mono, fontSize: 9, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, textTransform: 'uppercase' }, good: { backgroundColor: 'rgba(53,200,107,.14)', color: palette.success }, warn: { backgroundColor: 'rgba(240,167,37,.14)', color: palette.warning }, bad: { backgroundColor: 'rgba(240,106,106,.14)', color: palette.danger }, neutral: { backgroundColor: palette.surfaceAlt, color: palette.muted },
  stateCard: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 14, borderWidth: 1, gap: 9, padding: 18 }, errorCard: { backgroundColor: 'rgba(240,106,106,.08)' }, stateTitle: { color: palette.text, fontFamily: Typography.display, fontSize: 16, fontWeight: '900' }, stateText: { color: palette.muted, fontFamily: Typography.body, fontSize: 11, lineHeight: 17 }, errorText: { color: palette.danger },
  secondaryButton: { alignItems: 'center', borderColor: palette.lineStrong, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: 14 }, secondaryText: { color: palette.muted, fontFamily: Typography.body, fontSize: 11, fontWeight: '900' }, disabled: { opacity: .35 }, pagination: { alignItems: 'center', backgroundColor: palette.card, borderColor: palette.line, borderRadius: 14, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', padding: 14 }, row: { flexDirection: 'row', gap: 8 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, section: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, flexGrow: 1, minWidth: 290, padding: 18, width: '48%' }, sectionBody: { borderTopColor: palette.line, borderTopWidth: 1, marginTop: 13, paddingTop: 10 }, keyValue: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingVertical: 6 }, keyLabel: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 10 }, keyText: { color: palette.text, flex: 1, fontFamily: Typography.body, fontSize: 10, fontWeight: '700', textAlign: 'right' },
  systemHeadline: { alignItems: 'center', backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 18 }, componentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, componentCard: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, flexGrow: 1, minWidth: 250, padding: 17, width: '31%' }, componentDetails: { borderTopColor: palette.line, borderTopWidth: 1, marginTop: 13, paddingTop: 8 }, issue: { color: palette.warning, fontFamily: Typography.body, fontSize: 10, lineHeight: 15, marginTop: 5 },
  auditRow: { alignItems: 'center', backgroundColor: palette.card, borderColor: palette.line, borderRadius: 14, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 15 }, auditMeta: { color: palette.muted, fontFamily: Typography.body, fontSize: 10, width: '100%' },
});
