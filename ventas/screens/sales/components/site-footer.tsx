import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { BrandLogo } from '@/src/components/brand-logo';
import { SUPPORT_EMAIL, SUPPORT_PHONE, SYSTEM_STATUS_URL, footerColumns, neonPalette } from '../constants';
import { styles } from '../styles';
import { openExternalUrl } from '../utils';
import type { IconName } from '../types';
import { AppDownloadSection } from './app-download-section';

function ContactRow({ icon, onPress, text }: { icon: IconName; onPress?: () => void; text: string }) {
  const content = (
    <>
      <MaterialCommunityIcons name={icon} size={15} color={neonPalette.accent} />
      <Text style={styles.contactText}>{text}</Text>
    </>
  );

  return onPress ? (
    <Pressable onPress={onPress} style={styles.contactRow}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.contactRow}>{content}</View>
  );
}

export function SiteFooter({ onNavigate }: { onNavigate: (target: string) => void }) {
  const handleFooterLink = (label: string) => {
    if (label === 'Planes') {
      onNavigate('planes');
      return;
    }
    if (label === 'Funciones' || label === 'Demo') {
      onNavigate('funcionalidades');
      return;
    }
    if (label === 'App móvil') {
      onNavigate('descargar');
      return;
    }
    if (label === 'Nosotros' || label.startsWith('Casos de')) {
      onNavigate('confianza');
      return;
    }
    if (label === 'Contacto' || label === 'Centro de ayuda') {
      openExternalUrl(`mailto:${SUPPORT_EMAIL}?subject=Soporte%20ManeComb`);
      return;
    }
    if (label.startsWith('Documentaci')) {
      openExternalUrl(`mailto:${SUPPORT_EMAIL}?subject=Documentacion%20ManeComb`);
      return;
    }
    if (label === 'Estado del sistema') {
      openExternalUrl(SYSTEM_STATUS_URL);
      return;
    }
    if (label === 'Cookies') {
      router.push('/privacidad' as never);
      return;
    }
    if (label === 'Privacidad') {
      router.push('/privacidad' as never);
      return;
    }
    if (label === 'Términos') {
      router.push('/terminos' as never);
      return;
    }
  };

  return (
    <>
      <View
        style={{
          alignSelf: 'center',
          marginBottom: 78,
          maxWidth: 1240,
          paddingHorizontal: 22,
          width: '100%',
        }}>
        <AppDownloadSection onPortalPress={() => router.push('/portal' as never)} />
      </View>

      <View style={styles.footer}>
        <View style={styles.footerInner}>
          <View style={styles.footerBrand}>
            <BrandLogo size="sm" plain />
            <Text style={styles.footerDescription}>
              Plataforma integral para el control y operación de flotillas de transporte tipo combi.
            </Text>
          </View>

          <View style={styles.footerColumns}>
            {footerColumns.map((column) => (
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
            <ContactRow icon="email-outline" text={SUPPORT_EMAIL} onPress={() => openExternalUrl(`mailto:${SUPPORT_EMAIL}`)} />
            <ContactRow icon="phone-outline" text="(81) 8123 45678" onPress={() => openExternalUrl(`tel:${SUPPORT_PHONE}`)} />
            <ContactRow icon="map-marker-outline" text="Monterrey, NL, México" />
          </View>
        </View>

        <View style={styles.footerBottom}>
          <Text style={styles.footerBottomText}>© 2026 ManeComb. Todos los derechos reservados.</Text>
          <Text style={styles.footerBottomText}>Hecho con control operativo para el transporte.</Text>
        </View>
      </View>
    </>
  );
}
