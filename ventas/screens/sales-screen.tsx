import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Typography } from '@/constants/theme';
import { getCommercialPlansRequest } from '@/src/api/client';
import { BrandLogo } from '@/src/components/brand-logo';
import { COMMERCIAL_FAQS, FALLBACK_COMMERCIAL_PLANS } from '@/src/constants/commercial';
import { useAppStore } from '@/src/store/use-app-store';
import type { CommercialPlan } from '@/src/types/app';
import { buildCheckoutParams, saveCheckoutContext } from '@/src/utils/checkout-context';
import { getAuthenticatedHome, isCustomerAccount } from '@/src/utils/account-routing';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const SUPPORT_EMAIL = 'ventas@manecomb.com';
const SUPPORT_PHONE = '81812345678';
const SYSTEM_STATUS_URL = 'https://manecomb.onrender.com/api/health';

const accentByTone = {
  info: '#00C2FF',
  success: '#FF2D7A',
  warning: '#FF8A3D',
  danger: '#FF2D7A',
} as const;

const neonPalette = {
  background: '#050816',
  backgroundAlt: '#070B1D',
  panel: 'rgba(9, 15, 34, 0.78)',
  panelStrong: 'rgba(10, 17, 39, 0.92)',
  panelSoft: 'rgba(255, 255, 255, 0.055)',
  line: 'rgba(245, 247, 255, 0.12)',
  lineStrong: 'rgba(245, 247, 255, 0.22)',
  text: '#F5F7FF',
  muted: '#8A93B2',
  mutedStrong: '#B7BED8',
  accent: '#FF2D7A',
  accentSoft: 'rgba(255, 45, 122, 0.13)',
  accentGlow: 'rgba(255, 45, 122, 0.5)',
  violet: '#7A3CFF',
  violetSoft: 'rgba(122, 60, 255, 0.16)',
  cyan: '#00C2FF',
  cyanSoft: 'rgba(0, 194, 255, 0.14)',
  mint: '#2FFFD5',
  mintSoft: 'rgba(47, 255, 213, 0.12)',
  amber: '#FF8A3D',
} as const;

const planVisualTones = [
  {
    edge: '#00C2FF',
    secondary: '#2FFFD5',
    violet: '#7A3CFF',
    soft: 'rgba(0, 194, 255, 0.16)',
    secondarySoft: 'rgba(47, 255, 213, 0.11)',
    violetSoft: 'rgba(122, 60, 255, 0.13)',
    cursor: 'rgba(0, 194, 255, 0.34)',
  },
  {
    edge: '#FF2D7A',
    secondary: '#00C2FF',
    violet: '#7A3CFF',
    soft: 'rgba(255, 45, 122, 0.15)',
    secondarySoft: 'rgba(0, 194, 255, 0.11)',
    violetSoft: 'rgba(122, 60, 255, 0.13)',
    cursor: 'rgba(255, 45, 122, 0.34)',
  },
  {
    edge: '#FF8A3D',
    secondary: '#FF2D7A',
    violet: '#7A3CFF',
    soft: 'rgba(255, 138, 61, 0.14)',
    secondarySoft: 'rgba(255, 45, 122, 0.11)',
    violetSoft: 'rgba(122, 60, 255, 0.12)',
    cursor: 'rgba(255, 138, 61, 0.32)',
  },
  {
    edge: '#FF2D7A',
    secondary: '#2FFFD5',
    violet: '#7A3CFF',
    soft: 'rgba(255, 45, 122, 0.15)',
    secondarySoft: 'rgba(47, 255, 213, 0.1)',
    violetSoft: 'rgba(122, 60, 255, 0.13)',
    cursor: 'rgba(255, 45, 122, 0.34)',
  },
  {
    edge: '#7A3CFF',
    secondary: '#00C2FF',
    violet: '#FF2D7A',
    soft: 'rgba(122, 60, 255, 0.16)',
    secondarySoft: 'rgba(0, 194, 255, 0.1)',
    violetSoft: 'rgba(255, 45, 122, 0.11)',
    cursor: 'rgba(122, 60, 255, 0.32)',
  },
] as const;

const navItems = [
  { label: 'Inicio', target: 'inicio' },
  { label: 'Funcionalidades', target: 'funcionalidades' },
  { label: 'Planes', target: 'planes' },
  { label: 'Casos de éxito', target: 'confianza' },
  { label: 'FAQ', target: 'faq' },
] as const;

const benefits: Array<{
  title: string;
  body: string;
  icon: IconName;
  color: string;
}> = [
  {
    title: 'Monitoreo en tiempo real',
    body: 'Ubica cada unidad en mapa vivo, con estado de ruta, velocidad y actividad operativa.',
    icon: 'map-marker-path',
    color: neonPalette.cyan,
  },
  {
    title: 'Comunicación instantánea',
    body: 'Coordina conductores, supervisores y despacho desde una misma plataforma.',
    icon: 'message-processing-outline',
    color: neonPalette.mint,
  },
  {
    title: 'Alertas y notificaciones',
    body: 'Recibe avisos críticos sobre eventos, vencimientos, incidencias y operación diaria.',
    icon: 'bell-ring-outline',
    color: neonPalette.accent,
  },
  {
    title: 'Gestión documental',
    body: 'Centraliza licencias, seguros, verificaciones y documentos de cada unidad.',
    icon: 'file-document-check-outline',
    color: neonPalette.mint,
  },
  {
    title: 'Historial de viajes',
    body: 'Consulta rutas, paradas y recorridos anteriores para auditar la operación.',
    icon: 'history',
    color: neonPalette.violet,
  },
  {
    title: 'Analítica operativa',
    body: 'Detecta patrones, mide disponibilidad y toma mejores decisiones de flotilla.',
    icon: 'chart-line-variant',
    color: neonPalette.accent,
  },
];

const processSteps: Array<{
  title: string;
  body: string;
  icon: IconName;
}> = [
  {
    title: 'Selecciona tu plan.',
    body: 'Elige el paquete que coincide con el tamaño de tu flotilla.',
    icon: 'credit-card-outline',
  },
  {
    title: 'Crea tu cuenta.',
    body: 'Registra tu empresa y deja listo el acceso administrativo.',
    icon: 'account-plus-outline',
  },
  {
    title: 'Activa tus unidades.',
    body: 'Agrega combis, conductores y permisos desde el portal.',
    icon: 'bus-multiple',
  },
  {
    title: 'Accede a tu panel.',
    body: 'Monitorea GPS, alertas, documentos y comunicación.',
    icon: 'monitor-dashboard',
  },
];

const trustMetrics: Array<{
  value: string;
  label: string;
  icon: IconName;
  color: string;
}> = [
  {
    value: '99.8%',
    label: 'Disponibilidad',
    icon: 'shield-check-outline',
    color: neonPalette.cyan,
  },
  {
    value: '< 5 min',
    label: 'Implementación',
    icon: 'timer-outline',
    color: neonPalette.violet,
  },
  {
    value: '24/7',
    label: 'Soporte',
    icon: 'headset',
    color: neonPalette.accent,
  },
  {
    value: 'Datos',
    label: 'Seguridad',
    icon: 'lock-check-outline',
    color: neonPalette.mint,
  },
];

const footerColumns = [
  { title: 'Producto', links: ['Funciones', 'Planes', 'Demo'] },
  { title: 'Empresa', links: ['Nosotros', 'Casos de éxito', 'Contacto'] },
  { title: 'Soporte', links: ['Centro de ayuda', 'Documentación', 'Estado del sistema'] },
  { title: 'Legal', links: ['Privacidad', 'Términos', 'Cookies'] },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}

function getPlanAccent(plan: CommercialPlan, index: number) {
  const fallback = [neonPalette.cyan, neonPalette.accent, neonPalette.amber, neonPalette.violet];
  return accentByTone[plan.accent] || fallback[index % fallback.length];
}

function getPlanVisualTone(index: number) {
  return planVisualTones[index % planVisualTones.length];
}

function buildPlanParams(plan: CommercialPlan, requestTrial = false) {
  return buildCheckoutParams(plan.id, requestTrial);
}

function webStyle(style: Record<string, unknown>) {
  return Platform.OS === 'web' ? (style as any) : undefined;
}

function getFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function openExternalUrl(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (/^https?:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    window.location.href = url;
  }
}

function getCheckoutReturnCopy(status?: string) {
  const normalized = String(status || '').trim().toLowerCase();

  if (normalized === 'success') {
    return {
      icon: 'check-circle-outline' as IconName,
      title: 'Tu pago fue aprobado',
      body: 'Estamos sincronizando tu plan. Entra al portal para revisar el estado de activacion.',
      action: 'Abrir portal',
      tone: 'success' as const,
    };
  }

  if (normalized === 'pending') {
    return {
      icon: 'clock-outline' as IconName,
      title: 'Tu pago esta pendiente',
      body: 'Mercado Pago aun no confirma el cobro. Puedes revisar el estado desde el portal.',
      action: 'Ver pagos',
      tone: 'pending' as const,
    };
  }

  if (normalized === 'failure') {
    return {
      icon: 'alert-circle-outline' as IconName,
      title: 'El pago fue rechazado',
      body: 'Intenta de nuevo o usa otro metodo de pago.',
      action: 'Reintentar pago',
      tone: 'danger' as const,
    };
  }

  return null;
}

export function SalesScreen() {
  const { width, height } = useWindowDimensions();
  const routeParams = useLocalSearchParams<{ checkout?: string | string[] }>();
  const isDesktop = width >= 1080;
  const isTablet = width >= 760;
  const isPhone = width < 640;
  const carouselRef = useRef<ScrollView>(null);
  const { user } = useAppStore(
    useShallow((state) => ({
      user: state.user,
    }))
  );
  const [plans, setPlans] = useState<CommercialPlan[]>(FALLBACK_COMMERCIAL_PLANS);
  const [activePlanIndex, setActivePlanIndex] = useState(1);
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  useEffect(() => {
    void getCommercialPlansRequest()
      .then((response) => {
        if (response.length) {
          setPlans(response);
          const bestValueIndex = Math.max(
            response.findIndex((plan) => plan.badge.toLowerCase().includes('vendido')),
            0
          );
          setActivePlanIndex(bestValueIndex);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const handleWindowScroll = () => {
      setScrollY(window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const nextX = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
      const nextY = (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
      setCursor({ x: nextX, y: nextY });
    };

    handleWindowScroll();
    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleWindowScroll);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  const cardWidth = isPhone ? Math.max(268, width - 42) : isDesktop ? 336 : 306;
  const cardStep = cardWidth + 14;
  const activePlan = plans[activePlanIndex] || plans[0];
  const headerCompact = scrollY > 36;
  const checkoutReturnStatus = getFirstParam(routeParams.checkout);

  const goToPlanCheckout = (plan: CommercialPlan, requestTrial = false) => {
    const params = buildPlanParams(plan, requestTrial);
    saveCheckoutContext(plan.id, requestTrial);

    if (user && isCustomerAccount(user)) {
      router.push({
        pathname: '/ventas/pago',
        params,
      } as never);
      return;
    }

    const target = user ? getAuthenticatedHome(user) : '/ventas/registro';
    router.push({ pathname: target, params } as never);
  };

  const PageScroller = Platform.OS === 'web' ? View : ScrollView;
  const pageScrollerProps =
    Platform.OS === 'web'
      ? {
          style: styles.webPage,
        }
      : {
          style: styles.scroll,
          contentContainerStyle: styles.content,
          showsVerticalScrollIndicator: false,
          scrollEventThrottle: 16,
          onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
            setScrollY(event.nativeEvent.contentOffset.y),
        };

  const scrollToSection = (target: string) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const section = document.getElementById(target);
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (target === 'planes') {
      carouselRef.current?.scrollTo({ x: activePlanIndex * cardStep, animated: true });
    }
  };

  const jumpToPlan = (nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(plans.length - 1, nextIndex));
    setActivePlanIndex(boundedIndex);
    carouselRef.current?.scrollTo({
      x: boundedIndex * cardStep,
      animated: true,
    });
  };

  const handlePlansScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.max(
      0,
      Math.min(plans.length - 1, Math.round(event.nativeEvent.contentOffset.x / cardStep))
    );
    setActivePlanIndex(nextIndex);
  };

  const loginLabel = user ? 'Abrir portal' : 'Iniciar sesión';
  const loginAction = () => router.push((user ? getAuthenticatedHome(user) : '/ventas/login') as never);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ImmersiveBackground cursor={cursor} isPhone={isPhone} />

      <SiteHeader
        compact={headerCompact}
        isPhone={isPhone}
        loginLabel={loginLabel}
        onBuy={() => goToPlanCheckout(activePlan)}
        onLogin={loginAction}
        onNavigate={scrollToSection}
      />

      <PageScroller {...(pageScrollerProps as any)}>
        <View style={[styles.container, isPhone ? styles.containerPhone : undefined]}>
          <CheckoutReturnBanner
            status={checkoutReturnStatus}
            onPrimaryPress={() => {
              const status = String(checkoutReturnStatus || '').toLowerCase();
              if (status === 'failure') {
                scrollToSection('planes');
                return;
              }

              router.push((status === 'pending' ? '/portal/pagos' : '/portal') as never);
            }}
          />
          <RevealView index={0} scrollY={scrollY} viewportHeight={height} immediate>
            <View
              nativeID="inicio"
              style={[
                styles.heroSection,
                isDesktop ? styles.heroDesktop : undefined,
                isPhone ? styles.heroPhone : undefined,
                webStyle({
                  backgroundImage:
                    'linear-gradient(135deg, rgba(5, 8, 22, 0.54), rgba(10, 18, 45, 0.72)), radial-gradient(circle at 18% 20%, rgba(255, 45, 122, 0.18), transparent 28%), radial-gradient(circle at 78% 18%, rgba(0, 194, 255, 0.17), transparent 34%)',
                  boxShadow:
                    '0 0 0 1px rgba(245, 247, 255, 0.08), 0 36px 120px rgba(0, 0, 0, 0.46)',
                  scrollMarginTop: 120,
                }),
              ]}>
              <View style={[styles.heroCopy, isPhone ? styles.heroCopyPhone : undefined]}>
                <View style={styles.heroKicker}>
                  <MaterialCommunityIcons name="crosshairs-gps" size={14} color={neonPalette.accent} />
                  <Text style={styles.heroKickerText}>OPERACIÓN Y POSTVENTA</Text>
                </View>
                <Text style={[styles.heroTitle, isPhone ? styles.heroTitlePhone : undefined]}>
                  Controla toda tu flotilla desde una sola plataforma.
                </Text>
                <Text style={[styles.heroSubtitle, isPhone ? styles.heroSubtitlePhone : undefined]}>
                  GPS en tiempo real, comunicación operativa, alertas y gestión documental para empresas de transporte.
                </Text>
                <View style={styles.heroActions}>
                  <ActionButton
                    label="Ver demo"
                    icon="play-circle-outline"
                    onPress={() => scrollToSection('funcionalidades')}
                  />
                  <ActionButton
                    label="Explorar planes"
                    icon="arrow-down"
                    variant="ghost"
                    onPress={() => scrollToSection('planes')}
                  />
                </View>
              </View>

              <DashboardMockup cursor={cursor} isPhone={isPhone} />
            </View>
          </RevealView>

          <RevealView
            index={1}
            scrollY={scrollY}
            viewportHeight={height}
            style={styles.section}
          >
            <SectionHeading
              nativeID="funcionalidades"
              eyebrow="CONTROL OPERATIVO EN UN SOLO LUGAR"
              title="Funciones que impulsan tu operación"
              intro="Una capa operativa para ver, coordinar, documentar y decidir con datos de tu flotilla."
              centered
            />
            <View style={[styles.benefitGrid, isPhone ? styles.benefitGridPhone : undefined]}>
              {benefits.map((benefit, index) => (
                <BenefitCard key={benefit.title} benefit={benefit} index={index} isPhone={isPhone} />
              ))}
            </View>
          </RevealView>

          <RevealView index={2} scrollY={scrollY} viewportHeight={height} style={styles.section}>
            <View nativeID="planes" style={styles.anchorOffset}>
              <View style={styles.plansHeader}>
                <View style={styles.sectionCopy}>
                  <Text style={styles.sectionEyebrow}>PLANES</Text>
                  <Text style={styles.sectionTitle}>Planes disponibles.</Text>
                </View>
                <View style={styles.carouselControls}>
                  <RoundIconButton
                    icon="chevron-left"
                    onPress={() => jumpToPlan(activePlanIndex - 1)}
                    disabled={activePlanIndex === 0}
                  />
                  <RoundIconButton
                    icon="chevron-right"
                    onPress={() => jumpToPlan(activePlanIndex + 1)}
                    disabled={activePlanIndex === plans.length - 1}
                  />
                </View>
              </View>

              <ScrollView
                ref={carouselRef}
                horizontal
                style={styles.planCarouselViewport}
                snapToInterval={cardStep}
                decelerationRate="fast"
                contentContainerStyle={styles.planCarousel}
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handlePlansScrollEnd}>
                {plans.map((plan, index) => (
                  <PlanCard
                    key={plan.id}
                    index={index}
                    plan={plan}
                    width={cardWidth}
                    active={activePlanIndex === index}
                    accent={getPlanAccent(plan, index)}
                    onPress={() => jumpToPlan(index)}
                    onBuy={() => goToPlanCheckout(plan)}
                    onTrial={plan.trialEligible ? () => goToPlanCheckout(plan, true) : undefined}
                    userLabel="Continuar compra"
                    trialLabel={`Probar demo ${plan.trialDays || 7} días`}
                  />
                ))}
              </ScrollView>

              <View style={styles.planDots}>
                {plans.map((plan, index) => (
                  <Pressable
                    key={plan.id}
                    accessibilityLabel={`Ver plan ${plan.name}`}
                    accessibilityRole="button"
                    onPress={() => jumpToPlan(index)}
                    style={[
                      styles.planDot,
                      activePlanIndex === index ? styles.planDotActive : undefined,
                      activePlanIndex === index
                        ? { backgroundColor: getPlanAccent(plan, index) }
                        : undefined,
                    ]}
                  />
                ))}
              </View>
            </View>
          </RevealView>

          <RevealView index={3} scrollY={scrollY} viewportHeight={height} style={styles.section}>
            <SectionHeading
              eyebrow="¿CÓMO FUNCIONA?"
              title="Activa tu plan en 4 pasos simples"
              intro="Del plan al panel operativo sin fricción: compra, configura y empieza a monitorear."
              centered
            />
            <View style={[styles.processRail, isPhone ? styles.processRailPhone : undefined]}>
              {processSteps.map((step, index) => (
                <ProcessStep
                  key={step.title}
                  index={index}
                  step={step}
                  isLast={index === processSteps.length - 1}
                  isPhone={isPhone}
                />
              ))}
            </View>
          </RevealView>

          <RevealView index={4} scrollY={scrollY} viewportHeight={height} style={styles.section}>
            <View
              nativeID="confianza"
              style={[
                styles.trustSection,
                webStyle({
                  backgroundImage:
                    'linear-gradient(135deg, rgba(9, 15, 34, 0.8), rgba(10, 17, 39, 0.92)), radial-gradient(circle at 15% 20%, rgba(0, 194, 255, 0.14), transparent 34%), radial-gradient(circle at 85% 55%, rgba(255, 45, 122, 0.12), transparent 35%)',
                  boxShadow: '0 0 0 1px rgba(245, 247, 255, 0.1), 0 24px 80px rgba(0,0,0,0.34)',
                  backdropFilter: 'blur(18px)',
                  scrollMarginTop: 120,
                }),
              ]}>
              <SectionHeading
                eyebrow="CONFIANZA QUE SE DEMUESTRA"
                title="Operación estable para empresas que no pueden detenerse"
                intro="La plataforma está diseñada para control operativo continuo, seguridad de datos y acompañamiento humano."
                centered
              />
              <View style={[styles.metricGrid, isPhone ? styles.metricGridPhone : undefined]}>
                {trustMetrics.map((metric) => (
                  <View key={metric.label} style={styles.metricCard}>
                    <View style={[styles.metricIcon, { borderColor: `${metric.color}55`, backgroundColor: `${metric.color}14` }]}>
                      <MaterialCommunityIcons name={metric.icon} size={25} color={metric.color} />
                    </View>
                    <Text style={[styles.metricValue, { color: metric.color }]}>{metric.value}</Text>
                    <Text style={styles.metricLabel}>{metric.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </RevealView>

          <RevealView index={5} scrollY={scrollY} viewportHeight={height} style={styles.section}>
            <View
              nativeID="faq"
              style={[
                styles.faqShell,
                isDesktop ? styles.faqShellDesktop : undefined,
                webStyle({
                  backgroundImage:
                    'linear-gradient(135deg, rgba(8, 13, 30, 0.86), rgba(10, 17, 39, 0.8)), radial-gradient(circle at 10% 45%, rgba(122, 60, 255, 0.16), transparent 31%)',
                  boxShadow: '0 0 0 1px rgba(245, 247, 255, 0.1), 0 22px 70px rgba(0, 0, 0, 0.34)',
                  backdropFilter: 'blur(18px)',
                  scrollMarginTop: 120,
                }),
              ]}>
              <View style={styles.supportVisual} pointerEvents="none">
                <View style={styles.supportCard}>
                  <MaterialCommunityIcons name="headset" size={64} color={neonPalette.cyan} />
                  <View style={styles.supportBubble}>
                    <MaterialCommunityIcons name="help" size={22} color="#FFFFFF" />
                  </View>
                </View>
              </View>
              <View style={styles.faqContent}>
                <SectionHeading
                  eyebrow="PREGUNTAS FRECUENTES"
                  title="Resolvemos tus dudas"
                  intro="Información clara antes de activar tu plan."
                />
                <View style={styles.faqList}>
                  {COMMERCIAL_FAQS.map((faq, index) => (
                    <FaqItem
                      key={faq.question}
                      answer={faq.answer}
                      open={openFaqIndex === index}
                      question={faq.question}
                      onPress={() => setOpenFaqIndex(openFaqIndex === index ? -1 : index)}
                    />
                  ))}
                </View>
              </View>
            </View>
          </RevealView>
        </View>

        <SiteFooter onNavigate={scrollToSection} />
      </PageScroller>
    </View>
  );
}

function SiteHeader({
  compact,
  isPhone,
  loginLabel,
  onBuy,
  onLogin,
  onNavigate,
}: {
  compact: boolean;
  isPhone: boolean;
  loginLabel: string;
  onBuy: () => void;
  onLogin: () => void;
  onNavigate: (target: string) => void;
}) {
  const navButtons = navItems.map((item) => (
    <Pressable
      key={item.target}
      accessibilityRole="link"
      onPress={() => onNavigate(item.target)}
      style={(state) => {
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
        return [
          styles.navItem,
          isPhone ? styles.navItemPhone : undefined,
          hovered ? styles.navItemHover : undefined,
          webStyle({
            cursor: 'pointer',
            transitionDuration: '240ms',
            transitionProperty: 'color, background-color, border-color, transform',
          }),
        ];
      }}>
      <Text style={[styles.navItemText, isPhone ? styles.navItemTextPhone : undefined]}>{item.label}</Text>
    </Pressable>
  ));

  return (
    <View
      style={[
        styles.headerShell,
        compact ? styles.headerShellCompact : undefined,
        isPhone ? styles.headerShellPhone : undefined,
        webStyle({
          backdropFilter: 'blur(22px) saturate(160%)',
          WebkitBackdropFilter: 'blur(22px) saturate(160%)',
          boxShadow: compact
            ? '0 14px 42px rgba(0, 0, 0, 0.34), 0 1px 0 rgba(245, 247, 255, 0.08)'
            : '0 1px 0 rgba(245, 247, 255, 0.08)',
        }),
      ]}>
      <View style={[styles.headerInner, isPhone ? styles.headerInnerPhone : undefined]}>
        <View style={styles.headerTopRow}>
          <BrandLogo size={isPhone ? 'sm' : 'md'} align="left" plain />
          {isPhone ? (
            <View style={styles.headerActions}>
              <ActionButton label="Entrar" icon="login" variant="ghost" compact onPress={onLogin} />
              <ActionButton label="Comprar" icon="arrow-right" compact onPress={onBuy} />
            </View>
          ) : null}
        </View>

        {isPhone ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.headerNavScroll}
            contentContainerStyle={styles.headerNavPhoneContent}>
            {navButtons}
          </ScrollView>
        ) : (
          <View style={styles.headerNav}>{navButtons}</View>
        )}

        {!isPhone ? (
          <View style={styles.headerActions}>
            <ActionButton label={loginLabel} icon="login" variant="ghost" compact onPress={onLogin} />
            <ActionButton label="Comprar ahora" icon="arrow-right" compact onPress={onBuy} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ImmersiveBackground({
  cursor,
  isPhone,
}: {
  cursor: { x: number; y: number };
  isPhone: boolean;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulse]);

  const orbScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.07],
  });

  const parallax = Platform.OS === 'web' && !isPhone
    ? [{ translateX: cursor.x * 14 }, { translateY: cursor.y * 12 }]
    : [];

  return (
    <View pointerEvents="none" style={styles.backgroundLayer}>
      <View
        style={[
          styles.animatedWash,
          webStyle({
            backgroundImage:
              'linear-gradient(125deg, rgba(5, 8, 22, 1), rgba(7, 11, 29, 0.96), rgba(21, 8, 42, 0.86), rgba(5, 8, 22, 1))',
            backgroundSize: '180% 180%',
            animation: 'manecombGradientShift 24s ease-in-out infinite',
          }),
        ]}
      />
      <Animated.View style={[styles.parallaxField, { transform: parallax }]}>
        <Animated.View
          style={[
            styles.backgroundOrb,
            styles.backgroundOrbBlue,
            { transform: [{ scale: orbScale }] },
            webStyle({ filter: 'blur(28px)', animation: 'manecombOrbDrift 26s ease-in-out infinite' }),
          ]}
        />
        <Animated.View
          style={[
            styles.backgroundOrb,
            styles.backgroundOrbPink,
            { transform: [{ scale: orbScale }] },
            webStyle({ filter: 'blur(32px)', animation: 'manecombOrbDrift 31s ease-in-out -7s infinite' }),
          ]}
        />
        <Animated.View
          style={[
            styles.backgroundOrb,
            styles.backgroundOrbViolet,
            { transform: [{ scale: orbScale }] },
            webStyle({ filter: 'blur(30px)', animation: 'manecombOrbDrift 29s ease-in-out -12s infinite' }),
          ]}
        />
      </Animated.View>
      <View style={styles.routeField}>
        {Array.from({ length: isPhone ? 5 : 9 }).map((_, index) => (
          <View
            key={`route-${index}`}
            style={[
              styles.routeLine,
              {
                top: `${8 + index * 11}%`,
                opacity: index % 3 === 0 ? 0.34 : 0.2,
                transform: [{ rotate: `${index % 2 === 0 ? -9 : 8}deg` }],
              },
              webStyle({
                backgroundImage:
                  'linear-gradient(90deg, transparent 0%, rgba(0, 194, 255, 0.08) 18%, rgba(255, 45, 122, 0.65) 46%, rgba(47, 255, 213, 0.48) 57%, transparent 82%)',
                backgroundSize: '260px 100%',
                animation: `manecombRouteFlow ${28 + index * 3}s linear ${index * -2}s infinite`,
              }),
            ]}
          />
        ))}
      </View>
      <View style={styles.particleField}>
        {Array.from({ length: isPhone ? 14 : 28 }).map((_, index) => {
          const color = index % 4 === 0 ? neonPalette.accent : index % 3 === 0 ? neonPalette.mint : neonPalette.cyan;
          return (
            <View
              key={`particle-${index}`}
              style={[
                styles.particle,
                {
                  left: `${(index * 37) % 100}%`,
                  top: `${(index * 19 + 8) % 100}%`,
                  backgroundColor: color,
                },
                webStyle({
                  boxShadow: `0 0 18px ${color}`,
                  animation: `manecombParticleDrift ${18 + (index % 7) * 3}s ease-in-out ${index * -0.9}s infinite`,
                }),
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

function DashboardMockup({ cursor, isPhone }: { cursor: { x: number; y: number }; isPhone: boolean }) {
  const mockupTransform = Platform.OS === 'web' && !isPhone
    ? [
        { perspective: 950 },
        { rotateY: `${-10 + cursor.x * 2.4}deg` },
        { rotateX: `${7 - cursor.y * 2}deg` },
      ]
    : [];

  return (
    <View style={[styles.heroVisual, isPhone ? styles.heroVisualPhone : undefined]}>
      <View
        style={[
          styles.dashboardFrame,
          isPhone ? styles.dashboardFramePhone : undefined,
          { transform: mockupTransform as any },
          webStyle({
            boxShadow:
              '0 0 0 1px rgba(0, 194, 255, 0.34), 0 0 44px rgba(0, 194, 255, 0.2), 0 42px 90px rgba(0,0,0,0.44)',
            transformStyle: 'preserve-3d',
          }),
        ]}>
        <View style={styles.dashboardSidebar}>
          {isPhone ? <Text style={styles.dashboardMiniBrand}>MC</Text> : <BrandLogo size="sm" plain />}
          {['Resumen', 'Mapa', 'Unidades', 'Alertas', 'Documentos'].map((item, index) => (
            <View key={item} style={[styles.dashboardNavRow, index === 1 ? styles.dashboardNavRowActive : undefined]}>
              <View style={[styles.dashboardNavDot, index === 1 ? styles.dashboardNavDotActive : undefined]} />
              <Text style={styles.dashboardNavText}>{item}</Text>
            </View>
          ))}
        </View>
        <View style={styles.dashboardMain}>
          <View style={styles.dashboardTopbar}>
            <Text style={styles.dashboardTitle} numberOfLines={2}>
              {isPhone ? 'Mapa en vivo' : 'Mapa en tiempo real'}
            </Text>
            <View style={styles.dashboardStatus}>
              <View style={styles.liveDot} />
              <Text style={styles.dashboardStatusText}>En vivo</Text>
            </View>
          </View>
          <View style={styles.mapPanel}>
            <View style={styles.mapGrid} />
            <View style={[styles.mapRoute, styles.mapRouteCyan]} />
            <View style={[styles.mapRoute, styles.mapRoutePink]} />
            <View style={[styles.mapRoute, styles.mapRouteViolet]} />
            {[
              { left: '18%', top: '30%', color: neonPalette.cyan },
              { left: '46%', top: '47%', color: neonPalette.accent },
              { left: '70%', top: '28%', color: neonPalette.mint },
              { left: '78%', top: '64%', color: neonPalette.violet },
            ].map((pin, index) => (
              <View
                key={`pin-${index}`}
                style={[
                  styles.vehiclePin,
                  {
                    left: pin.left as any,
                    top: pin.top as any,
                    borderColor: `${pin.color}77`,
                    backgroundColor: `${pin.color}24`,
                  },
                  webStyle({ boxShadow: `0 0 18px ${pin.color}70` }),
                ]}>
                <MaterialCommunityIcons name="bus" size={16} color={pin.color} />
              </View>
            ))}
          </View>
        </View>
      </View>

      <FloatingIndicator
        icon="bus-multiple"
        label="Unidades activas"
        value="24"
        color={neonPalette.cyan}
        style={isPhone ? styles.floatingIndicatorPhoneA : styles.floatingIndicatorA}
      />
      <FloatingIndicator
        icon="bell-check-outline"
        label="Alertas resueltas"
        value="3"
        color={neonPalette.accent}
        style={isPhone ? styles.floatingIndicatorPhoneB : styles.floatingIndicatorB}
      />
      <FloatingIndicator
        icon="pulse"
        label="Disponibilidad"
        value="99.8%"
        color={neonPalette.mint}
        style={isPhone ? styles.floatingIndicatorPhoneC : styles.floatingIndicatorC}
      />
    </View>
  );
}

function FloatingIndicator({
  color,
  icon,
  label,
  style,
  value,
}: {
  color: string;
  icon: IconName;
  label: string;
  style: any;
  value: string;
}) {
  return (
    <View
      style={[
        styles.floatingIndicator,
        style,
        { borderColor: `${color}58` },
        webStyle({
          backgroundImage: `linear-gradient(135deg, rgba(7, 12, 30, 0.82), ${color}12)`,
          boxShadow: `0 0 0 1px ${color}20, 0 0 28px ${color}24, 0 14px 34px rgba(0,0,0,0.28)`,
          backdropFilter: 'blur(14px)',
          animation: 'manecombFloat 7s ease-in-out infinite',
        }),
      ]}>
      <View style={[styles.floatingIcon, { backgroundColor: `${color}15` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <View style={styles.floatingTextBlock}>
        <Text style={[styles.floatingValue, { color }]}>{value}</Text>
        <Text style={styles.floatingLabel}>{label}</Text>
      </View>
    </View>
  );
}

function SectionHeading({
  centered,
  eyebrow,
  intro,
  nativeID,
  title,
}: {
  centered?: boolean;
  eyebrow: string;
  intro?: string;
  nativeID?: string;
  title: string;
}) {
  return (
    <View
      nativeID={nativeID}
      style={[
        styles.sectionHeading,
        centered ? styles.sectionHeadingCentered : undefined,
        webStyle({ scrollMarginTop: 120 }),
      ]}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text style={[styles.sectionTitle, centered ? styles.sectionTitleCentered : undefined]}>{title}</Text>
      {intro ? (
        <Text style={[styles.sectionIntro, centered ? styles.sectionIntroCentered : undefined]}>{intro}</Text>
      ) : null}
    </View>
  );
}

function BenefitCard({
  benefit,
  index,
  isPhone,
}: {
  benefit: (typeof benefits)[number];
  index: number;
  isPhone: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={(state) => {
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
        const pressed = state.pressed;

        return [
          styles.benefitCard,
          isPhone ? styles.benefitCardPhone : undefined,
          { borderColor: hovered ? `${benefit.color}AA` : `${benefit.color}42` },
          hovered ? styles.benefitCardHover : undefined,
          pressed ? styles.buttonPressed : undefined,
          webStyle({
            backgroundImage: hovered
              ? `linear-gradient(145deg, rgba(11, 18, 42, 0.95), ${benefit.color}13)`
              : 'linear-gradient(145deg, rgba(10, 17, 39, 0.74), rgba(8, 13, 30, 0.82))',
            boxShadow: hovered
              ? `0 0 0 1px ${benefit.color}44, 0 0 28px ${benefit.color}24, 0 18px 44px rgba(0, 0, 0, 0.28)`
              : `0 0 0 1px ${benefit.color}16, 0 14px 36px rgba(0, 0, 0, 0.16)`,
            transitionDelay: `${index * 24}ms`,
            transitionDuration: '300ms',
            transitionProperty: 'transform, box-shadow, border-color, background-image',
            backdropFilter: 'blur(14px)',
            cursor: 'default',
          }),
        ];
      }}>
      <View
        style={[
          styles.benefitIcon,
          { backgroundColor: `${benefit.color}14`, borderColor: `${benefit.color}44` },
          webStyle({ boxShadow: `0 0 22px ${benefit.color}26` }),
        ]}>
        <MaterialCommunityIcons name={benefit.icon} size={27} color={benefit.color} />
      </View>
      <Text style={styles.benefitTitle}>{benefit.title}</Text>
      <Text style={styles.benefitBody}>{benefit.body}</Text>
    </Pressable>
  );
}

function ProcessStep({
  index,
  isLast,
  isPhone,
  step,
}: {
  index: number;
  isLast: boolean;
  isPhone: boolean;
  step: (typeof processSteps)[number];
}) {
  const color = [neonPalette.cyan, neonPalette.accent, neonPalette.violet, neonPalette.mint][index];

  return (
    <View style={[styles.processStep, isPhone ? styles.processStepPhone : undefined]}>
      <View style={styles.processNodeWrap}>
        <View
          style={[
            styles.processNode,
            { borderColor: `${color}88`, backgroundColor: `${color}12` },
            webStyle({ boxShadow: `0 0 32px ${color}22` }),
          ]}>
          <Text style={[styles.processNumber, { color }]}>{index + 1}</Text>
          <MaterialCommunityIcons name={step.icon} size={30} color={color} />
        </View>
        {!isLast ? (
          <View
            style={[
              styles.processConnector,
              isPhone ? styles.processConnectorPhone : undefined,
              webStyle({
                backgroundImage: `linear-gradient(90deg, ${color}00, ${color}, ${neonPalette.accent})`,
                boxShadow: `0 0 18px ${color}66`,
              }),
            ]}
          />
        ) : null}
      </View>
      <Text style={styles.processTitle}>{step.title}</Text>
      <Text style={styles.processBody}>{step.body}</Text>
    </View>
  );
}

function RevealView({
  children,
  index = 0,
  immediate = false,
  scrollY,
  style,
  viewportHeight,
}: {
  children: ReactNode;
  index?: number;
  immediate?: boolean;
  scrollY: number;
  style?: any;
  viewportHeight: number;
}) {
  const opacity = useRef(new Animated.Value(immediate ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(immediate ? 0 : 22)).current;
  const [layoutY, setLayoutY] = useState(0);
  const [measured, setMeasured] = useState(immediate);
  const [revealed, setRevealed] = useState(immediate);

  useEffect(() => {
    if (revealed || !measured) {
      return;
    }

    if (scrollY + viewportHeight * 0.9 >= layoutY) {
      setRevealed(true);
    }
  }, [layoutY, measured, revealed, scrollY, viewportHeight]);

  useEffect(() => {
    if (!revealed) {
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        delay: Math.min(index * 55, 360),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 420,
        delay: Math.min(index * 55, 360),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, revealed, translateY]);

  return (
    <Animated.View
      onLayout={(event) => {
        setLayoutY(event.nativeEvent.layout.y);
        setMeasured(true);
      }}
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}>
      {children}
    </Animated.View>
  );
}

function PlanCard({
  index,
  plan,
  width,
  active,
  accent,
  onPress,
  onBuy,
  onTrial,
  userLabel,
  trialLabel,
}: {
  index: number;
  plan: CommercialPlan;
  width: number;
  active: boolean;
  accent: string;
  onPress: () => void;
  onBuy: () => void;
  onTrial?: () => void;
  userLabel: string;
  trialLabel?: string;
}) {
  const visual = getPlanVisualTone(index);
  const cardEdge = active ? visual.edge : accent;
  const features = [
    `${plan.units} unidades incluidas`,
    `${formatCurrency(plan.pricePerVehicle)} por unidad`,
    plan.includesRadioModule ? 'Radio incluido' : 'Radio opcional',
    plan.trialEligible ? `Prueba de ${plan.trialDays || 7} días` : 'Activación directa',
  ];

  return (
    <Pressable
      onPress={onPress}
      style={(state) => {
        const pressed = state.pressed;
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);

        return [
          styles.planCard,
          {
            width,
            borderColor: active ? visual.edge : hovered ? `${visual.secondary}CC` : `${visual.edge}44`,
            ...(Platform.OS === 'web'
              ? null
              : {
                  shadowColor: cardEdge,
                  shadowOpacity: active ? 0.58 : hovered ? 0.36 : 0.18,
                }),
            transform: [
              { translateY: active ? -6 : hovered ? -3 : 0 },
              { scale: hovered ? 1.02 : 1 },
            ],
            ...(Platform.OS === 'web'
              ? ({
                  backgroundImage: active
                    ? 'linear-gradient(145deg, rgba(11, 18, 36, 0.98) 0%, rgba(19, 27, 51, 0.94) 58%, rgba(11, 18, 36, 0.98) 100%)'
                    : 'linear-gradient(145deg, rgba(10, 17, 34, 0.94) 0%, rgba(15, 24, 46, 0.9) 100%)',
                  boxShadow:
                    active || hovered
                      ? `0 0 0 1px ${visual.edge}88, 0 0 30px ${visual.edge}42, 0 26px 70px rgba(0, 0, 0, 0.42)`
                      : `0 0 0 1px ${visual.edge}22, 0 18px 46px rgba(0, 0, 0, 0.26)`,
                  transitionDelay: `${index * 35}ms`,
                  transitionDuration: '340ms',
                  transitionProperty: 'transform, box-shadow, border-color, background-image, opacity',
                  backdropFilter: 'blur(18px)',
                  cursor: 'pointer',
                } as any)
              : null),
          },
          pressed ? styles.buttonPressed : undefined,
        ];
      }}>
      {active ? (
        <View
          pointerEvents="none"
          style={[
            styles.planSelectedHalo,
            {
              borderColor: `${visual.edge}B8`,
              backgroundColor: 'transparent',
            },
          ]}
        />
      ) : null}
      <View style={styles.planTop}>
        <View>
          <Text
            style={[
              styles.planBadge,
              active ? styles.planBadgeActive : undefined,
              {
                color: cardEdge,
              },
              Platform.OS === 'web'
                ? null
                : { textShadowColor: active ? `${visual.edge}AA` : 'transparent' },
            ]}>
            {plan.badge}
          </Text>
          <Text style={styles.planName}>{plan.name}</Text>
        </View>
        <View style={[styles.planSymbol, { borderColor: `${cardEdge}66`, backgroundColor: 'rgba(255, 255, 255, 0.06)' }]}>
          <MaterialCommunityIcons name="bus-electric" size={24} color={cardEdge} />
        </View>
      </View>
      <Text style={styles.planSubtitle}>{plan.subtitle}</Text>
      <View style={styles.planPriceRow}>
        <Text style={styles.planPrice}>{formatCurrency(plan.price)}</Text>
        <Text style={styles.planPeriod}>/mes</Text>
      </View>
      <View style={styles.planList}>
        {features.map((entry) => (
          <View key={entry} style={styles.planListRow}>
            <MaterialCommunityIcons name="check-circle-outline" size={17} color={cardEdge} />
            <Text style={styles.planListText}>{entry}</Text>
          </View>
        ))}
      </View>
      <View style={styles.planActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onBuy}
          style={(state) => {
            const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
            const pressed = state.pressed;

            return [
              styles.planButton,
              {
                backgroundColor: neonPalette.accent,
                borderColor: neonPalette.accent,
                transform: [{ scale: hovered ? 1.025 : 1 }],
                ...(Platform.OS === 'web'
                  ? ({
                      boxShadow: hovered
                        ? `0 0 24px ${neonPalette.accentGlow}, 0 18px 40px rgba(255, 45, 122, 0.3)`
                        : `0 0 16px ${neonPalette.accentGlow}, 0 12px 30px rgba(255, 45, 122, 0.2)`,
                      transitionDuration: '260ms',
                      transitionProperty: 'transform, box-shadow',
                      cursor: 'pointer',
                    } as any)
                  : null),
              },
              pressed ? styles.buttonPressed : undefined,
            ];
          }}>
          <MaterialCommunityIcons name="arrow-right" size={18} color="#FFFFFF" />
          <Text style={styles.planButtonLabel} numberOfLines={1}>{userLabel}</Text>
        </Pressable>
        {onTrial ? (
          <Pressable
            accessibilityRole="button"
            onPress={onTrial}
            style={(state) => {
              const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
              const pressed = state.pressed;

              return [
                styles.planTrialButton,
                {
                  borderColor: hovered ? neonPalette.accent : `${neonPalette.accent}88`,
                  backgroundColor: hovered ? 'rgba(255, 45, 122, 0.2)' : neonPalette.accentSoft,
                  transform: [{ scale: hovered ? 1.018 : 1 }],
                  ...(Platform.OS === 'web'
                    ? ({
                        boxShadow: hovered ? `0 0 18px ${neonPalette.accent}44` : 'none',
                        transitionDuration: '240ms',
                        transitionProperty: 'transform, box-shadow, border-color, background-color',
                        cursor: 'pointer',
                      } as any)
                    : null),
                },
                pressed ? styles.buttonPressed : undefined,
              ];
            }}>
            <MaterialCommunityIcons name="credit-card-clock-outline" size={17} color={neonPalette.accent} />
            <Text style={[styles.planTrialLabel, { color: neonPalette.accent }]} numberOfLines={1}>{trialLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

function ActionButton({
  compact,
  icon,
  label,
  onPress,
  variant = 'solid',
}: {
  compact?: boolean;
  icon: IconName;
  label: string;
  onPress: () => void;
  variant?: 'solid' | 'ghost';
}) {
  const solid = variant === 'solid';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => {
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
        const pressed = state.pressed;

        return [
          styles.actionButton,
          compact ? styles.actionButtonCompact : undefined,
          solid ? styles.actionButtonSolid : styles.actionButtonGhost,
          hovered ? styles.hoverLift : undefined,
          webStyle({
            cursor: 'pointer',
            transitionDuration: '260ms',
            transitionProperty: 'transform, box-shadow, background-color, border-color',
            boxShadow: solid && hovered ? `0 0 26px ${neonPalette.accentGlow}` : undefined,
          }),
          pressed ? styles.buttonPressed : undefined,
        ];
      }}>
      <Text style={[styles.actionButtonText, solid ? styles.actionButtonTextSolid : undefined]} numberOfLines={1}>
        {label}
      </Text>
      <MaterialCommunityIcons
        name={icon}
        size={compact ? 15 : 18}
        color={solid ? '#FFFFFF' : neonPalette.text}
      />
    </Pressable>
  );
}

function CheckoutReturnBanner({
  onPrimaryPress,
  status,
}: {
  onPrimaryPress: () => void;
  status?: string | string[];
}) {
  const copy = getCheckoutReturnCopy(getFirstParam(status));

  if (!copy) {
    return null;
  }

  const toneColor =
    copy.tone === 'success'
      ? neonPalette.mint
      : copy.tone === 'pending'
        ? neonPalette.cyan
        : neonPalette.accent;

  return (
    <View style={[styles.checkoutReturnBanner, { borderColor: `${toneColor}66`, backgroundColor: `${toneColor}14` }]}>
      <View style={[styles.checkoutReturnIcon, { backgroundColor: `${toneColor}22` }]}>
        <MaterialCommunityIcons name={copy.icon} size={24} color={toneColor} />
      </View>
      <View style={styles.checkoutReturnCopy}>
        <Text style={styles.checkoutReturnTitle}>{copy.title}</Text>
        <Text style={styles.checkoutReturnBody}>{copy.body}</Text>
      </View>
      <Pressable onPress={onPrimaryPress} style={[styles.checkoutReturnButton, { backgroundColor: toneColor }]}>
        <Text style={styles.checkoutReturnButtonText}>{copy.action}</Text>
      </Pressable>
    </View>
  );
}

function RoundIconButton({
  icon,
  onPress,
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={(state) => {
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
        const pressed = state.pressed;

        return [
          styles.roundButton,
          hovered && !disabled ? styles.hoverLift : undefined,
          disabled ? styles.roundButtonDisabled : undefined,
          webStyle({
            cursor: disabled ? 'default' : 'pointer',
            transitionDuration: '240ms',
            transitionProperty: 'transform, box-shadow, border-color, background-color',
            boxShadow: hovered && !disabled ? `0 0 18px ${neonPalette.cyan}33` : undefined,
          }),
          pressed && !disabled ? styles.buttonPressed : undefined,
        ];
      }}>
      <MaterialCommunityIcons
        name={icon}
        size={24}
        color={disabled ? 'rgba(138, 147, 178, 0.55)' : neonPalette.text}
      />
    </Pressable>
  );
}

function FaqItem({
  answer,
  onPress,
  open,
  question,
}: {
  answer: string;
  onPress: () => void;
  open: boolean;
  question: string;
}) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [open, progress]);

  const answerStyle = {
    maxHeight: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 130],
    }),
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-4, 0],
        }),
      },
    ],
  };

  const iconStyle = {
    transform: [
      {
        rotate: progress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '180deg'],
        }),
      },
    ],
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => {
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
        const pressed = state.pressed;

        return [
          styles.faqItem,
          open ? styles.faqItemOpen : undefined,
          hovered ? styles.faqItemHover : undefined,
          webStyle({
            cursor: 'pointer',
            transitionDuration: '260ms',
            transitionProperty: 'transform, box-shadow, border-color, background-color, background-image',
            backdropFilter: 'blur(14px)',
            backgroundImage: open
              ? 'linear-gradient(120deg, rgba(0, 194, 255, 0.1), rgba(122, 60, 255, 0.07), rgba(255, 45, 122, 0.05))'
              : hovered
                ? 'linear-gradient(120deg, rgba(245, 247, 255, 0.07), rgba(0, 194, 255, 0.045))'
                : undefined,
            boxShadow: open
              ? `0 0 0 1px ${neonPalette.cyan}22, 0 0 22px rgba(0, 194, 255, 0.16), 0 16px 42px rgba(0, 0, 0, 0.2)`
              : hovered
                ? `0 0 18px rgba(0, 194, 255, 0.14), 0 12px 34px rgba(0, 0, 0, 0.18)`
                : undefined,
          }),
          pressed ? styles.buttonPressed : undefined,
        ];
      }}>
      <View style={styles.faqQuestionRow}>
        <Text style={styles.faqQuestion}>{question}</Text>
        <Animated.View style={iconStyle}>
          <MaterialCommunityIcons
            name={open ? 'minus' : 'plus'}
            size={18}
            color={open ? neonPalette.cyan : neonPalette.muted}
          />
        </Animated.View>
      </View>
      <Animated.View style={[styles.faqAnswerWrap, answerStyle]}>
        <Text style={styles.faqAnswer}>{answer}</Text>
      </Animated.View>
    </Pressable>
  );
}

function SiteFooter({ onNavigate }: { onNavigate: (target: string) => void }) {
  const handleFooterLink = (label: string) => {
    if (label === 'Planes') {
      onNavigate('planes');
      return;
    }
    if (label === 'Funciones' || label === 'Demo') {
      onNavigate('funcionalidades');
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
  );
}

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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: neonPalette.background,
    ...(Platform.OS === 'web'
      ? ({ minHeight: '100vh', overflow: 'visible' } as any)
      : { overflow: 'hidden' as const }),
  },
  scroll: {
    flex: 1,
  },
  webPage: {
    minHeight: '100vh' as any,
    width: '100%',
  },
  content: {
    paddingBottom: 36,
    paddingTop: 96,
  },
  container: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 112,
    paddingBottom: 36,
    gap: 78,
  },
  checkoutReturnBanner: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: -34,
    minWidth: 0,
    padding: 14,
  },
  checkoutReturnIcon: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  checkoutReturnCopy: {
    flex: 1,
    flexBasis: 260,
    gap: 3,
    minWidth: 0,
  },
  checkoutReturnTitle: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  checkoutReturnBody: {
    color: neonPalette.mutedStrong,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  checkoutReturnButton: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 14,
  },
  checkoutReturnButtonText: {
    color: '#050816',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  containerPhone: {
    paddingHorizontal: 16,
    paddingTop: 132,
    gap: 58,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  animatedWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: neonPalette.background,
  },
  parallaxField: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundOrb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.75,
  },
  backgroundOrbBlue: {
    top: 96,
    left: -160,
    width: 460,
    height: 460,
    backgroundColor: 'rgba(0, 194, 255, 0.16)',
  },
  backgroundOrbPink: {
    top: -140,
    right: -140,
    width: 520,
    height: 520,
    backgroundColor: 'rgba(255, 45, 122, 0.18)',
  },
  backgroundOrbViolet: {
    right: -220,
    bottom: 220,
    width: 600,
    height: 600,
    backgroundColor: 'rgba(122, 60, 255, 0.14)',
  },
  routeField: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.74,
  },
  routeLine: {
    position: 'absolute',
    left: -160,
    right: -160,
    height: 1,
    backgroundColor: 'rgba(0, 194, 255, 0.12)',
  },
  particleField: {
    ...StyleSheet.absoluteFillObject,
  },
  particle: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 2,
    opacity: 0.68,
  },
  headerShell: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    minHeight: 76,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 247, 255, 0.09)',
    backgroundColor: 'rgba(5, 8, 22, 0.66)',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  headerShellCompact: {
    minHeight: 60,
    paddingVertical: 8,
    backgroundColor: 'rgba(5, 8, 22, 0.78)',
  },
  headerShellPhone: {
    minHeight: 116,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerInner: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },
  headerInnerPhone: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerNav: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  headerNavScroll: {
    width: '100%',
    flexGrow: 0,
  },
  headerNavPhoneContent: {
    alignItems: 'center',
    gap: 6,
    justifyContent: 'space-between',
    minWidth: '100%' as any,
    paddingRight: 0,
  },
  navItem: {
    minHeight: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  navItemPhone: {
    minHeight: 32,
    paddingHorizontal: 7,
  },
  navItemHover: {
    backgroundColor: 'rgba(0, 194, 255, 0.08)',
    borderColor: 'rgba(0, 194, 255, 0.22)',
    transform: [{ translateY: -1 }],
  },
  navItemText: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  navItemTextPhone: {
    fontSize: 10.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  heroSection: {
    minHeight: 650,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 247, 255, 0.09)',
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 28,
    gap: 26,
  },
  heroDesktop: {
    minHeight: 650,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 34,
    paddingVertical: 34,
  },
  heroPhone: {
    minHeight: 720,
    paddingHorizontal: 14,
    paddingTop: 28,
  },
  heroCopy: {
    flex: 0.92,
    maxWidth: 580,
    gap: 20,
    zIndex: 2,
  },
  heroCopyPhone: {
    maxWidth: '100%' as any,
    gap: 16,
  },
  heroKicker: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 45, 122, 0.42)',
    backgroundColor: neonPalette.accentSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
  },
  heroKickerText: {
    color: neonPalette.accent,
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  heroTitle: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 58,
    lineHeight: 64,
    fontWeight: '900',
    maxWidth: 620,
  },
  heroTitlePhone: {
    fontSize: 36,
    lineHeight: 42,
  },
  heroSubtitle: {
    color: neonPalette.mutedStrong,
    fontFamily: Typography.body,
    fontSize: 17,
    lineHeight: 27,
    maxWidth: 560,
  },
  heroSubtitlePhone: {
    fontSize: 14.5,
    lineHeight: 22,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    minWidth: 0,
  },
  actionButtonCompact: {
    minHeight: 42,
    paddingHorizontal: 14,
  },
  actionButtonSolid: {
    backgroundColor: neonPalette.accent,
    borderColor: neonPalette.accent,
    ...(Platform.OS === 'web'
      ? {}
      : {
          shadowColor: neonPalette.accent,
          shadowOpacity: 0.36,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 5,
        }),
  },
  actionButtonGhost: {
    backgroundColor: 'rgba(245, 247, 255, 0.055)',
    borderColor: 'rgba(245, 247, 255, 0.16)',
  },
  actionButtonText: {
    color: neonPalette.text,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 13.5,
    fontWeight: '900',
    minWidth: 0,
  },
  actionButtonTextSolid: {
    color: '#FFFFFF',
  },
  heroVisual: {
    flex: 1.1,
    minHeight: 470,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  heroVisualPhone: {
    minHeight: 360,
    width: '100%',
  },
  dashboardFrame: {
    width: '94%',
    maxWidth: 620,
    aspectRatio: 1.48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 255, 0.32)',
    backgroundColor: 'rgba(7, 13, 30, 0.9)',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  dashboardFramePhone: {
    width: '100%',
    aspectRatio: 1.24,
  },
  dashboardSidebar: {
    width: '27%',
    minWidth: 88,
    borderRightWidth: 1,
    borderRightColor: 'rgba(245, 247, 255, 0.08)',
    backgroundColor: 'rgba(5, 8, 22, 0.76)',
    padding: 12,
    gap: 11,
  },
  dashboardMiniBrand: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  dashboardNavRow: {
    minHeight: 24,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 8,
  },
  dashboardNavRowActive: {
    backgroundColor: 'rgba(0, 194, 255, 0.1)',
  },
  dashboardNavDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(138, 147, 178, 0.5)',
  },
  dashboardNavDotActive: {
    backgroundColor: neonPalette.cyan,
  },
  dashboardNavText: {
    color: neonPalette.mutedStrong,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '800',
  },
  dashboardMain: {
    flex: 1,
    padding: 14,
    gap: 12,
  },
  dashboardTopbar: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dashboardTitle: {
    color: neonPalette.text,
    flex: 1,
    fontFamily: Typography.display,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 16,
  },
  dashboardStatus: {
    minHeight: 24,
    borderRadius: 999,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(47, 255, 213, 0.1)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: neonPalette.mint,
  },
  dashboardStatusText: {
    color: neonPalette.mint,
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
  },
  mapPanel: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 255, 0.18)',
    backgroundColor: 'rgba(8, 14, 33, 0.92)',
    overflow: 'hidden',
    position: 'relative',
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.22,
    backgroundColor: 'rgba(0, 194, 255, 0.04)',
  },
  mapRoute: {
    position: 'absolute',
    left: '10%' as any,
    right: '12%' as any,
    height: 3,
    borderRadius: 999,
  },
  mapRouteCyan: {
    top: '34%' as any,
    backgroundColor: 'rgba(0, 194, 255, 0.58)',
    transform: [{ rotate: '-9deg' }],
  },
  mapRoutePink: {
    top: '52%' as any,
    backgroundColor: 'rgba(255, 45, 122, 0.62)',
    transform: [{ rotate: '13deg' }],
  },
  mapRouteViolet: {
    top: '70%' as any,
    backgroundColor: 'rgba(122, 60, 255, 0.55)',
    transform: [{ rotate: '-4deg' }],
  },
  vehiclePin: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingIndicator: {
    position: 'absolute',
    minWidth: 174,
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(7, 12, 30, 0.82)',
  },
  floatingIndicatorA: {
    left: -6,
    bottom: 44,
  },
  floatingIndicatorB: {
    right: 16,
    top: 58,
  },
  floatingIndicatorC: {
    right: -10,
    bottom: 96,
  },
  floatingIndicatorPhoneA: {
    left: 0,
    bottom: 4,
    minWidth: 148,
  },
  floatingIndicatorPhoneB: {
    right: 0,
    top: -18,
    minWidth: 148,
  },
  floatingIndicatorPhoneC: {
    right: 0,
    bottom: 88,
    minWidth: 148,
  },
  floatingIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  floatingValue: {
    fontFamily: Typography.display,
    fontSize: 22,
    fontWeight: '900',
  },
  floatingLabel: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
  },
  section: {
    gap: 28,
  },
  sectionHeading: {
    gap: 8,
    maxWidth: 680,
  },
  sectionHeadingCentered: {
    alignSelf: 'center',
    alignItems: 'center',
  },
  sectionCopy: {
    gap: 6,
    flex: 1,
  },
  sectionEyebrow: {
    color: neonPalette.accent,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  sectionTitle: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    maxWidth: 680,
  },
  sectionTitleCentered: {
    textAlign: 'center',
  },
  sectionIntro: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 14.5,
    lineHeight: 23,
    maxWidth: 560,
  },
  sectionIntroCentered: {
    textAlign: 'center',
  },
  benefitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  benefitGridPhone: {
    flexDirection: 'column',
  },
  benefitCard: {
    flexGrow: 1,
    flexBasis: 340,
    minHeight: 210,
    borderRadius: 8,
    borderWidth: 1,
    padding: 20,
    gap: 14,
    backgroundColor: 'rgba(9, 15, 34, 0.78)',
  },
  benefitCardPhone: {
    flexBasis: 'auto' as any,
    width: '100%',
  },
  benefitCardHover: {
    transform: [{ translateY: -5 }],
  },
  benefitIcon: {
    width: 52,
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  benefitBody: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13.5,
    lineHeight: 21,
  },
  anchorOffset: {
    gap: 22,
  },
  plansHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
  },
  carouselControls: {
    flexDirection: 'row',
    gap: 8,
  },
  roundButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 247, 255, 0.065)',
    borderWidth: 1,
    borderColor: neonPalette.line,
  },
  roundButtonDisabled: {
    opacity: 0.42,
  },
  planCarouselViewport: {
    marginHorizontal: -18,
    marginTop: -18,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  planCarousel: {
    gap: 18,
    paddingLeft: 18,
    paddingRight: 30,
    paddingTop: 18,
    paddingBottom: 34,
  },
  planCard: {
    minHeight: 382,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: 'rgba(12, 20, 42, 0.88)',
    padding: 20,
    gap: 15,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? {}
      : {
          shadowRadius: 30,
          shadowOffset: { width: 0, height: 16 },
          elevation: 8,
        }),
  },
  planSelectedHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1,
    opacity: 0.8,
  },
  planTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  planBadge: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web'
      ? {}
      : {
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 10,
        }),
  },
  planBadgeActive: {
    letterSpacing: 2.1,
  },
  planName: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    ...(Platform.OS === 'web'
      ? {}
      : {
          textShadowColor: 'rgba(255, 255, 255, 0.16)',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 14,
        }),
  },
  planSymbol: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  planSubtitle: {
    color: 'rgba(207, 218, 235, 0.78)',
    fontFamily: Typography.body,
    fontSize: 13.5,
    lineHeight: 21,
    minHeight: 42,
  },
  planPriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  planPrice: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '900',
    ...(Platform.OS === 'web'
      ? {}
      : {
          textShadowColor: 'rgba(255, 255, 255, 0.18)',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 16,
        }),
  },
  planPeriod: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '800',
  },
  planList: {
    gap: 10,
    flex: 1,
  },
  planListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  planListText: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '800',
    flex: 1,
  },
  planActions: {
    gap: 10,
  },
  planButton: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  planButtonLabel: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 0,
  },
  planTrialButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  planTrialLabel: {
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    minWidth: 0,
  },
  planDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: -28,
  },
  planDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  planDotActive: {
    width: 22,
  },
  processRail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 18,
    paddingHorizontal: 20,
  },
  processRailPhone: {
    flexDirection: 'column',
    paddingHorizontal: 0,
    gap: 22,
  },
  processStep: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    position: 'relative',
  },
  processStepPhone: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  processNodeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  processNode: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(9, 15, 34, 0.8)',
  },
  processNumber: {
    fontFamily: Typography.display,
    fontSize: 14,
    fontWeight: '900',
  },
  processConnector: {
    position: 'absolute',
    left: 118,
    top: 59,
    width: 150,
    height: 2,
    borderRadius: 999,
    backgroundColor: neonPalette.cyan,
  },
  processConnectorPhone: {
    left: 59,
    top: 118,
    width: 2,
    height: 48,
  },
  processTitle: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  processBody: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12.5,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 190,
  },
  trustSection: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 247, 255, 0.1)',
    backgroundColor: 'rgba(9, 15, 34, 0.8)',
    padding: 24,
    gap: 26,
    overflow: 'hidden',
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 18,
  },
  metricGridPhone: {
    flexDirection: 'column',
  },
  metricCard: {
    flex: 1,
    minHeight: 122,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 247, 255, 0.1)',
    backgroundColor: 'rgba(245, 247, 255, 0.045)',
    padding: 18,
    gap: 7,
  },
  metricIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  metricValue: {
    fontFamily: Typography.display,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '900',
  },
  metricLabel: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
  },
  faqShell: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 247, 255, 0.1)',
    backgroundColor: 'rgba(9, 15, 34, 0.82)',
    padding: 22,
    gap: 24,
    overflow: 'hidden',
  },
  faqShellDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  supportVisual: {
    flex: 0.78,
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportCard: {
    width: 250,
    height: 250,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(122, 60, 255, 0.42)',
    backgroundColor: 'rgba(122, 60, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportBubble: {
    position: 'absolute',
    right: 48,
    top: 54,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: neonPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqContent: {
    flex: 1.2,
    gap: 20,
  },
  faqList: {
    gap: 10,
  },
  faqItem: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: neonPalette.line,
    backgroundColor: 'rgba(245, 247, 255, 0.045)',
    padding: 16,
    gap: 10,
    overflow: 'hidden',
  },
  faqItemOpen: {
    borderColor: 'rgba(0, 194, 255, 0.45)',
    backgroundColor: 'rgba(0, 194, 255, 0.07)',
  },
  faqItemHover: {
    borderColor: 'rgba(0, 194, 255, 0.36)',
    transform: [{ translateY: -2 }],
  },
  faqQuestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    alignItems: 'center',
  },
  faqQuestion: {
    color: neonPalette.text,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 14.5,
    lineHeight: 21,
    fontWeight: '900',
  },
  faqAnswerWrap: {
    overflow: 'hidden',
  },
  faqAnswer: {
    color: 'rgba(207, 218, 235, 0.82)',
    fontFamily: Typography.body,
    fontSize: 13.5,
    lineHeight: 21,
    paddingTop: 2,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 45, 122, 0.34)',
    backgroundColor: 'rgba(5, 8, 22, 0.96)',
    paddingHorizontal: 22,
    paddingTop: 34,
    paddingBottom: 18,
  },
  footerInner: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 28,
    justifyContent: 'space-between',
  },
  footerBrand: {
    width: 260,
    gap: 14,
  },
  footerDescription: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12.5,
    lineHeight: 19,
  },
  footerColumns: {
    flex: 1,
    minWidth: 360,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 26,
    justifyContent: 'space-between',
  },
  footerColumn: {
    minWidth: 120,
    gap: 9,
  },
  footerColumnTitle: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  footerLinkButton: {
    minHeight: 24,
    justifyContent: 'center',
  },
  footerLink: {
    color: neonPalette.mutedStrong,
    fontFamily: Typography.body,
    fontSize: 12,
  },
  contactCard: {
    minWidth: 230,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: neonPalette.line,
    backgroundColor: 'rgba(245, 247, 255, 0.045)',
    padding: 18,
    gap: 10,
  },
  contactTitle: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactText: {
    color: neonPalette.mutedStrong,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 12,
  },
  footerBottom: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(245, 247, 255, 0.08)',
    marginTop: 28,
    paddingTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  footerBottomText: {
    color: 'rgba(138, 147, 178, 0.78)',
    fontFamily: Typography.body,
    fontSize: 11,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  hoverLift: {
    transform: [{ translateY: -2 }, { scale: 1.02 }],
  },
});
