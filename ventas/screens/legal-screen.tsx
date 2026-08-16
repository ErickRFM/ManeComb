import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from '@/src/native/status-bar';
import { router } from '@/src/navigation/router';
import { BrandLogo } from '@/src/components/brand-logo';
import { Typography } from '@/constants/theme';

const SUPPORT_EMAIL = 'ventas@manecomb.com';
const LAST_UPDATED = '15 de agosto de 2026';

type LegalKind = 'terms' | 'privacy';

type LegalSection = {
  title: string;
  paragraphs: string[];
};

const TERMS: LegalSection[] = [
  {
    title: '1. Alcance del servicio',
    paragraphs: [
      'ManeComb es una plataforma de software para administración de flotillas y operación de transporte. Puede incluir portal web, aplicación móvil, gestión de unidades y usuarios, rutas, ubicación, jornadas, comunicación, documentos, incidencias, suscripción y funciones relacionadas con la operación.',
      'Las funciones disponibles dependen del plan contratado, permisos de la cuenta, configuración de la empresa, versión de la aplicación y disponibilidad de integraciones externas necesarias para determinadas capacidades.'
    ]
  },
  {
    title: '2. Cuenta, organización y permisos',
    paragraphs: [
      'La persona que crea una cuenta empresarial debe proporcionar información correcta y mantener sus credenciales protegidas. Las cuentas de conductores, supervisores y demás integrantes de una organización se encuentran vinculadas a los permisos y a la organización que las autoriza.',
      'No se deben compartir credenciales personales ni intentar acceder a organizaciones, información, unidades o funciones para las que no se tenga autorización.'
    ]
  },
  {
    title: '3. Planes, cobros y cancelación',
    paragraphs: [
      'Los precios, capacidad de unidades, módulos incluidos, periodos de prueba y medios de pago vigentes se muestran antes de confirmar una contratación. El backend de ManeComb es la autoridad del estado de la orden, suscripción, capacidad y pago.',
      'Una transferencia o referencia de pago no activa por sí sola el servicio cuando requiere validación. Los cambios de plan están sujetos a la capacidad real utilizada por la empresa; no se permite reducir la capacidad por debajo de las unidades registradas que siguen ocupando un cupo.',
      'Cuando una cancelación sea confirmada, el portal mostrará su estado y fecha efectiva. Los comprobantes disponibles se conservan en el apartado de facturación según corresponda.'
    ]
  },
  {
    title: '4. Operación, GPS y conectividad',
    paragraphs: [
      'Las funciones de ubicación, rutas, comunicación y sincronización dependen de permisos del dispositivo, conectividad, servicios de terceros y condiciones físicas del equipo. ManeComb diferencia estados vigentes, retrasados o sin señal cuando cuenta con la información necesaria para hacerlo.',
      'La empresa usuaria es responsable de informar a su personal sobre el uso operativo de dispositivos, ubicación y comunicaciones dentro de su organización, así como de configurar los accesos de acuerdo con sus políticas internas y obligaciones aplicables.'
    ]
  },
  {
    title: '5. Uso aceptable',
    paragraphs: [
      'No está permitido usar ManeComb para acceder a datos de terceros sin autorización, evadir controles de seguridad, interferir con el servicio, automatizar abuso de endpoints, distribuir malware, suplantar identidades o realizar actividades ilícitas.',
      'ManeComb puede limitar temporalmente solicitudes o accesos cuando sea necesario para proteger la integridad de cuentas, pagos, activaciones o infraestructura.'
    ]
  },
  {
    title: '6. Información y evidencia operativa',
    paragraphs: [
      'La plataforma puede conservar registros necesarios para continuidad de la operación, auditoría, jornadas, documentos, incidencias, activaciones, seguridad y facturación. Las acciones destructivas pueden convertirse en baja o retiro cuando exista historial que deba preservarse para mantener integridad referencial.',
      'La eliminación o baja de una persona o unidad no implica necesariamente borrar evidencia histórica que forme parte de jornadas, auditorías, comprobantes o registros relacionados.'
    ]
  },
  {
    title: '7. Propiedad y licencia de uso',
    paragraphs: [
      'ManeComb, su interfaz, software, marca y componentes propios se proporcionan como servicio. La contratación concede acceso de uso conforme al plan y permisos aplicables; no transfiere la propiedad del software ni autoriza su reproducción, reventa o ingeniería inversa fuera de lo permitido por la ley.'
    ]
  },
  {
    title: '8. Disponibilidad, soporte y cambios',
    paragraphs: [
      'El servicio puede requerir mantenimiento, actualizaciones o cambios de configuración. Cuando una función dependa de un proveedor externo, su disponibilidad también puede verse afectada por ese proveedor. ManeComb procura mostrar estados de error y recuperación sin presentar datos simulados como si fueran información productiva.',
      `Para soporte comercial o dudas sobre estas condiciones puedes escribir a ${SUPPORT_EMAIL}. Las modificaciones relevantes a estas condiciones se publicarán en esta misma sección con una nueva fecha de actualización.`
    ]
  }
];

const PRIVACY: LegalSection[] = [
  {
    title: '1. Responsable y contacto',
    paragraphs: [
      `ManeComb es responsable del tratamiento realizado directamente por la plataforma respecto de cuentas comerciales y del servicio. Para solicitudes relacionadas con privacidad puedes utilizar ${SUPPORT_EMAIL}. Los datos fiscales y domicilio legal del responsable aplicable a una contratación se incorporan en la documentación contractual y fiscal de la cuenta.`,
      'Cuando una empresa usuaria incorpora datos de sus propios conductores, supervisores o personal para gestionar su operación, esa empresa también puede tener responsabilidades propias sobre la información que decide registrar y utilizar.'
    ]
  },
  {
    title: '2. Datos que puede tratar ManeComb',
    paragraphs: [
      'Según las funciones utilizadas, pueden tratarse datos de identificación y contacto, información de la empresa, roles y permisos, información de unidades, documentos cargados, datos de suscripción y facturación, sesiones de acceso, incidencias, registros de auditoría y datos técnicos del dispositivo.',
      'Cuando las funciones operativas están habilitadas también pueden tratarse ubicación y telemetría de unidades, rutas, jornadas, eventos de GPS, asignaciones, comunicaciones operativas y evidencia necesaria para prestar las funciones solicitadas.'
    ]
  },
  {
    title: '3. Finalidades',
    paragraphs: [
      'La información se utiliza para crear y administrar cuentas, autenticar usuarios, aplicar permisos, prestar el servicio contratado, vincular unidades y conductores, mostrar ubicación y rutas, mantener continuidad y seguridad, procesar órdenes y suscripciones, generar comprobantes, atender soporte y conservar trazabilidad de acciones relevantes.',
      'Los datos técnicos y de uso también pueden utilizarse para detectar fallos, abuso, problemas de rendimiento y mejorar la experiencia del producto. Las métricas comerciales implementadas por ManeComb evitan enviar contraseñas, números completos de tarjeta, CVV o contenido sensible como metadatos de conversión.'
    ]
  },
  {
    title: '4. Pagos y datos financieros',
    paragraphs: [
      'Cuando un pago se procesa mediante un proveedor externo, ManeComb puede recibir identificadores, referencias y estados necesarios para conciliar la operación. Las credenciales completas de pago que deban ser procesadas por un proveedor no deben almacenarse como texto libre dentro del portal.',
      'En experiencias de prueba o demostración, la interfaz debe indicar expresamente cuando no existe un cargo real.'
    ]
  },
  {
    title: '5. Proveedores y transferencias necesarias',
    paragraphs: [
      'Para prestar determinadas funciones pueden intervenir proveedores de infraestructura, mapas, correo, almacenamiento, comunicaciones, notificaciones o pagos. Solo se comparte la información necesaria para la función correspondiente y de acuerdo con la configuración del servicio.',
      'ManeComb no publica información de una organización para que otras organizaciones puedan consultarla. Los controles de tenant y permisos forman parte de la separación lógica entre cuentas empresariales.'
    ]
  },
  {
    title: '6. Conservación y seguridad',
    paragraphs: [
      'Los periodos de conservación dependen de la naturaleza del dato, continuidad operativa, seguridad, historial de jornadas, facturación, obligaciones contractuales y necesidad de resolver incidencias. Cuando corresponde, una baja puede conservar referencias históricas sin mantener a la persona o unidad como activa.',
      'ManeComb aplica controles técnicos y administrativos orientados a restringir acceso por organización, rol y sesión. Ningún sistema conectado a Internet puede prometer riesgo cero; por ello se mantienen mecanismos de sesión, permisos, auditoría y tratamiento de errores para reducir exposición innecesaria.'
    ]
  },
  {
    title: '7. Derechos y solicitudes',
    paragraphs: [
      `Puedes solicitar información sobre tus datos y, cuando corresponda, acceso, rectificación, cancelación u oposición mediante ${SUPPORT_EMAIL}. La solicitud debe permitir identificar la cuenta y el dato relacionado sin enviar contraseñas, códigos de autenticación ni datos completos de tarjetas.`,
      'Algunas solicitudes pueden requerir conservar información limitada cuando exista una obligación contractual, fiscal, de seguridad o de integridad histórica que impida su eliminación inmediata.'
    ]
  },
  {
    title: '8. Cambios al aviso',
    paragraphs: [
      'Los cambios a este aviso se publicarán en esta misma ruta. Cuando una modificación altere de forma material el tratamiento asociado al servicio, ManeComb podrá comunicarla también dentro del portal o por los canales de contacto de la cuenta.'
    ]
  }
];

export function LegalScreen({ kind }: { kind: LegalKind }) {
  const isPrivacy = kind === 'privacy';
  const sections = isPrivacy ? PRIVACY : TERMS;
  const title = isPrivacy ? 'Aviso de privacidad' : 'Términos de servicio';
  const intro = isPrivacy
    ? 'Cómo ManeComb trata la información necesaria para prestar el portal, la app y las funciones operativas.'
    : 'Condiciones generales para utilizar ManeComb, contratar un plan y operar una cuenta empresarial.';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Pressable accessibilityRole="link" onPress={() => router.push('/ventas' as never)}>
            <BrandLogo size="sm" plain />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/ventas' as never)} style={styles.backButton}>
            <Text style={styles.backText}>Volver a Ventas</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>MARCO DE USO DE MANECOMB</Text>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.intro}>{intro}</Text>
          <Text style={styles.updated}>Última actualización: {LAST_UPDATED}</Text>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Documento operativo del producto</Text>
          <Text style={styles.noticeText}>
            Esta página describe el funcionamiento y tratamiento general del servicio. Los datos fiscales, domicilio legal y condiciones particulares de una contratación se complementan con la documentación de la cuenta y deben revisarse antes de una publicación comercial definitiva.
          </Text>
        </View>

        <View style={styles.sections}>
          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.paragraphs.map((paragraph) => (
                <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>Contacto</Text>
          <Text selectable style={styles.footerText}>{SUPPORT_EMAIL}</Text>
          <Text style={styles.footerText}>ManeComb · México</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#050816',
    flex: 1,
    minHeight: '100vh' as any,
  },
  scrollContent: {
    alignSelf: 'center',
    gap: 28,
    maxWidth: 920,
    paddingBottom: 64,
    paddingHorizontal: 20,
    paddingTop: 20,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backButton: {
    alignItems: 'center',
    borderColor: 'rgba(245,247,255,0.16)',
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  backText: {
    color: '#F5F7FF',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  hero: {
    gap: 10,
    paddingTop: 28,
  },
  eyebrow: {
    color: '#FF4D7D',
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    color: '#F5F7FF',
    fontFamily: Typography.display,
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 46,
  },
  intro: {
    color: '#B7BED8',
    fontFamily: Typography.body,
    fontSize: 16,
    lineHeight: 25,
    maxWidth: 720,
  },
  updated: {
    color: '#8A93B2',
    fontFamily: Typography.body,
    fontSize: 12,
  },
  notice: {
    backgroundColor: 'rgba(0,194,255,0.07)',
    borderColor: 'rgba(0,194,255,0.22)',
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  noticeTitle: {
    color: '#F5F7FF',
    fontFamily: Typography.display,
    fontSize: 14,
    fontWeight: '900',
  },
  noticeText: {
    color: '#B7BED8',
    fontFamily: Typography.body,
    fontSize: 12.5,
    lineHeight: 20,
  },
  sections: {
    gap: 16,
  },
  section: {
    backgroundColor: 'rgba(9,15,34,0.82)',
    borderColor: 'rgba(245,247,255,0.1)',
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 20,
  },
  sectionTitle: {
    color: '#F5F7FF',
    fontFamily: Typography.display,
    fontSize: 18,
    fontWeight: '900',
  },
  paragraph: {
    color: '#B7BED8',
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 23,
  },
  footerCard: {
    borderColor: 'rgba(245,247,255,0.1)',
    borderRadius: 14,
    borderWidth: 1,
    gap: 5,
    padding: 18,
  },
  footerTitle: {
    color: '#F5F7FF',
    fontFamily: Typography.display,
    fontSize: 15,
    fontWeight: '900',
  },
  footerText: {
    color: '#8A93B2',
    fontFamily: Typography.body,
    fontSize: 12.5,
  },
});