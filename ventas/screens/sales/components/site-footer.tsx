import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { BrandLogo } from '@/src/components/brand-logo';
import { neonPalette } from '../constants';
import { useCommercialProfile } from '@/features/commercial';
import { styles } from '../styles';
import { openExternalUrl } from '../utils';
import type { IconName } from '../types';

const publicFooterColumns = [
  { title: 'Producto', links: ['Funciones', 'App móvil', 'Planes'] },
  { title: 'Empresa', links: ['Confianza', 'Contacto'] },
  { title: 'Soporte', links: ['Soporte comercial'] },
  { title: 'Legal', links: ['Privacidad', 'Términos'] },
] as const;

function ContactRow({ icon, onPress, text }: { icon: IconName; onPress?: () => void; text: string }) {
  const content = (
    <>
      <MaterialCommunityIcons name={icon} size={15} color={neonPalette.accent} />
      <Text style={styles.contactText}>{text}</Text>
    </>
  );

  return onPress ? (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.contactRow}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.contactRow}>{content}</View>
  );
}

function formatSupportPhone(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('52')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return raw;
}

export function SiteFooter({ onNavigate }: { onNavigate: (target: string) => void }) {
  const { profile } = useCommercialProfile();
  const supportEmail = profile?.supportEmail || '';
  const supportPhone = profile?.supportPhone || '';

  const handleFooterLink = (label: string) => {
    if (label === 'Planes') {
      onNavigate('planes');
      return;
    }
    if (label === 'Funciones') {
      onNavigate('funcionalidades');
      return;
    }
    if (label === 'App móvil') {
      onNavigate('descargar');
      return;
    }
    if (label === 'Confianza') {
      onNavigate('confianza');
      return;
    }
    if (label === 'Contacto' || label === 'Soporte comercial') {
      if (supportEmail) openExternalUrl(`mailto:${supportEmail}?subject=Soporte%20ManeComb`);
      return;
    }
    if (label === 'Privacidad') {
      router.push('/privacidad' as never);
      return;
    }
    if (label === 'Términos') {
      router.push('/terminos' as never);
    }
  };

  return (
    <View style={styles.footer}>
      <View style={styles.footerInner}>
        <View style={styles.footerBrand}>
          <BrandLogo size="sm" plain />
          <Text style={styles.footerDescription}>
            Portal administrativo y app operativa para controlar unidades, rutas, equipo, comunicación y evidencia desde una sola plataforma.
          </Text>
        </View>

        <View style={styles.footerColumns}>
          {publicFooterColumns.map((column) => (
            <View key={column.title} style={styles.footerColumn}>
              <Text style={styles.footerColumnTitle}>{column.title}</Text>
              {column.links.map((link) => (
                <Pressable
                  key={link}
                  accessibilityRole="link"
                  onPress={() => handleFooterLink(link)}
                  style={styles.footerLinkButton}>
                  <Text style={styles.footerLink}>{link}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>¿Hablamos?</Text>
          {supportEmail ? (
            <ContactRow icon="email-outline" text={supportEmail} onPress={() => openExternalUrl(`mailto:${supportEmail}`)} />
          ) : null}
          {supportPhone ? (
            <ContactRow icon="phone-outline" text={formatSupportPhone(supportPhone)} onPress={() => openExternalUrl(`tel:${supportPhone}`)} />
          ) : null}
          <ContactRow icon="office-building-outline" text={profile?.legalName || 'ManeComb'} />
        </View>
      </View>

      <View style={styles.footerBottom}>
        <Text style={styles.footerBottomText}>© 2026 ManeComb. Todos los derechos reservados.</Text>
        <Text style={styles.footerBottomText}>Una sola operación. Una sola fuente de información.</Text>
      </View>
    </View>
  );
}