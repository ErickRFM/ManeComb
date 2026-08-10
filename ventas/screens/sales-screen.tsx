import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useLocalSearchParams, router } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { usePublicCommercialFlow } from '@/features/commercial';
import { useAppStore } from '@/src/store/use-app-store';
import type { CommercialPlan } from '@/src/types/app';
import { saveCheckoutContext } from '@/src/utils/checkout-context';
import { getAuthenticatedHome } from '@/src/utils/account-routing';
import { COMMERCIAL_FAQS } from '@/src/constants/commercial';
import { neonPalette, processSteps, trustMetrics } from './sales/constants';
import { styles } from './sales/styles';
import {
  buildPlanParams,
  getFirstParam,
  getPlanAccent,
  isPublicDemoPlan,
  normalizePaymentReturnStatus,
} from './sales/utils';
import { SiteHeader } from './sales/components/site-header';
import { ImmersiveBackground } from './sales/components/immersive-background';
import { DashboardMockup } from './sales/components/dashboard-mockup';
import { ActionButton, ProcessStep, RoundIconButton, SectionHeading } from './sales/components/section-heading';
import { HeroSignalRow, PlatformOverview } from './sales/components/sales-story';
import { RevealView } from './sales/components/reveal-view';
import { PlanCardSkeleton } from './sales/components/plan-card-skeleton';
import { PlanCard } from './sales/components/plan-card';
import { CheckoutReturnBanner } from './sales/components/checkout-return-banner';
import { FaqItem } from './sales/components/faq-item';
import { AppDownloadSection } from './sales/components/app-download-section';
import { SiteFooter } from './sales/components/site-footer';

export function SalesScreen() {
  const { width, height } = useWindowDimensions();
  const routeParams = useLocalSearchParams<{
    checkout?: string | string[];
    collection_id?: string | string[];
    collection_status?: string | string[];
    external_reference?: string | string[];
    payment_id?: string | string[];
    preference_id?: string | string[];
    status?: string | string[];
  }>();
  const paymentId = getFirstParam(routeParams.payment_id) || getFirstParam(routeParams.collection_id);
  const externalReference = getFirstParam(routeParams.external_reference);
  const {
    confirmation: checkoutConfirm,
    loadPlans,
    plans,
    plansError,
    plansLoading,
  } = usePublicCommercialFlow({
    externalReference,
    paymentId,
  });
  const isDesktop = width >= 1024;
  const isPhone = width < 640;
  const isTablet = !isDesktop && !isPhone;
  const heroSideBySide = width >= 880;
  const planCardGap = isPhone ? 12 : 18;
  const desktopVisibleCards = width >= 1320 ? 4 : 3;
  const desktopCarouselWidth = Math.max(0, Math.min(width, 1240) - 44);
  const cardWidth = isPhone
    ? Math.max(0, width - 32)
    : isDesktop
      ? Math.floor(
          (desktopCarouselWidth - planCardGap * (desktopVisibleCards - 1)) /
            desktopVisibleCards
        )
      : 306;
  const cardStep = cardWidth + planCardGap;
  const compactPlanCard = cardWidth < 288;
  const carouselRef = useRef<ScrollView>(null);
  const pageRef = useRef<ScrollView>(null);
  const nativeSectionOffsets = useRef<Record<string, number>>({});
  const user = useAppStore((state) => state.user);
  const [activePlanIndex, setActivePlanIndex] = useState(0);
  const [openFaqIndex, setOpenFaqIndex] = useState(-1);
  const [headerCompact, setHeaderCompact] = useState(false);
  const [nativeScrollY, setNativeScrollY] = useState(0);

  const getPlanScrollOffset = useCallback(
    (planIndex: number) => {
      if (!isDesktop) {
        return planIndex * cardStep;
      }

      const maxStartIndex = Math.max(0, plans.length - desktopVisibleCards);
      const centeredStartIndex = planIndex - Math.floor(desktopVisibleCards / 2);
      const startIndex = Math.max(0, Math.min(maxStartIndex, centeredStartIndex));
      return startIndex * cardStep;
    },
    [cardStep, desktopVisibleCards, isDesktop, plans.length]
  );

  useEffect(() => {
    if (!plans.length) {
      setActivePlanIndex(0);
      return;
    }

    // La selección inicial se apoya en una capacidad contractual estable (demo pública),
    // no en copy de marketing como "Más vendido" que puede cambiar sin alterar el catálogo.
    const recommendedIndex = Math.max(plans.findIndex((plan) => isPublicDemoPlan(plan)), 0);
    setActivePlanIndex(recommendedIndex);

    const frame = requestAnimationFrame(() => {
      carouselRef.current?.scrollTo({
        x: getPlanScrollOffset(recommendedIndex),
        animated: false,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [getPlanScrollOffset, plans]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    let frame: number | null = null;

    const readScroll = () => {
      frame = null;
      const offset = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      setHeaderCompact(offset > 36);
    };

    const handleWindowScroll = () => {
      if (frame === null) {
        frame = window.requestAnimationFrame(readScroll);
      }
    };

    readScroll();
    window.addEventListener('scroll', handleWindowScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleWindowScroll);
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  const activePlan = plans[activePlanIndex] || plans[0] || null;
  const providerReturnStatus = getFirstParam(routeParams.collection_status) || getFirstParam(routeParams.status);
  const checkoutReturnStatus =
    normalizePaymentReturnStatus(checkoutConfirm.paymentStatus) ||
    normalizePaymentReturnStatus(getFirstParam(routeParams.checkout)) ||
    normalizePaymentReturnStatus(providerReturnStatus);

  const goToPlanCheckout = (plan: CommercialPlan, requestTrial = false) => {
    const safeRequestTrial = requestTrial && isPublicDemoPlan(plan);
    const params = buildPlanParams(plan, safeRequestTrial);
    saveCheckoutContext(plan.id, safeRequestTrial);

    // La compra manda: cualquier cuenta autenticada continúa al pago (antes, una cuenta no-cliente
    // era desviada y perdía el plan elegido).
    if (user) {
      router.push({ pathname: '/ventas/pago', params } as never);
      return;
    }

    router.push({ pathname: '/ventas/registro', params } as never);
  };

  const PageScroller = Platform.OS === 'web' ? View : ScrollView;
  const pageScrollerProps =
    Platform.OS === 'web'
      ? {
          style: styles.webPage,
        }
      : {
          ref: pageRef,
          style: styles.scroll,
          contentContainerStyle: styles.content,
          showsVerticalScrollIndicator: false,
          scrollEventThrottle: 16,
          onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const offset = event.nativeEvent.contentOffset.y;
            setNativeScrollY(offset);
            setHeaderCompact(offset > 36);
          },
        };

  const registerNativeSection = useCallback(
    (target: string) => (event: LayoutChangeEvent) => {
      nativeSectionOffsets.current[target] = event.nativeEvent.layout.y;
    },
    []
  );

  const scrollToSection = (target: string) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const section = document.getElementById(target);
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const targetOffset = nativeSectionOffsets.current[target];
    if (typeof targetOffset === 'number') {
      pageRef.current?.scrollTo({ y: Math.max(0, targetOffset - 96), animated: true });
    }

    if (target === 'planes') {
      carouselRef.current?.scrollTo({ x: getPlanScrollOffset(activePlanIndex), animated: true });
    }
  };

  const jumpToPlan = (nextIndex: number) => {
    if (!plans.length) {
      setActivePlanIndex(0);
      return;
    }

    const boundedIndex = Math.max(0, Math.min(plans.length - 1, nextIndex));
    setActivePlanIndex(boundedIndex);
    carouselRef.current?.scrollTo({
      x: getPlanScrollOffset(boundedIndex),
      animated: true,
    });
  };

  const handlePlansScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!plans.length) {
      setActivePlanIndex(0);
      return;
    }

    const nextIndex = Math.max(
      0,
      Math.min(plans.length - 1, Math.round(event.nativeEvent.contentOffset.x / cardStep))
    );
    setActivePlanIndex(nextIndex);
  };

  const loginLabel = user ? 'Abrir portal' : 'Iniciar sesión';
  const loginAction = () => router.push((user ? getAuthenticatedHome(user) : '/ventas/login') as never);
  const buyLabel = 'Elegir plan';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ImmersiveBackground isPhone={isPhone} />

      <SiteHeader
        compact={headerCompact}
        stacked={isPhone || isTablet}
        loginLabel={loginLabel}
        onBuy={() => (activePlan ? goToPlanCheckout(activePlan) : scrollToSection('planes'))}
        onLogin={loginAction}
        onNavigate={scrollToSection}
      />

      <PageScroller {...(pageScrollerProps as any)}>
        <View
          style={[
            styles.container,
            isPhone ? styles.containerPhone : undefined,
            isPhone ? { paddingTop: 108, gap: 52 } : undefined,
          ]}>
          <CheckoutReturnBanner
            confirmation={checkoutConfirm}
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

          <RevealView index={0} scrollY={nativeScrollY} viewportHeight={height} immediate>
            <View
              nativeID="inicio"
              style={[
                styles.heroSection,
                heroSideBySide ? styles.heroDesktop : undefined,
                isPhone ? styles.heroPhone : undefined,
                isPhone ? { minHeight: 680 } : undefined,
                isTablet && !heroSideBySide ? styles.heroTablet : undefined,
                Platform.OS === 'web'
                  ? ({
                      backgroundImage:
                        'linear-gradient(135deg, rgba(5, 8, 22, 0.54), rgba(10, 18, 45, 0.72)), radial-gradient(circle at 18% 20%, rgba(255, 45, 122, 0.18), transparent 28%), radial-gradient(circle at 78% 18%, rgba(0, 194, 255, 0.17), transparent 34%)',
                      boxShadow:
                        '0 0 0 1px rgba(245, 247, 255, 0.08), 0 36px 120px rgba(0, 0, 0, 0.46)',
                      scrollMarginTop: 108,
                    } as any)
                  : undefined,
              ]}>
              <View style={[styles.heroCopy, isPhone ? styles.heroCopyPhone : undefined]}>
                <View style={styles.heroKicker}>
                  <MaterialCommunityIcons name="transit-connection-variant" size={14} color={neonPalette.accent} />
                  <Text style={styles.heroKickerText}>CONTROL TOTAL DE LA OPERACIÓN</Text>
                </View>
                <Text
                  accessibilityRole="header"
                  style={[
                    styles.heroTitle,
                    isPhone ? styles.heroTitlePhone : undefined,
                    isTablet ? styles.heroTitleTablet : undefined,
                  ]}>
                  Tu flotilla, tu equipo y tus rutas. Todo bajo control.
                </Text>
                <Text
                  style={[
                    styles.heroSubtitle,
                    isPhone ? styles.heroSubtitlePhone : undefined,
                    isTablet ? styles.heroSubtitleTablet : undefined,
                  ]}>
                  Portal y app conectados para supervisar la operación, coordinar al equipo y conservar evidencia sin brincar entre sistemas.
                </Text>
                <HeroSignalRow compact={isPhone} />
                <View style={styles.heroActions}>
                  <ActionButton
                    label="Explorar planes"
                    icon="arrow-down"
                    onPress={() => scrollToSection('planes')}
                  />
                  <ActionButton
                    label="Conocer la plataforma"
                    icon="view-dashboard-outline"
                    variant="ghost"
                    onPress={() => scrollToSection('funcionalidades')}
                  />
                </View>
              </View>

              <DashboardMockup isPhone={isPhone} />
            </View>
          </RevealView>

          <View onLayout={registerNativeSection('funcionalidades')}>
            <RevealView index={1} scrollY={nativeScrollY} viewportHeight={height} style={styles.section}>
              <PlatformOverview compact={isPhone || isTablet} />
            </RevealView>
          </View>

          <View onLayout={registerNativeSection('descargar')}>
            <RevealView index={2} scrollY={nativeScrollY} viewportHeight={height} style={styles.section}>
              <AppDownloadSection onPortalPress={loginAction} />
            </RevealView>
          </View>

          <View onLayout={registerNativeSection('planes')}>
            <RevealView index={3} scrollY={nativeScrollY} viewportHeight={height} style={styles.section}>
              <View nativeID="planes" style={styles.anchorOffset}>
                <View style={styles.plansHeader}>
                  <SectionHeading
                    eyebrow="PLANES CLAROS, SIN LETRA CHIQUITA"
                    title="Elige la capacidad de tu flotilla"
                    intro="Compara mensualidad, unidades incluidas y módulos antes de crear tu cuenta. Tu selección se conserva durante todo el proceso."
                  />
                  <View style={styles.carouselControls}>
                    {plans.length ? (
                      <Text
                        accessibilityLiveRegion="polite"
                        style={[
                          styles.sectionEyebrow,
                          {
                            color: neonPalette.mutedStrong,
                            letterSpacing: 0.4,
                            minWidth: 42,
                            textAlign: 'center',
                          },
                        ]}>
                        {activePlanIndex + 1} / {plans.length}
                      </Text>
                    ) : null}
                    <RoundIconButton
                      accessibilityLabel="Plan anterior"
                      icon="chevron-left"
                      onPress={() => jumpToPlan(activePlanIndex - 1)}
                      disabled={!plans.length || activePlanIndex === 0}
                    />
                    <RoundIconButton
                      accessibilityLabel="Plan siguiente"
                      icon="chevron-right"
                      onPress={() => jumpToPlan(activePlanIndex + 1)}
                      disabled={!plans.length || activePlanIndex === plans.length - 1}
                    />
                  </View>
                </View>

                {plansLoading ? (
                  <View
                    style={[
                      styles.planCarousel,
                      isPhone ? styles.planCarouselPhone : undefined,
                      isDesktop ? styles.planCarouselDesktop : undefined,
                      isDesktop
                        ? { alignSelf: 'center', width: desktopCarouselWidth }
                        : undefined,
                      { alignItems: 'stretch' },
                    ]}>
                    {[0, 1, 2].map((i) => (
                      <PlanCardSkeleton key={i} width={cardWidth} />
                    ))}
                  </View>
                ) : plansError ? (
                  <View style={styles.plansEmpty}>
                    <MaterialCommunityIcons name="cloud-alert-outline" size={28} color={neonPalette.muted} />
                    <Text style={styles.plansEmptyTitle}>No pudimos cargar los planes</Text>
                    <Text style={styles.plansEmptyText}>{plansError}</Text>
                    <Pressable accessibilityRole="button" onPress={() => void loadPlans()} style={styles.plansRetryButton}>
                      <Text style={styles.plansRetryLabel}>Reintentar</Text>
                    </Pressable>
                  </View>
                ) : plans.length ? (
                  <ScrollView
                    ref={carouselRef}
                    horizontal
                    style={[
                      styles.planCarouselViewport,
                      isPhone ? styles.planCarouselViewportPhone : undefined,
                      isDesktop ? styles.planCarouselViewportDesktop : undefined,
                      isDesktop ? { maxWidth: desktopCarouselWidth } : undefined,
                    ]}
                    snapToInterval={cardStep}
                    snapToAlignment="start"
                    disableIntervalMomentum
                    decelerationRate="fast"
                    contentContainerStyle={[
                      styles.planCarousel,
                      isPhone ? styles.planCarouselPhone : undefined,
                      isDesktop ? styles.planCarouselDesktop : undefined,
                      { alignItems: 'stretch' },
                    ]}
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={handlePlansScrollEnd}>
                    {plans.map((plan, index) => (
                      <PlanCard
                        key={plan.id}
                        index={index}
                        plan={plan}
                        width={cardWidth}
                        compact={compactPlanCard}
                        active={activePlanIndex === index}
                        accent={getPlanAccent(plan, index)}
                        onPress={() => jumpToPlan(index)}
                        onBuy={() => goToPlanCheckout(plan)}
                        onTrial={isPublicDemoPlan(plan) ? () => goToPlanCheckout(plan, true) : undefined}
                        trialLabel={
                          isPublicDemoPlan(plan) && Number(plan.trialDays) > 0
                            ? `Usar demo ${plan.trialDays} días`
                            : null
                        }
                        userLabel={buyLabel}
                      />
                    ))}
                  </ScrollView>
                ) : (
                  <View style={styles.plansEmpty}>
                    <MaterialCommunityIcons name="clipboard-list-outline" size={28} color={neonPalette.muted} />
                    <Text style={styles.plansEmptyTitle}>No hay planes publicados</Text>
                    <Text style={styles.plansEmptyText}>
                      Los planes aparecerán aquí cuando el administrador los publique.
                    </Text>
                  </View>
                )}
              </View>
            </RevealView>
          </View>

          <RevealView index={4} scrollY={nativeScrollY} viewportHeight={height} style={styles.section}>
            <SectionHeading
              eyebrow="DE LA COMPRA A LA OPERACIÓN"
              title="Del plan elegido a una flotilla operando"
              intro="Crea tu cuenta, configura la empresa, conecta unidades y empieza a trabajar desde portal y app con la misma información."
              centered
            />
            <View style={[styles.processRail, isPhone || isTablet ? styles.processRailPhone : undefined]}>
              {processSteps.map((step, index) => (
                <ProcessStep
                  key={step.title}
                  index={index}
                  step={step}
                  isLast={index === processSteps.length - 1}
                  isPhone={isPhone || isTablet}
                />
              ))}
            </View>
          </RevealView>

          <View onLayout={registerNativeSection('confianza')}>
            <RevealView index={5} scrollY={nativeScrollY} viewportHeight={height} style={styles.section}>
              <View
                nativeID="confianza"
                style={[
                  styles.trustSection,
                  Platform.OS === 'web'
                    ? ({
                        backgroundImage:
                          'linear-gradient(135deg, rgba(9, 15, 34, 0.8), rgba(10, 17, 39, 0.92)), radial-gradient(circle at 15% 20%, rgba(0, 194, 255, 0.14), transparent 34%), radial-gradient(circle at 85% 55%, rgba(255, 45, 122, 0.12), transparent 35%)',
                        boxShadow: '0 0 0 1px rgba(245, 247, 255, 0.1), 0 24px 80px rgba(0,0,0,0.34)',
                        backdropFilter: 'blur(18px)',
                        scrollMarginTop: 108,
                      } as any)
                    : undefined,
                ]}>
                <SectionHeading
                  eyebrow="UNA SOLA FUENTE DE INFORMACIÓN"
                  title="Lo que configuras en el portal llega a la operación"
                  intro="Unidades, rutas, equipo, comunicación y evidencia comparten la misma cuenta para reducir capturas repetidas y herramientas aisladas."
                  centered
                />
                <View
                  style={[
                    styles.metricGrid,
                    isPhone ? styles.metricGridPhone : undefined,
                    isTablet ? styles.metricGridTablet : undefined,
                  ]}>
                  {trustMetrics.map((metric) => (
                    <View key={metric.label} style={[styles.metricCard, isTablet ? styles.metricCardTablet : undefined]}>
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
          </View>

          <RevealView index={6} scrollY={nativeScrollY} viewportHeight={height} style={styles.section}>
            <View
              nativeID="faq"
              style={[
                styles.faqShell,
                isDesktop ? styles.faqShellDesktop : undefined,
                Platform.OS === 'web'
                  ? ({
                      backgroundImage:
                        'linear-gradient(135deg, rgba(8, 13, 30, 0.86), rgba(10, 17, 39, 0.8)), radial-gradient(circle at 10% 45%, rgba(122, 60, 255, 0.16), transparent 31%)',
                      boxShadow: '0 0 0 1px rgba(245, 247, 255, 0.1), 0 22px 70px rgba(0, 0, 0, 0.34)',
                      backdropFilter: 'blur(18px)',
                      scrollMarginTop: 108,
                    } as any)
                  : undefined,
              ]}>
              {!isPhone ? (
                <View style={styles.supportVisual} pointerEvents="none">
                  <View style={styles.supportCard}>
                    <MaterialCommunityIcons name="headset" size={64} color={neonPalette.cyan} />
                    <View style={styles.supportBubble}>
                      <MaterialCommunityIcons name="help" size={22} color="#FFFFFF" />
                    </View>
                  </View>
                </View>
              ) : null}
              <View style={styles.faqContent}>
                <SectionHeading
                  eyebrow="ANTES DE ACTIVAR"
                  title="Resuelve las dudas que sí afectan la compra"
                  intro="Prueba, IVA, pagos, cancelación, alcance y soporte explicados antes de crear tu cuenta."
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