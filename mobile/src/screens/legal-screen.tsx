import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { getAuthPalette } from '@/src/utils/auth-palette';

type LegalSection = {
  title: string;
  body: string;
};

type LegalScreenProps = {
  kind: 'privacy' | 'terms';
};

const contentByKind: Record<LegalScreenProps['kind'], { eyebrow: string; title: string; sections: LegalSection[] }> =
  {
    privacy: {
      eyebrow: 'Politica de privacidad',
      title: 'Como protegemos la informacion operativa',
      sections: [
        {
          title: 'Datos que usamos',
          body:
            'La aplicacion puede almacenar nombre, correo, telefono, rol, documentos, ubicacion operativa y actividad dentro del sistema para coordinar rutas, incidencias y administracion interna.',
        },
        {
          title: 'Uso de la informacion',
          body:
            'Los datos se utilizan para autenticar accesos, asignar unidades, mostrar mapa en tiempo real, gestionar expedientes y mantener comunicacion entre administracion, supervision y choferes.',
        },
        {
          title: 'Resguardo y acceso',
          body:
            'Solo personal autorizado debe acceder a la informacion. El administrador puede revisar, editar o desactivar cuentas cuando exista una necesidad operativa o de seguridad.',
        },
        {
          title: 'Conservacion',
          body:
            'La informacion se conserva mientras exista relacion operativa con la flotilla o por el tiempo necesario para cumplir obligaciones administrativas, legales y de seguridad.',
        },
      ],
    },
    terms: {
      eyebrow: 'Terminos y condiciones',
      title: 'Reglas de uso para la plataforma ManeComb',
      sections: [
        {
          title: 'Uso autorizado',
          body:
            'La aplicacion es para administracion y seguimiento de la operacion. Cada usuario debe utilizar su cuenta de forma personal, responsable y alineada con su rol dentro del servicio.',
        },
        {
          title: 'Credenciales',
          body:
            'El usuario es responsable del resguardo de su correo y contrasena. No debe compartir accesos ni permitir que terceros consulten informacion sensible del sistema.',
        },
        {
          title: 'Disponibilidad',
          body:
            'La plataforma depende de conectividad, mantenimiento y validaciones de seguridad. Algunas funciones pueden ajustarse temporalmente mientras se restablece la operacion o se aplica soporte tecnico.',
        },
        {
          title: 'Administracion de cuentas',
          body:
            'El administrador puede crear, actualizar, reasignar o eliminar usuarios cuando sea necesario para la continuidad operativa, la seguridad de la informacion o la correcta asignacion de recursos.',
        },
      ],
    },
  };

export function LegalScreen({ kind }: LegalScreenProps) {
  const { themeMode } = useAppTheme();
  const palette = getAuthPalette(themeMode);
  const content = contentByKind[kind];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
      <StatusBar style={palette.statusBar} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: palette.panel, shadowColor: palette.shadow }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={palette.text} />
            <Text style={[styles.backText, { color: palette.text }]}>Volver</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>{content.eyebrow}</Text>
            <Text style={[styles.title, { color: palette.text }]}>{content.title}</Text>
            <Text style={[styles.updatedAt, { color: palette.muted }]}>Ultima actualizacion: 12/04/2026</Text>
          </View>

          <View style={styles.sections}>
            {content.sections.map((section) => (
              <View
                key={section.title}
                style={[
                  styles.sectionCard,
                  {
                    backgroundColor: palette.panelSoft,
                    borderColor: palette.mode === 'light' ? '#E3DBD1' : palette.border,
                  },
                ]}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>{section.title}</Text>
                <Text style={[styles.sectionBody, { color: palette.muted }]}>{section.body}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  card: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    borderRadius: 30,
    padding: 22,
    gap: 22,
    shadowOpacity: 1,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 6,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  backText: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '700',
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    fontFamily: Typography.display,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
  },
  updatedAt: {
    fontFamily: Typography.body,
    fontSize: 13,
  },
  sections: {
    gap: 14,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 8,
  },
  sectionTitle: {
    fontFamily: Typography.body,
    fontSize: 17,
    fontWeight: '800',
  },
  sectionBody: {
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 22,
  },
});
