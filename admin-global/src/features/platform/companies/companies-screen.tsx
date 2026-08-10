import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from '@/components/router';
import { useAdminStore } from '@/features/auth/store';
import { palette, Typography } from '@/styles/theme';
import { AdminShell } from '../components/admin-shell';
import { usePlatformStore } from '../store';
import { usePlatformCompanyStore } from './store';
import type { PlatformCompany } from './types';

const PAYMENT_FILTERS = [
  { value: null, label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'active', label: 'Activas' },
  { value: 'failed', label: 'Fallidas' },
];

const PLAN_FILTERS = [
  { value: null, label: 'Todos los planes' },
  { value: 'starter-2', label: '2 combis' },
  { value: 'value-4', label: '4 combis' },
  { value: 'control-6', label: '6 combis' },
  { value: 'premium-8', label: '8 combis' },
  { value: 'enterprise-12', label: '12 combis' },
];

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  attention: 'Requiere atención',
  cancelled: 'Cancelado',
  completed: 'Completado',
  failed: 'Fallido',
  idle: 'Disponible',
  inactive: 'Inactivo',
  maintenance: 'Mantenimiento',
  on_route: 'En ruta',
  operational: 'Operativa',
  paid: 'Pagado',
  pending: 'Pendiente',
  retired: 'Retirada',
  suspended: 'Suspendido',
};

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Sin registro'
    : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value || 0);
}

function formatStatus(value: string | null | undefined) {
  if (!value) return 'Sin estado';
  return STATUS_LABELS[value] || value.replaceAll('_', ' ');
}

function statusTone(status: string | null | undefined) {
  if (['paid', 'active', 'completed', 'operational'].includes(String(status))) return styles.statusSuccess;
  if (['pending', 'in_progress', 'attention', 'maintenance'].includes(String(status))) return styles.statusWarning;
  if (['failed', 'cancelled', 'suspended', 'retired'].includes(String(status))) return styles.statusDanger;
  return styles.statusMuted;
}

export function AdminCompaniesScreen() {
  const token = useAdminStore((state) => state.session?.token || '');
  const canReadCommercial = usePlatformStore(
    (state) => state.capabilities?.permissions.includes('platform.commercial.read') ?? false
  );
  const { width } = useWindowDimensions();
  const listState = usePlatformCompanyStore((state) => state.listState);
  const listError = usePlatformCompanyStore((state) => state.listError);
  const items = usePlatformCompanyStore((state) => state.items);
  const pagination = usePlatformCompanyStore((state) => state.pagination);
  const loadList = usePlatformCompanyStore((state) => state.loadList);
  const [search, setSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const cardWidth = width >= 1180 ? '48.8%' : '100%';

  useEffect(() => {
    if (token) void loadList(token, { page: 1, limit: 20 });
  }, [loadList, token]);

  const applyFilters = (page = 1) => {
    if (!token) return;
    void loadList(token, {
      page,
      limit: 20,
      search,
      paymentStatus: canReadCommercial ? paymentStatus : null,
      planId,
      sort: 'companyName',
      order: 'asc',
    });
  };

  return (
    <AdminShell
      title="Empresas"
      subtitle="Consulta clientes, propietarios, planes, usuarios y unidades desde un solo lugar."
    >
      <View style={styles.filterCard}>
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="Buscar empresas"
            autoCapitalize="none"
            onChangeText={setSearch}
            onSubmitEditing={() => applyFilters(1)}
            placeholder="Empresa, propietario, correo u organización"
            placeholderTextColor={palette.mutedSoft}
            returnKeyType="search"
            style={styles.searchInput}
            value={search}
          />
          <Pressable accessibilityRole="button" onPress={() => applyFilters(1)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>Buscar</Text>
          </Pressable>
        </View>

        {canReadCommercial ? (
          <>
            <Text style={styles.filterLabel}>Estado de pago</Text>
            <ScrollView contentContainerStyle={styles.chipRow} horizontal showsHorizontalScrollIndicator={false}>
              {PAYMENT_FILTERS.map((filter) => (
                <FilterChip
                  active={paymentStatus === filter.value}
                  key={filter.label}
                  label={filter.label}
                  onPress={() => { setPaymentStatus(filter.value); }}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        <Text style={styles.filterLabel}>Plan</Text>
        <ScrollView contentContainerStyle={styles.chipRow} horizontal showsHorizontalScrollIndicator={false}>
          {PLAN_FILTERS.map((filter) => (
            <FilterChip
              active={planId === filter.value}
              key={filter.label}
              label={filter.label}
              onPress={() => { setPlanId(filter.value); }}
            />
          ))}
        </ScrollView>
      </View>

      {listState === 'loading' ? <StateCard title="Cargando empresas…" body="Consultando la información más reciente." /> : null}
      {listState === 'error' ? (
        <StateCard
          action="Reintentar"
          body={listError || 'No fue posible consultar empresas.'}
          onAction={() => applyFilters(pagination?.page || 1)}
          title="No se pudo cargar la lista"
          tone="danger"
        />
      ) : null}
      {listState === 'ready' && items.length === 0 ? (
        <StateCard body="No hay empresas que coincidan con los filtros actuales." title="Sin resultados" />
      ) : null}

      {items.length > 0 ? (
        <View style={styles.companyGrid}>
          {items.map((company) => (
            <CompanyCard company={company} key={company.organizationId} width={cardWidth} />
          ))}
        </View>
      ) : null}

      {pagination ? (
        <View style={styles.paginationBar}>
          <Text style={styles.paginationText}>
            Página {pagination.page} de {pagination.totalPages} · {pagination.total} empresas
          </Text>
          <View style={styles.paginationActions}>
            <Pressable
              accessibilityRole="button"
              disabled={!pagination.hasPrev || listState === 'loading'}
              onPress={() => applyFilters(pagination.page - 1)}
              style={[styles.secondaryButton, (!pagination.hasPrev || listState === 'loading') && styles.disabled]}
            >
              <Text style={styles.secondaryButtonText}>Anterior</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!pagination.hasNext || listState === 'loading'}
              onPress={() => applyFilters(pagination.page + 1)}
              style={[styles.secondaryButton, (!pagination.hasNext || listState === 'loading') && styles.disabled]}
            >
              <Text style={styles.secondaryButtonText}>Siguiente</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </AdminShell>
  );
}

function CompanyCard({ company, width }: { company: PlatformCompany; width: string | number }) {
  return (
    <Pressable
      accessibilityLabel={`Abrir ${company.companyName}`}
      accessibilityRole="button"
      onPress={() => router.push(`/admin/companies/${encodeURIComponent(company.organizationId)}`)}
      style={({ pressed }) => [styles.companyCard, { width: width as any }, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeading}>
          <Text numberOfLines={1} style={styles.companyName}>{company.companyName}</Text>
          <Text numberOfLines={1} style={styles.organizationId}>{company.organizationId}</Text>
        </View>
        <Text style={[styles.statusBadge, statusTone(company.operationalStatus)]}>{formatStatus(company.operationalStatus)}</Text>
      </View>

      <View style={styles.summaryRow}>
        <Summary label="Plan" value={company.plan?.name || 'Sin plan'} />
        <Summary label="Usuarios" value={String(company.users.total)} />
        <Summary label="Unidades" value={String(company.vehicles.active)} />
      </View>

      <View style={styles.divider} />
      <Text style={styles.ownerText}>{company.owner?.name || 'Propietario no identificado'}</Text>
      <Text style={styles.ownerEmail}>{company.owner?.email || 'Sin correo de propietario'}</Text>
      <View style={styles.cardFooter}>
        {company.commercialAccess ? (
          <Text style={[styles.statusBadge, statusTone(company.commercial.paymentStatus)]}>
            {formatStatus(company.commercial.paymentStatus)}
          </Text>
        ) : null}
        <Text style={styles.lastAccess}>Último acceso: {formatDate(company.lastAccessAt)}</Text>
      </View>
    </Pressable>
  );
}

export function AdminCompanyDetailScreen({ organizationId }: { organizationId: string }) {
  const token = useAdminStore((state) => state.session?.token || '');
  const detailState = usePlatformCompanyStore((state) => state.detailState);
  const detailError = usePlatformCompanyStore((state) => state.detailError);
  const company = usePlatformCompanyStore((state) => state.selected);
  const loadDetail = usePlatformCompanyStore((state) => state.loadDetail);

  useEffect(() => {
    if (token && organizationId) void loadDetail(token, organizationId);
  }, [loadDetail, organizationId, token]);

  const backAction = (
    <Pressable accessibilityRole="button" onPress={() => router.push('/admin/companies')} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>Volver a empresas</Text>
    </Pressable>
  );

  return (
    <AdminShell
      actions={backAction}
      title={company?.companyName || 'Detalle de empresa'}
      subtitle={company ? company.organizationId : 'Información general de la empresa.'}
    >
      {detailState === 'loading' || detailState === 'idle' ? <StateCard title="Cargando empresa…" body="Preparando usuarios, unidades y estado actual." /> : null}
      {detailState === 'error' ? (
        <StateCard
          action="Reintentar"
          body={detailError || 'No fue posible cargar la empresa.'}
          onAction={() => token && void loadDetail(token, organizationId, true)}
          title="No se pudo cargar el detalle"
          tone="danger"
        />
      ) : null}
      {detailState === 'ready' && company ? <CompanyDetail company={company} /> : null}
    </AdminShell>
  );
}

function CompanyDetail({ company }: { company: PlatformCompany }) {
  const { width } = useWindowDimensions();
  const compact = width < 720;

  return (
    <>
      <View style={styles.metricGrid}>
        <Metric
          label="Plan"
          value={company.plan?.name || 'Sin plan'}
          detail={company.plan
            ? company.commercialAccess
              ? `${company.plan.units} unidades · ${formatMoney(company.plan.price)}`
              : `${company.plan.units} unidades`
            : 'No hay plan asociado'}
        />
        <Metric label="Usuarios" value={String(company.users.total)} detail={`${company.users.byStatus.active} activos · ${company.users.byStatus.pending} pendientes`} />
        <Metric label="Unidades activas" value={String(company.vehicles.active)} detail={`${company.vehicles.byStatus.on_route} en ruta · ${company.vehicles.byStatus.maintenance} en mantenimiento`} />
        <Metric label="Estado operativo" value={formatStatus(company.operationalStatus)} detail={`Último acceso ${formatDate(company.lastAccessAt)}`} />
      </View>

      <View style={styles.detailGrid}>
        <DetailSection title="Propietario">
          <KeyValue label="Nombre" value={company.owner?.name || 'No identificado'} />
          <KeyValue label="Correo" value={company.owner?.email || 'Sin correo'} />
          <KeyValue label="Estado" value={formatStatus(company.owner?.status)} />
          <KeyValue label="Último acceso" value={formatDate(company.owner?.lastAccessAt)} />
        </DetailSection>

        {company.commercialAccess ? (
          <DetailSection title="Estado comercial">
            <KeyValue label="Pago" value={formatStatus(company.commercial.paymentStatus)} />
            <KeyValue label="Activación" value={formatStatus(company.commercial.activationStatus)} />
            <KeyValue label="Onboarding" value={formatStatus(company.commercial.onboardingStatus)} />
            <KeyValue label="Próxima facturación" value={formatDate(company.commercial.nextBillingAt)} />
            <KeyValue label="Importe" value={formatMoney(company.billing.totalPrice)} />
            <KeyValue label="Método" value={company.billing.paymentMethod || 'Sin método'} />
          </DetailSection>
        ) : null}
      </View>

      <DetailSection title={`Usuarios (${company.users.total})`} wide>
        {compact ? (
          <View style={styles.mobileDataList}>
            {(company.users.items || []).map((user) => (
              <View key={user.id} style={styles.mobileDataCard}>
                <Text style={styles.rowPrimary}>{user.name}</Text>
                <Text style={styles.rowSecondary}>{user.email}</Text>
                <View style={styles.mobileDataGrid}>
                  <Summary label="Rol" value={user.role.replaceAll('_', ' ')} />
                  <Summary label="Estado" value={formatStatus(user.status)} />
                </View>
                <Text style={styles.mobileDataMeta}>Último acceso: {formatDate(user.lastAccessAt)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, styles.tableName]}>Usuario</Text>
              <Text style={styles.tableCell}>Rol</Text>
              <Text style={styles.tableCell}>Estado</Text>
              <Text style={styles.tableCell}>Último acceso</Text>
            </View>
            {(company.users.items || []).map((user) => (
              <View key={user.id} style={styles.tableRow}>
                <View style={[styles.tableCell, styles.tableName]}>
                  <Text style={styles.rowPrimary}>{user.name}</Text>
                  <Text style={styles.rowSecondary}>{user.email}</Text>
                </View>
                <Text style={styles.tableCell}>{user.role.replaceAll('_', ' ')}</Text>
                <Text style={styles.tableCell}>{formatStatus(user.status)}</Text>
                <Text style={styles.tableCell}>{formatDate(user.lastAccessAt)}</Text>
              </View>
            ))}
          </>
        )}
      </DetailSection>

      <DetailSection title={`Unidades (${company.vehicles.total})`} wide>
        {compact ? (
          <View style={styles.mobileDataList}>
            {(company.vehicles.items || []).map((vehicle) => (
              <View key={vehicle.id} style={styles.mobileDataCard}>
                <Text style={styles.rowPrimary}>{vehicle.code}</Text>
                <Text style={styles.rowSecondary}>{vehicle.plate}</Text>
                <View style={styles.mobileDataGrid}>
                  <Summary label="Estado" value={vehicle.retiredAt ? 'Retirada' : formatStatus(vehicle.status)} />
                  <Summary label="Ruta" value={vehicle.routeId || 'Sin ruta'} />
                </View>
                <Text style={styles.mobileDataMeta}>Actualizada: {formatDate(vehicle.updatedAt)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, styles.tableName]}>Unidad</Text>
              <Text style={styles.tableCell}>Estado</Text>
              <Text style={styles.tableCell}>Ruta</Text>
              <Text style={styles.tableCell}>Actualizada</Text>
            </View>
            {(company.vehicles.items || []).map((vehicle) => (
              <View key={vehicle.id} style={styles.tableRow}>
                <View style={[styles.tableCell, styles.tableName]}>
                  <Text style={styles.rowPrimary}>{vehicle.code}</Text>
                  <Text style={styles.rowSecondary}>{vehicle.plate}</Text>
                </View>
                <Text style={styles.tableCell}>{vehicle.retiredAt ? 'Retirada' : formatStatus(vehicle.status)}</Text>
                <Text style={styles.tableCell}>{vehicle.routeId || 'Sin ruta'}</Text>
                <Text style={styles.tableCell}>{formatDate(vehicle.updatedAt)}</Text>
              </View>
            ))}
          </>
        )}
      </DetailSection>
    </>
  );
}

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function DetailSection({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <View style={[styles.detailSection, wide && styles.detailSectionWide]}>
      <Text accessibilityRole="header" style={styles.detailTitle}>{title}</Text>
      <View style={styles.detailBody}>{children}</View>
    </View>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.keyValueRow}>
      <Text style={styles.keyLabel}>{label}</Text>
      <Text style={styles.keyValue}>{value}</Text>
    </View>
  );
}

function StateCard({ title, body, tone = 'default', action, onAction }: { title: string; body: string; tone?: 'default' | 'danger'; action?: string; onAction?: () => void }) {
  return (
    <View accessibilityRole={tone === 'danger' ? 'alert' : undefined} style={[styles.stateCard, tone === 'danger' && styles.stateCardDanger]}>
      <Text style={[styles.stateTitle, tone === 'danger' && styles.stateTitleDanger]}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  filterCard: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, gap: 10, padding: 18 },
  searchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  searchInput: { backgroundColor: palette.surfaceAlt, borderColor: palette.line, borderRadius: 10, borderWidth: 1, color: palette.text, flex: 1, fontFamily: Typography.body, minHeight: 44, minWidth: 220, paddingHorizontal: 14 },
  primaryButton: { alignItems: 'center', backgroundColor: palette.accent, borderRadius: 10, justifyContent: 'center', minHeight: 44, paddingHorizontal: 20 },
  primaryButtonText: { color: '#fff', fontFamily: Typography.body, fontSize: 12, fontWeight: '900' },
  filterLabel: { color: palette.muted, fontFamily: Typography.body, fontSize: 10, fontWeight: '900', marginTop: 4, textTransform: 'uppercase' },
  chipRow: { gap: 8 },
  chip: { alignItems: 'center', backgroundColor: palette.surfaceAlt, borderColor: palette.line, borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 13 },
  chipActive: { backgroundColor: palette.accentSoft, borderColor: 'rgba(227,30,36,.35)' },
  chipText: { color: palette.muted, fontFamily: Typography.body, fontSize: 11, fontWeight: '700' },
  chipTextActive: { color: palette.text },
  companyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  companyCard: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, padding: 18 },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  cardHeading: { flex: 1 },
  companyName: { color: palette.text, fontFamily: Typography.display, fontSize: 18, fontWeight: '900' },
  organizationId: { color: palette.mutedSoft, fontFamily: Typography.mono, fontSize: 10, marginTop: 4 },
  statusBadge: { borderRadius: 999, fontFamily: Typography.body, fontSize: 9, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  statusSuccess: { backgroundColor: 'rgba(53,200,107,.14)', color: palette.success },
  statusWarning: { backgroundColor: 'rgba(240,167,37,.14)', color: palette.warning },
  statusDanger: { backgroundColor: 'rgba(240,106,106,.14)', color: palette.danger },
  statusMuted: { backgroundColor: palette.surfaceAlt, color: palette.muted },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  summaryItem: { flex: 1, minWidth: 72 },
  summaryLabel: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 9, textTransform: 'uppercase' },
  summaryValue: { color: palette.text, fontFamily: Typography.body, fontSize: 12, fontWeight: '900', marginTop: 4 },
  divider: { backgroundColor: palette.line, height: 1, marginVertical: 16 },
  ownerText: { color: palette.text, fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
  ownerEmail: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 10, marginTop: 3 },
  cardFooter: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', marginTop: 14 },
  lastAccess: { color: palette.mutedSoft, flex: 1, fontFamily: Typography.body, fontSize: 9, minWidth: 140, textAlign: 'right' },
  paginationBar: { alignItems: 'center', backgroundColor: palette.card, borderColor: palette.line, borderRadius: 14, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', padding: 14 },
  paginationText: { color: palette.muted, fontFamily: Typography.body, fontSize: 11 },
  paginationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryButton: { alignItems: 'center', borderColor: palette.lineStrong, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  secondaryButtonText: { color: palette.muted, fontFamily: Typography.body, fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.75 },
  stateCard: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 14, borderWidth: 1, gap: 9, padding: 20 },
  stateCardDanger: { backgroundColor: 'rgba(240,106,106,.08)', borderColor: 'rgba(240,106,106,.3)' },
  stateTitle: { color: palette.text, fontFamily: Typography.display, fontSize: 17, fontWeight: '900' },
  stateTitleDanger: { color: palette.danger },
  stateBody: { color: palette.muted, fontFamily: Typography.body, fontSize: 12, lineHeight: 18 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metricCard: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, flexGrow: 1, minWidth: 210, padding: 18, width: '23%' },
  metricLabel: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  metricValue: { color: palette.text, fontFamily: Typography.display, fontSize: 22, fontWeight: '900', marginTop: 9 },
  metricDetail: { color: palette.muted, fontFamily: Typography.body, fontSize: 10, lineHeight: 15, marginTop: 7 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  detailSection: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, flexGrow: 1, minWidth: 280, padding: 18, width: '48%' },
  detailSectionWide: { width: '100%' },
  detailTitle: { color: palette.text, fontFamily: Typography.display, fontSize: 16, fontWeight: '900' },
  detailBody: { borderTopColor: palette.line, borderTopWidth: 1, marginTop: 14, paddingTop: 12 },
  keyValueRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', paddingVertical: 7 },
  keyLabel: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 10, minWidth: 90 },
  keyValue: { color: palette.text, flex: 1, fontFamily: Typography.body, fontSize: 11, fontWeight: '700', minWidth: 140, textAlign: 'right' },
  tableHeader: { borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', gap: 8, paddingBottom: 9 },
  tableRow: { borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', gap: 8, paddingVertical: 11 },
  tableCell: { color: palette.muted, flex: 1, fontFamily: Typography.body, fontSize: 10 },
  tableName: { flex: 1.5 },
  rowPrimary: { color: palette.text, fontFamily: Typography.body, fontSize: 11, fontWeight: '800' },
  rowSecondary: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 9, marginTop: 3 },
  mobileDataList: { gap: 10 },
  mobileDataCard: { backgroundColor: palette.surfaceAlt, borderColor: palette.line, borderRadius: 12, borderWidth: 1, padding: 13 },
  mobileDataGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  mobileDataMeta: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 9, marginTop: 12 },
});
