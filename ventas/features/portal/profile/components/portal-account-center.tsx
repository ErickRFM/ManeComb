import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import type { PortalSubscription, User } from '@/src/types/app';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { PortalSectionCard } from '../../cards/portal-section-card';
import { portalPalette } from '../../portal-theme';

type AccountLink = {
  description: string;
  href: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
};

const accountLinks: AccountLink[] = [
  { label: 'Seguridad y sesiones', description: 'Contraseña y dispositivos con sesión activa.', href: '/portal/perfil?section=seguridad', icon: 'shield-lock-outline' },
  { label: 'Mi plan', description: 'Capacidad, vigencia y cambios de suscripción.', href: '/portal/plan', icon: 'clipboard-list-outline' },
  { label: 'Pagos', description: 'Método, transferencias y estado de pago.', href: '/portal/pagos', icon: 'credit-card-outline' },
  { label: 'Facturación', description: 'Comprobantes e historial facturable.', href: '/portal/facturacion', icon: 'file-document-outline' },
  { label: 'Soporte', description: 'Ayuda comercial y orientación operativa.', href: '/portal/perfil?section=soporte', icon: 'lifebuoy' },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'MC';
}

function accountStatus(user: User) {
  if (user.userStatus === 'suspended') return { label: 'Suspendida', tone: 'danger' as const };
  if (user.userStatus === 'pending') return { label: 'Pendiente', tone: 'warning' as const };
  return { label: 'Activa', tone: 'positive' as const };
}

export function PortalAccountCenter({ subscription, user }: { subscription: PortalSubscription | null; user: User }) {
  const status = accountStatus(user);
  const company = user.companyProfile?.companyName || user.companyProfile?.legalName || 'Empresa sin nombre registrado';

  return (
    <PortalSectionCard title="Centro de cuenta" subtitle="Tu identidad, empresa y accesos importantes en un solo lugar.">
      <View style={styles.identity}>
        <View accessibilityLabel={`Iniciales de ${user.name}`} style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(user.name)}</Text>
        </View>
        <View style={styles.identityCopy}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{user.name}</Text>
            <StatusBadge label={status.label} tone={status.tone} />
          </View>
          <Text style={styles.email}>{user.email}</Text>
          <Text style={styles.meta}>{company} · {user.role}</Text>
        </View>
        <View style={styles.planSummary}>
          <Text style={styles.planLabel}>PLAN ACTUAL</Text>
          <Text style={styles.planName}>{subscription?.planName || 'Sin plan activo'}</Text>
          <Text style={styles.planMeta}>
            {subscription ? `${subscription.activeUnits} de ${subscription.totalUnits || subscription.unitsLimit || 0} unidades activas` : 'Revisa el estado de la suscripción'}
          </Text>
        </View>
      </View>

      <View style={styles.linkGrid}>
        {accountLinks.map((item) => (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${item.label}. ${item.description}`}
            key={item.href}
            onPress={() => router.push(item.href as never)}
            style={({ hovered, pressed }: any) => [
              styles.linkCard,
              hovered ? styles.linkCardHover : undefined,
              pressed ? styles.linkCardPressed : undefined,
            ]}>
            <View style={styles.linkIcon}>
              <MaterialCommunityIcons name={item.icon} size={19} color={portalPalette.accent} />
            </View>
            <View style={styles.linkCopy}>
              <Text style={styles.linkTitle}>{item.label}</Text>
              <Text style={styles.linkDescription}>{item.description}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={portalPalette.mutedSoft} />
          </Pressable>
        ))}
      </View>
    </PortalSectionCard>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 14, minWidth: 0 },
  avatar: { alignItems: 'center', backgroundColor: portalPalette.accentSoft, borderColor: portalPalette.accent, borderRadius: 24, borderWidth: 1, height: 48, justifyContent: 'center', width: 48 },
  avatarText: { color: portalPalette.text, fontFamily: Typography.display, fontSize: 16, fontWeight: '900' },
  identityCopy: { flex: 2, flexBasis: 230, gap: 3, minWidth: 0 },
  nameRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, minWidth: 0 },
  name: { color: portalPalette.text, flexShrink: 1, fontFamily: Typography.display, fontSize: 20, fontWeight: '900' },
  email: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 13 },
  meta: { color: portalPalette.mutedSoft, fontFamily: Typography.body, fontSize: 12, textTransform: 'capitalize' },
  planSummary: { backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: AppTheme.radius.sm, borderWidth: 1, flex: 1, flexBasis: 190, gap: 2, minWidth: 0, padding: 12 },
  planLabel: { color: portalPalette.mutedSoft, fontFamily: Typography.mono, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  planName: { color: portalPalette.text, fontFamily: Typography.display, fontSize: 16, fontWeight: '900' },
  planMeta: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 11, lineHeight: 16 },
  linkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, minWidth: 0 },
  linkCard: { alignItems: 'center', backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: AppTheme.radius.sm, borderWidth: 1, flex: 1, flexBasis: 260, flexDirection: 'row', gap: 10, minHeight: 72, minWidth: 0, padding: 11 },
  linkCardHover: { borderColor: portalPalette.lineStrong, transform: [{ translateY: -1 }] },
  linkCardPressed: { opacity: 0.78, transform: [{ translateY: 0 }] },
  linkIcon: { alignItems: 'center', backgroundColor: portalPalette.accentSoft, borderRadius: AppTheme.radius.xs, height: 34, justifyContent: 'center', width: 34 },
  linkCopy: { flex: 1, gap: 2, minWidth: 0 },
  linkTitle: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 13, fontWeight: '900' },
  linkDescription: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 11, lineHeight: 16 },
});
