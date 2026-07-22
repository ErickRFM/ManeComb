import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { palette } from '@/constants/theme';
import { PortalSectionCard } from '../../cards';
import { styles } from '../profile.styles';

type PortalProfileSupportSectionProps = {
  onOpenCommercialSupport: () => void;
  onOpenOperationalSupport: () => void;
};

export function PortalProfileSupportSection({
  onOpenCommercialSupport,
  onOpenOperationalSupport,
}: PortalProfileSupportSectionProps) {
  return (
    <PortalSectionCard title="Soporte" subtitle="Canales y contexto para administradores.">
      <View style={styles.supportGrid}>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenCommercialSupport}
          style={[styles.supportItem, { backgroundColor: palette.surface, borderColor: palette.line }]}>
          <MaterialCommunityIcons name="email-outline" size={22} color={palette.info} />
          <View style={styles.supportCopy}>
            <Text style={[styles.sessionTitle, { color: palette.text }]}>Soporte comercial</Text>
            <Text style={[styles.sessionMeta, { color: palette.muted }]}>Pagos, facturación, contrato y activación. Envía un correo a soporte@manecomb.com</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenOperationalSupport}
          style={[styles.supportItem, { backgroundColor: palette.surface, borderColor: palette.line }]}>
          <MaterialCommunityIcons name="bus-alert" size={22} color={palette.warning} />
          <View style={styles.supportCopy}>
            <Text style={[styles.sessionTitle, { color: palette.text }]}>Soporte operativo</Text>
            <Text style={[styles.sessionMeta, { color: palette.muted }]}>Incidencias de rutas, radio y monitoreo se atienden desde el panel operativo.</Text>
          </View>
        </Pressable>
      </View>
    </PortalSectionCard>
  );
}
