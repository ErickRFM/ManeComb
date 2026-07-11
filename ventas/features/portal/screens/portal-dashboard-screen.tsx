import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { SkeletonBlock } from '@/src/components/ui/skeleton';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { formatCurrency, formatDate } from '@/src/utils/format';
import type { PortalPaymentMethod } from '@/src/types/app';
import { CommercialActivityList, useCommercialDashboard } from '@/features/commercial';
import { AccountSummaryCard, PortalSectionCard } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { portalButtonGradient, portalPalette } from '../portal-theme';

function getPaymentMethodLabel(method: PortalPaymentMethod | null) {
  if (!method) return 'Sin método';
  if (method.type === 'spei') return 'Transferencia SPEI';
  return `${method.brand || 'Tarjeta'} ···· ${method.last4 || '----'}`;
}

function getStateBackground(tone: 'positive' | 'warning' | 'danger' | 'info' | 'neutral') {
  if (tone === 'positive') return portalPalette.successSoft;
  if (tone === 'warning') return portalPalette.warningSoft;
  if (tone === 'danger') return portalPalette.dangerSoft;
  return portalPalette.infoSoft;
}

export function PortalDashboardScreen() {
  const { isLoading, model, reload } = useCommercialDashboard();

  return (
    <PortalLayout
      title="Inicio"
      subtitle="El estado comercial de tu cuenta y el siguiente paso recomendado."
      actions={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Actualizar resumen comercial"
          onPress={() => void reload()}
          style={[styles.actionButton, portalButtonGradient()]}>
          <MaterialCommunityIcons name="refresh" size={18} color="#FFFFFF" />
          <Text style={styles.actionText}>Actualizar</Text>
        </Pressable>
      }>
      {isLoading && !model ? (
        <View style={styles.summaryGrid}>
          {[0, 1, 2].map((item) => (
            <View key={item} style={styles.skeletonCard}>
              <SkeletonBlock height={18} width="45%" />
              <SkeletonBlock height={36} />
              <SkeletonBlock height={16} width="70%" />
            </View>
          ))}
        </View>
      ) : null}

      {model ? (
        <>
          <View style={styles.stateNotice}>
            <View style={[styles.stateIcon, { backgroundColor: getStateBackground(model.state.tone) }]}>
              <MaterialCommunityIcons
                name={model.state.tone === 'danger' ? 'alert-circle-outline' : 'shield-check-outline'}
                size={22}
                color={model.state.tone === 'danger' ? portalPalette.danger : portalPalette.info}
              />
            </View>
            <View style={styles.stateCopy}>
              <Text style={styles.stateTitle}>{model.state.message}</Text>
              <Text style={styles.stateText}>
                {model.state.restrictions[0] || 'Puedes consultar y comparar opciones sin modificar tu suscripción.'}
              </Text>
            </View>
            <StatusBadge label={model.state.label} tone={model.state.tone} />
          </View>

          <View style={styles.summaryGrid}>
            <AccountSummaryCard
              icon="shield-check-outline"
              label="Suscripción"
              value={model.state.label}
              detail={model.currentPlan?.displayName || model.subscription?.planName || 'Sin plan contratado'}
              tone={model.state.tone}
            />
            <AccountSummaryCard
              icon="bus-multiple"
              label="Uso de unidades"
              value={`${model.activeUnits} de ${model.totalUnits}`}
              detail={`${model.availableUnits} ${model.availableUnits === 1 ? 'unidad disponible' : 'unidades disponibles'}`}
              tone={model.availableUnits > 0 ? 'info' : 'warning'}
            />
            <AccountSummaryCard
              icon="credit-card-outline"
              label="Método principal"
              value={getPaymentMethodLabel(model.defaultPaymentMethod)}
              detail={model.defaultPaymentMethod ? 'Listo para el siguiente paso' : 'Agrega uno para continuar'}
              tone={model.defaultPaymentMethod ? 'positive' : 'warning'}
            />
          </View>

          <PortalSectionCard
            title="Próximo paso recomendado"
            subtitle="Una acción clara según las reglas comerciales de tu cuenta."
            right={<StatusBadge label={model.recommendation.tone === 'positive' ? 'Cuenta al día' : 'Recomendado'} tone={model.recommendation.tone} />}>
            <View style={styles.recommendation}>
              <View style={[styles.recommendationIcon, styles[`recommendationIcon_${model.recommendation.tone}`]]}>
                <MaterialCommunityIcons name={model.recommendation.icon} size={24} color={portalPalette.text} />
              </View>
              <View style={styles.recommendationCopy}>
                <Text style={styles.recommendationTitle}>{model.recommendation.title}</Text>
                <Text style={styles.recommendationBody}>{model.recommendation.body}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={model.recommendation.label}
                onPress={() => router.push(model.recommendation.href as never)}
                style={[styles.recommendationButton, portalButtonGradient()]}>
                <Text style={styles.recommendationButtonText}>{model.recommendation.label}</Text>
                <MaterialCommunityIcons name="arrow-right" size={17} color="#FFFFFF" />
              </Pressable>
            </View>
          </PortalSectionCard>

          <View style={styles.activityGrid}>
            <PortalSectionCard title="Actividad comercial" subtitle="Eventos recientes de la cuenta.">
              <CommercialActivityList activities={model.activities} limit={5} />
            </PortalSectionCard>

            <PortalSectionCard title="Resumen del periodo" subtitle="Fechas e importes disponibles actualmente.">
              <View style={styles.periodGrid}>
                <PeriodFact
                  label="Próxima renovación"
                  value={formatDate(model.subscription?.currentPeriodEnd, { fallback: 'Por confirmar' })}
                />
                <PeriodFact
                  label="Mensualidad"
                  value={formatCurrency(model.subscription?.monthlyPrice, model.subscription?.currency || 'MXN')}
                />
                <PeriodFact
                  label="Último comprobante"
                  value={model.latestInvoice ? formatDate(model.latestInvoice.issuedAt) : 'No existen facturas todavía'}
                />
              </View>
            </PortalSectionCard>
          </View>
        </>
      ) : !isLoading ? (
        <EmptyState
          icon="view-dashboard-outline"
          title="Aún no hay un resumen disponible"
          description="Actualiza la vista o completa la contratación para ver el estado comercial de la cuenta."
        />
      ) : null}
    </PortalLayout>
  );
}

function PeriodFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.periodFact}>
      <Text style={styles.periodLabel}>{label}</Text>
      <Text style={styles.periodValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.md,
    minWidth: 0,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  actionText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  skeletonCard: {
    backgroundColor: portalPalette.surface,
    borderColor: portalPalette.line,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexBasis: 230,
    gap: 12,
    minHeight: 136,
    minWidth: 0,
    padding: AppTheme.spacing.md,
  },
  stateNotice: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: AppTheme.spacing.md,
  },
  stateIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  stateCopy: {
    flex: 1,
    flexBasis: 250,
    minWidth: 0,
  },
  stateTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  stateText: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  recommendation: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  recommendationIcon: {
    alignItems: 'center',
    borderRadius: 14,
    flexShrink: 0,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  recommendationIcon_info: {
    backgroundColor: portalPalette.infoSoft,
  },
  recommendationIcon_warning: {
    backgroundColor: portalPalette.warningSoft,
  },
  recommendationIcon_positive: {
    backgroundColor: portalPalette.successSoft,
  },
  recommendationCopy: {
    flex: 1,
    flexBasis: 260,
    gap: 4,
    minWidth: 0,
  },
  recommendationTitle: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 17,
    fontWeight: '900',
  },
  recommendationBody: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
  recommendationButton: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 15,
  },
  recommendationButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  activityGrid: {
    gap: AppTheme.spacing.md,
  },
  periodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  periodFact: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flex: 1,
    flexBasis: 190,
    gap: 4,
    minWidth: 0,
    padding: 12,
  },
  periodLabel: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 11,
  },
  periodValue: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
});
