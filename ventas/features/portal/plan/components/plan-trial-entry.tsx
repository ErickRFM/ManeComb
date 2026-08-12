import { Text, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { AppTheme, Typography } from '@/constants/theme';
import type { CommercialPlanView } from '@/features/commercial';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { portalPalette } from '../../portal-theme';

export function PlanTrialEntry({
  plan,
  onStart,
}: {
  plan: CommercialPlanView;
  onStart: () => void;
}) {
  const trialDays = Number(plan.trialDays || 7);

  return (
    <PortalSectionCard
      title={`Prueba de ${trialDays} días`}
      subtitle={`Empieza con ${plan.units} combis y activa la operación antes de contratar.`}
      right={
        <PortalButton icon="arrow-right" onPress={onStart} size="md">
          Iniciar prueba
        </PortalButton>
      }>
      <View style={styles.detailRow}>
        <View style={styles.detail}>
          <MaterialCommunityIcons name="bus-multiple" size={18} color={portalPalette.info} />
          <Text style={styles.detailText}>{plan.units} combis</Text>
        </View>
        <View style={styles.detail}>
          <MaterialCommunityIcons name="calendar-clock-outline" size={18} color={portalPalette.info} />
          <Text style={styles.detailText}>{trialDays} días</Text>
        </View>
        <View style={styles.detail}>
          <MaterialCommunityIcons name="shield-check-outline" size={18} color={portalPalette.success} />
          <Text style={styles.detailText}>Acceso operativo durante la prueba</Text>
        </View>
      </View>
    </PortalSectionCard>
  );
}

const styles = StyleSheet.create({
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.sm,
  },
  detail: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: AppTheme.spacing.xs,
    minHeight: 40,
    paddingHorizontal: AppTheme.spacing.sm,
  },
  detailText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
});
