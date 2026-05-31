import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
import {
  COMMERCIAL_FAQS,
  COMMERCIAL_FEATURES,
  FALLBACK_COMMERCIAL_PLANS,
} from '@/src/constants/commercial';
import { useAppStore } from '@/src/store/use-app-store';
import type { CommercialPlan } from '@/src/types/app';
import { getAuthenticatedHome, isCustomerAccount } from '@/src/utils/account-routing';

const accentByTone = {
  info: '#FF245C',
  success: '#FF245C',
  warning: '#FF6B4A',
  danger: '#FF3B7A',
} as const;

const neonPalette = {
  background: '#060A14',
  backgroundAlt: '#0B1020',
  panel: 'rgba(15, 23, 42, 0.82)',
  panelStrong: 'rgba(22, 29, 52, 0.92)',
  panelSoft: 'rgba(255, 255, 255, 0.06)',
  line: 'rgba(255, 255, 255, 0.12)',
  lineStrong: 'rgba(255, 255, 255, 0.22)',
  text: '#F8FAFC',
  muted: '#9CAEC7',
  mutedSoft: '#64748B',
  accent: '#FF245C',
  accentSoft: 'rgba(255, 36, 92, 0.14)',
  accentGlow: 'rgba(255, 36, 92, 0.48)',
  violet: '#A855F7',
  cyan: '#23D5FF',
  lime: '#52F2A7',
  amber: '#FFD166',
};

const planVisualTones = [
  {
    edge: '#23D5FF',
    secondary: '#52F2A7',
    violet: '#A855F7',
    soft: 'rgba(35, 213, 255, 0.16)',
    secondarySoft: 'rgba(82, 242, 167, 0.12)',
    violetSoft: 'rgba(168, 85, 247, 0.14)',
    cursor: 'rgba(35, 213, 255, 0.34)',
  },
  {
    edge: '#A855F7',
    secondary: '#23D5FF',
    violet: '#FF245C',
    soft: 'rgba(168, 85, 247, 0.16)',
    secondarySoft: 'rgba(35, 213, 255, 0.12)',
    violetSoft: 'rgba(255, 36, 92, 0.13)',
    cursor: 'rgba(168, 85, 247, 0.34)',
  },
  {
    edge: '#52F2A7',
    secondary: '#23D5FF',
    violet: '#A855F7',
    soft: 'rgba(82, 242, 167, 0.15)',
    secondarySoft: 'rgba(35, 213, 255, 0.11)',
    violetSoft: 'rgba(168, 85, 247, 0.13)',
    cursor: 'rgba(82, 242, 167, 0.3)',
  },
  {
    edge: '#7C3AED',
    secondary: '#23D5FF',
    violet: '#52F2A7',
    soft: 'rgba(124, 58, 237, 0.17)',
    secondarySoft: 'rgba(35, 213, 255, 0.11)',
    violetSoft: 'rgba(82, 242, 167, 0.11)',
    cursor: 'rgba(124, 58, 237, 0.32)',
  },
] as const;

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}

function getPlanAccent(plan: CommercialPlan, index: number) {
  const fallback = [neonPalette.accent, '#FF6B4A', '#FF3B7A', '#FF245C'];
  return accentByTone[plan.accent] || fallback[index % fallback.length];
}

function getPlanVisualTone(index: number) {
  return planVisualTones[index % planVisualTones.length];
}

function buildPlanParams(plan: CommercialPlan, requestTrial = false) {
  return {
    planId: plan.id,
    trial: requestTrial ? '1' : '0',
  };
}

export function SalesScreen() {
  const { width, height } = useWindowDimensions();
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

  const cardWidth = isPhone ? Math.max(268, width - 42) : isDesktop ? 336 : 306;
  const cardStep = cardWidth + 14;
  const activePlan = plans[activePlanIndex] || plans[0];
  const activePlanVisual = getPlanVisualTone(activePlanIndex);

  const goToPlanCheckout = (plan: CommercialPlan, requestTrial = false) => {
    const params = buildPlanParams(plan, requestTrial);

    if (user && isCustomerAccount(user)) {
      router.push({
        pathname: '/portal',
        params,
      } as never);
      return;
    }

    const target = user ? getAuthenticatedHome(user) : '/ventas/registro';
    router.push({ pathname: target, params } as never);
  };

  const goToPlanLogin = (plan: CommercialPlan, requestTrial = false) => {
    router.push({
      pathname: '/ventas/login',
      params: buildPlanParams(plan, requestTrial),
    } as never);
  };

  const goToPlanRegister = (plan: CommercialPlan, requestTrial = false) => {
    router.push({
      pathname: '/ventas/registro',
      params: buildPlanParams(plan, requestTrial),
    } as never);
  };

  const primaryAction = user
    ? {
        label: isCustomerAccount(user) ? 'Abrir portal' : 'Ir a consola',
        icon: isCustomerAccount(user) ? 'account-circle-outline' : 'view-dashboard-outline',
        onPress: () => router.push(getAuthenticatedHome(user) as never),
      }
    : {
        label: 'Crear cuenta',
        icon: 'account-plus-outline',
        onPress: () => router.push('/ventas/registro' as never),
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

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.ambientWash} />
      <View style={styles.backgroundOrbTop} />
      <View style={styles.backgroundOrbMiddle} />
      <View style={styles.backgroundOrbBottom} />
      <View style={styles.cyanRail} />
      <View style={styles.magentaRail} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={Platform.OS === 'web'}
        scrollEventThrottle={16}
        onScroll={(event) => setScrollY(event.nativeEvent.contentOffset.y)}>
        <View style={styles.container}>
          <RevealView index={0} scrollY={scrollY} viewportHeight={height} style={styles.navbar} immediate>
            <BrandLogo
              size={isTablet ? 'md' : 'sm'}
              subtitle={isTablet ? 'Ventas y portal cliente.' : undefined}
              align="left"
            />

            <View style={styles.navActions}>
              {!user ? (
                <IconButton
                  label="Entrar"
                  icon="login"
                  variant="ghost"
                  onPress={() => router.push('/ventas/login' as never)}
                />
              ) : null}
              <IconButton
                label={primaryAction.label}
                icon={primaryAction.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                onPress={primaryAction.onPress}
              />
            </View>
          </RevealView>

          <RevealView
            index={1}
            scrollY={scrollY}
            viewportHeight={height}
            style={[
              styles.heroStage,
              isDesktop ? styles.heroStageDesktop : undefined,
              isPhone ? styles.heroStagePhone : undefined,
            ]}
            immediate>
            <NeonGrid />
            <View style={[styles.heroCenter, isPhone ? styles.heroCenterPhone : undefined]}>
              <View style={styles.heroKicker}>
                <MaterialCommunityIcons name="star-four-points" size={14} color={neonPalette.accent} />
                <Text style={styles.heroKickerText}>SOFTWARE COMERCIAL PARA FLOTILLAS</Text>
              </View>
              <Text style={[styles.heroTitle, isPhone ? styles.heroTitlePhone : undefined]}>ManeComb</Text>
              <Text style={[styles.heroSubtitle, isPhone ? styles.heroSubtitlePhone : undefined]}>
                Planes, activación, facturas y descargas en un mismo flujo.
              </Text>
              <View style={styles.heroActions}>
                <IconButton
                  label={primaryAction.label}
                  icon={primaryAction.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                  onPress={primaryAction.onPress}
                />
                {!user ? (
                  <IconButton
                    label="Ya tengo cuenta"
                    icon="shield-account-outline"
                    variant="ghost"
                    onPress={() => router.push('/ventas/login' as never)}
                  />
                ) : null}
              </View>
            </View>

            {!isPhone ? (
              <View style={styles.heroScene}>
                <View style={[styles.sceneTile, styles.sceneTileLeft]}>
                  <MaterialCommunityIcons name="bus-multiple" size={28} color={neonPalette.cyan} />
                  <Text style={styles.sceneTileText}>GPS</Text>
                </View>
                <View style={[styles.sceneTile, styles.sceneTileRight]}>
                  <MaterialCommunityIcons name="file-document-check-outline" size={28} color={neonPalette.lime} />
                  <Text style={styles.sceneTileText}>Factura</Text>
                </View>
                <View style={styles.sceneCore}>
                  <View style={styles.sceneCoreRing}>
                    <MaterialCommunityIcons name="routes" size={36} color="#FFFFFF" />
                  </View>
                  <Text style={styles.sceneCoreText}>Portal cliente</Text>
                </View>
                <View style={[styles.sceneTile, styles.sceneTileBottom]}>
                  <MaterialCommunityIcons name="download-lock-outline" size={28} color={neonPalette.accent} />
                  <Text style={styles.sceneTileText}>Descarga</Text>
                </View>
              </View>
            ) : null}
          </RevealView>

          <RevealView
            index={2}
            scrollY={scrollY}
            viewportHeight={height}
            style={[styles.logoStrip, isPhone ? styles.logoStripPhone : undefined]}>
            {['Mapa en vivo', 'Radio PTT', 'Historial', 'Facturas', 'Descargas'].map((item) => (
              <View key={item} style={styles.logoPill}>
                <Text style={styles.logoPillText}>{item}</Text>
              </View>
            ))}
          </RevealView>

          <RevealView
            index={3}
            scrollY={scrollY}
            viewportHeight={height}
            style={[styles.twoColumnSection, isDesktop ? styles.twoColumnDesktop : undefined]}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionEyebrow}>OPERACIÓN Y POSTVENTA</Text>
              <Text style={styles.sectionTitle}>Ventas y postventa.</Text>
            </View>
            <Text style={styles.sectionIntro}>
              El recorrido queda directo: elegir plan, crear cuenta, comprar y abrir portal.
            </Text>
          </RevealView>

          <RevealView
            index={4}
            scrollY={scrollY}
            viewportHeight={height}
            style={[styles.featureGrid, isPhone ? styles.featureGridPhone : undefined]}>
            {COMMERCIAL_FEATURES.slice(0, 3).map((feature, index) => {
              const color = [neonPalette.cyan, neonPalette.lime, neonPalette.accent][index];

              return (
                <Animated.View
                  key={feature.title}
                  style={[
                    styles.featureCard,
                    isPhone ? styles.featureCardPhone : undefined,
                    { borderColor: `${color}55` },
                    Platform.OS === 'web'
                      ? ({
                          transitionDuration: `${320 + index * 70}ms`,
                          transitionProperty: 'transform, box-shadow, border-color',
                          backdropFilter: 'blur(14px)',
                        } as any)
                      : null,
                  ]}>
                  <View style={[styles.featureIcon, { backgroundColor: `${color}16` }]}>
                    <MaterialCommunityIcons
                      name={feature.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                      size={24}
                      color={color}
                    />
                  </View>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureBody}>{feature.body}</Text>
                </Animated.View>
              );
            })}
          </RevealView>

          <RevealView index={5} scrollY={scrollY} viewportHeight={height} style={styles.plansHeader}>
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
          </RevealView>

          <RevealView index={6} scrollY={scrollY} viewportHeight={height}>
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
                  userLabel={user ? 'Ver portal' : 'Comprar'}
                  trialLabel={user ? 'Probar en portal' : `Probar ${plan.trialDays || 7} días`}
                />
              ))}
            </ScrollView>
          </RevealView>

          <RevealView index={7} scrollY={scrollY} viewportHeight={height} style={styles.planDots}>
            {plans.map((plan, index) => (
              <Pressable
                key={plan.id}
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
          </RevealView>

          <RevealView
            index={8}
            scrollY={scrollY}
            viewportHeight={height}
            style={[
              styles.selectedPlanBand,
              isPhone ? styles.selectedPlanBandPhone : undefined,
              {
                borderColor: `${activePlanVisual.edge}88`,
              },
              Platform.OS === 'web' ? null : { shadowColor: activePlanVisual.edge },
              Platform.OS === 'web'
                ? ({
                    backgroundImage: `linear-gradient(120deg, rgba(10, 18, 36, 0.9), ${activePlanVisual.soft}, ${activePlanVisual.violetSoft})`,
                    backdropFilter: 'blur(16px)',
                    boxShadow: `0 0 0 1px ${activePlanVisual.edge}26, 0 0 28px ${activePlanVisual.edge}35, 0 20px 54px rgba(0, 0, 0, 0.3)`,
                  } as any)
                : { backgroundColor: activePlanVisual.soft },
            ]}>
            <View>
              <Text style={[styles.bandEyebrow, { color: activePlanVisual.edge }]}>SELECCIÓN ACTUAL</Text>
              <Text style={styles.bandTitle}>{activePlan?.name || 'Plan comercial'}</Text>
            </View>
            <View style={[styles.bandMeta, isPhone ? styles.bandMetaPhone : undefined]}>
              <Text style={styles.bandPrice}>{formatCurrency(activePlan?.price || 0)}</Text>
              <Text style={styles.bandCopy}>
                {activePlan?.trialEligible ? `Prueba de ${activePlan.trialDays || 7} días` : 'Listo para activar'}
              </Text>
            </View>
          </RevealView>

          <RevealView
            index={9}
            scrollY={scrollY}
            viewportHeight={height}
            style={[
              styles.accessHub,
              isDesktop ? styles.accessHubDesktop : undefined,
              isPhone ? styles.accessHubPhone : undefined,
              { borderColor: `${activePlanVisual.edge}66` },
              Platform.OS === 'web'
                ? ({
                    backgroundImage: `linear-gradient(135deg, rgba(8, 15, 28, 0.9), ${activePlanVisual.violetSoft}, rgba(12, 20, 42, 0.82))`,
                    boxShadow: `0 0 0 1px ${activePlanVisual.edge}22, 0 0 30px ${activePlanVisual.edge}22, 0 24px 70px rgba(0, 0, 0, 0.34)`,
                    backdropFilter: 'blur(18px)',
                  } as any)
                : null,
            ]}>
            <View pointerEvents="none" style={[styles.accessHubGlow, { backgroundColor: activePlanVisual.soft }]} />
            <View style={styles.accessCopy}>
              <Text style={[styles.accessEyebrow, { color: activePlanVisual.edge }]}>
                PRODUCTO + ACCESO + DASHBOARD
              </Text>
              <Text style={styles.accessTitle}>Producto, cuenta y portal conectados.</Text>
              <Text style={styles.accessBody}>
                Compra, registro y acceso al portal conservan el contexto del plan seleccionado.
              </Text>

              <View style={styles.accessChips}>
                {['Registro directo', 'Login con contexto', 'Dashboard unificado'].map((item) => (
                  <View key={item} style={styles.accessChip}>
                    <Text style={styles.accessChipText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View
              style={[
                styles.accessCard,
                isPhone ? styles.accessCardPhone : undefined,
                { borderColor: `${activePlanVisual.edge}44` },
                Platform.OS === 'web'
                  ? ({
                      backgroundImage: `linear-gradient(140deg, rgba(20, 30, 57, 0.82), ${activePlanVisual.soft})`,
                      backdropFilter: 'blur(14px)',
                    } as any)
                  : null,
              ]}>
              <View style={styles.accessCardTop}>
                <View style={[styles.accessCardSymbol, { backgroundColor: activePlanVisual.soft }]}>
                  <MaterialCommunityIcons name="view-grid-plus-outline" size={20} color={activePlanVisual.edge} />
                </View>
                <View style={styles.accessCardCopy}>
                  <Text style={styles.accessCardEyebrow}>Plan activo en pantalla</Text>
                  <Text style={styles.accessCardTitle}>{activePlan?.name || 'Plan comercial'}</Text>
                  <Text style={styles.accessCardMeta}>
                    {formatCurrency(activePlan?.price || 0)} al mes | {activePlan?.units || 0} unidades
                  </Text>
                </View>
              </View>

              <View style={[styles.accessHighlights, isPhone ? styles.accessHighlightsPhone : undefined]}>
                <View style={[styles.accessHighlight, isPhone ? styles.accessHighlightPhone : undefined]}>
                  <Text style={styles.accessHighlightLabel}>Acceso</Text>
                  <Text style={styles.accessHighlightValue}>{user ? 'Portal listo' : 'Nuevo o existente'}</Text>
                </View>
                <View style={[styles.accessHighlight, isPhone ? styles.accessHighlightPhone : undefined]}>
                  <Text style={styles.accessHighlightLabel}>Entrada</Text>
                  <Text style={styles.accessHighlightValue}>{user ? 'Dashboard cliente' : 'Login o registro'}</Text>
                </View>
                <View style={[styles.accessHighlight, isPhone ? styles.accessHighlightPhone : undefined]}>
                  <Text style={styles.accessHighlightLabel}>Prueba</Text>
                  <Text style={styles.accessHighlightValue}>
                    {activePlan?.trialEligible ? `${activePlan.trialDays || 7} días` : 'Compra directa'}
                  </Text>
                </View>
              </View>

              <View style={styles.accessButtonStack}>
                {user ? (
                  <>
                    <AccessButton
                      label="Abrir portal"
                      icon="view-dashboard-outline"
                      onPress={() => goToPlanCheckout(activePlan)}
                    />
                    <AccessButton
                      label="Comprar plan"
                      icon="cart-outline"
                      variant="ghost"
                      onPress={() => goToPlanCheckout(activePlan)}
                    />
                    {activePlan?.trialEligible ? (
                      <AccessButton
                        label={`Probar ${activePlan.trialDays || 7} días`}
                        icon="flask-outline"
                        variant="outline"
                        onPress={() => goToPlanCheckout(activePlan, true)}
                      />
                    ) : null}
                  </>
                ) : (
                  <>
                    <AccessButton
                      label="Crear cuenta"
                      icon="account-plus-outline"
                      onPress={() => goToPlanRegister(activePlan)}
                    />
                    <AccessButton
                      label="Iniciar sesión"
                      icon="login"
                      variant="ghost"
                      onPress={() => goToPlanLogin(activePlan)}
                    />
                    {activePlan?.trialEligible ? (
                      <AccessButton
                        label={`Probar ${activePlan.trialDays || 7} días`}
                        icon="credit-card-clock-outline"
                        variant="outline"
                        onPress={() => goToPlanRegister(activePlan, true)}
                      />
                    ) : null}
                  </>
                )}
              </View>
            </View>
          </RevealView>

          <RevealView
            index={10}
            scrollY={scrollY}
            viewportHeight={height}
            style={[styles.faqSection, isDesktop ? styles.faqDesktop : undefined]}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionEyebrow}>FAQ</Text>
              <Text style={styles.sectionTitle}>Preguntas antes de comprar.</Text>
            </View>
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
          </RevealView>

          <RevealView index={11} scrollY={scrollY} viewportHeight={height} style={styles.finalCta}>
            <NeonGrid subtle />
            <Text style={styles.finalCtaTitle}>Compra y abre el portal.</Text>
            <Text style={styles.finalCtaBody}>
              Historial, factura y descargas quedan ligados a la cuenta.
            </Text>
            <IconButton
              label={primaryAction.label}
              icon={primaryAction.icon as keyof typeof MaterialCommunityIcons.glyphMap}
              onPress={primaryAction.onPress}
            />
          </RevealView>
        </View>
      </ScrollView>
    </View>
  );
}

function NeonGrid({ subtle = false }: { subtle?: boolean }) {
  return (
    <View pointerEvents="none" style={[styles.gridLayer, subtle ? styles.gridLayerSubtle : undefined]}>
      {Array.from({ length: 7 }).map((_, index) => (
        <View
          key={`h-${index}`}
          style={[
            styles.gridLineHorizontal,
            {
              top: `${12 + index * 13}%`,
              opacity: subtle ? 0.08 : 0.12,
            },
          ]}
        />
      ))}
      {Array.from({ length: 8 }).map((_, index) => (
        <View
          key={`v-${index}`}
          style={[
            styles.gridLineVertical,
            {
              left: `${8 + index * 12}%`,
              opacity: subtle ? 0.08 : 0.12,
            },
          ]}
        />
      ))}
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
                      ? `0 0 0 1px ${visual.edge}88, 0 0 24px ${visual.edge}3A, 0 22px 62px rgba(0, 0, 0, 0.38)`
                      : `0 0 0 1px ${visual.edge}22, 0 16px 42px rgba(0, 0, 0, 0.24)`,
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
                        ? `0 0 22px ${neonPalette.accentGlow}, 0 16px 36px rgba(255, 36, 92, 0.28)`
                        : `0 0 16px ${neonPalette.accentGlow}, 0 12px 30px rgba(255, 36, 92, 0.2)`,
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
            onPress={onTrial}
            style={(state) => {
              const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
              const pressed = state.pressed;

              return [
                styles.planTrialButton,
                {
                  borderColor: hovered ? neonPalette.accent : `${neonPalette.accent}88`,
                  backgroundColor: hovered ? 'rgba(255, 36, 92, 0.2)' : neonPalette.accentSoft,
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

function IconButton({
  label,
  icon,
  onPress,
  variant = 'solid',
}: {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  variant?: 'solid' | 'ghost';
}) {
  const solid = variant === 'solid';

  return (
    <Pressable
      onPress={onPress}
      style={(state) => {
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
        const pressed = state.pressed;

        return [
          styles.iconButton,
          solid ? styles.iconButtonSolid : styles.iconButtonGhost,
          hovered ? styles.hoverLift : undefined,
          Platform.OS === 'web'
            ? ({
                cursor: 'pointer',
                transitionDuration: '240ms',
                transitionProperty: 'transform, box-shadow, background-color, border-color',
                boxShadow: solid && hovered ? `0 0 24px ${neonPalette.accentGlow}` : undefined,
              } as any)
            : null,
          pressed ? styles.buttonPressed : undefined,
        ];
      }}>
      <MaterialCommunityIcons
        name={icon}
        size={18}
        color={solid ? '#FFFFFF' : neonPalette.text}
      />
      <Text style={[styles.iconButtonText, solid ? styles.iconButtonTextSolid : undefined]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function RoundIconButton({
  icon,
  onPress,
  disabled,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={(state) => {
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
        const pressed = state.pressed;

        return [
          styles.roundButton,
          hovered && !disabled ? styles.hoverLift : undefined,
          disabled ? styles.roundButtonDisabled : undefined,
          Platform.OS === 'web'
            ? ({
                cursor: disabled ? 'default' : 'pointer',
                transitionDuration: '240ms',
                transitionProperty: 'transform, box-shadow, border-color',
                boxShadow: hovered && !disabled ? `0 0 18px ${neonPalette.cyan}33` : undefined,
              } as any)
            : null,
          pressed && !disabled ? styles.buttonPressed : undefined,
        ];
      }}>
      <MaterialCommunityIcons
        name={icon}
        size={24}
        color={disabled ? neonPalette.mutedSoft : neonPalette.text}
      />
    </Pressable>
  );
}

function AccessButton({
  icon,
  label,
  onPress,
  variant = 'solid',
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  variant?: 'solid' | 'ghost' | 'outline';
}) {
  const solid = variant === 'solid';
  const ghost = variant === 'ghost';

  return (
    <Pressable
      onPress={onPress}
      style={(state) => {
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
        const pressed = state.pressed;

        return [
          styles.accessButton,
          solid ? styles.accessButtonSolid : ghost ? styles.accessButtonGhost : styles.accessButtonOutline,
          hovered ? styles.hoverLift : undefined,
          Platform.OS === 'web'
            ? ({
                cursor: 'pointer',
                transitionDuration: '260ms',
                transitionProperty: 'transform, box-shadow, border-color, background-color',
                boxShadow: hovered
                  ? solid
                    ? `0 0 22px ${neonPalette.accentGlow}`
                    : `0 0 16px ${neonPalette.accent}35`
                  : undefined,
              } as any)
            : null,
          pressed ? styles.buttonPressed : undefined,
        ];
      }}>
      <MaterialCommunityIcons
        name={icon}
        size={18}
        color={solid ? '#FFFFFF' : ghost ? neonPalette.text : neonPalette.accent}
      />
      <Text
        numberOfLines={2}
        style={[
          styles.accessButtonLabel,
          solid
            ? styles.accessButtonLabelSolid
            : ghost
              ? styles.accessButtonLabelGhost
              : styles.accessButtonLabelOutline,
        ]}>
        {label}
      </Text>
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
      outputRange: [0, 120],
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
      onPress={onPress}
      style={(state) => {
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
        const pressed = state.pressed;

        return [
          styles.faqItem,
          open ? styles.faqItemOpen : undefined,
          hovered ? styles.faqItemHover : undefined,
          Platform.OS === 'web'
            ? ({
                cursor: 'pointer',
                transitionDuration: '240ms',
                transitionProperty: 'transform, box-shadow, border-color, background-color, background-image',
                backdropFilter: 'blur(14px)',
                backgroundImage: open
                  ? 'linear-gradient(120deg, rgba(82, 242, 167, 0.095), rgba(35, 213, 255, 0.055), rgba(168, 85, 247, 0.045))'
                  : hovered
                    ? 'linear-gradient(120deg, rgba(255, 255, 255, 0.07), rgba(35, 213, 255, 0.045))'
                    : undefined,
                boxShadow: open
                  ? `0 0 0 1px ${neonPalette.lime}22, 0 0 22px rgba(82, 242, 167, 0.16), 0 16px 42px rgba(0, 0, 0, 0.2)`
                  : hovered
                    ? `0 0 18px rgba(82, 242, 167, 0.14), 0 12px 34px rgba(0, 0, 0, 0.18)`
                    : undefined,
              } as any)
            : null,
          pressed ? styles.buttonPressed : undefined,
        ];
      }}>
      <View style={styles.faqQuestionRow}>
        <Text style={styles.faqQuestion}>{question}</Text>
        <Animated.View style={iconStyle}>
          <MaterialCommunityIcons
            name={open ? 'minus' : 'plus'}
            size={18}
            color={open ? neonPalette.lime : neonPalette.muted}
          />
        </Animated.View>
      </View>
      <Animated.View style={[styles.faqAnswerWrap, answerStyle]}>
        <Text style={styles.faqAnswer}>{answer}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: neonPalette.background,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 56,
  },
  container: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 30,
  },
  ambientWash: {
    position: 'absolute',
    top: -140,
    left: 0,
    right: 0,
    bottom: -140,
    backgroundColor: 'rgba(14, 10, 38, 0.68)',
  },
  backgroundOrbTop: {
    position: 'absolute',
    top: -180,
    right: -180,
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: 'rgba(255, 36, 92, 0.12)',
  },
  backgroundOrbMiddle: {
    position: 'absolute',
    top: 230,
    left: -240,
    width: 640,
    height: 640,
    borderRadius: 320,
    backgroundColor: 'rgba(35, 213, 255, 0.08)',
  },
  backgroundOrbBottom: {
    position: 'absolute',
    right: -260,
    bottom: -260,
    width: 680,
    height: 680,
    borderRadius: 340,
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
  },
  cyanRail: {
    position: 'absolute',
    top: 160,
    left: -120,
    right: -120,
    height: 1,
    backgroundColor: 'rgba(35, 213, 255, 0.16)',
    transform: [{ rotate: '-8deg' }],
  },
  magentaRail: {
    position: 'absolute',
    top: 420,
    left: -120,
    right: -120,
    height: 1,
    backgroundColor: 'rgba(255, 36, 92, 0.14)',
    transform: [{ rotate: '6deg' }],
  },
  navbar: {
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  navActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  iconButton: {
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 15,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  iconButtonSolid: {
    backgroundColor: neonPalette.accent,
    borderWidth: 1,
    borderColor: neonPalette.accent,
    ...(Platform.OS === 'web'
      ? {}
      : {
          shadowColor: neonPalette.accent,
          shadowOpacity: 0.34,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 4,
        }),
  },
  iconButtonGhost: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: neonPalette.line,
  },
  iconButtonText: {
    color: neonPalette.text,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
    minWidth: 0,
  },
  iconButtonTextSolid: {
    color: '#FFFFFF',
  },
  heroStage: {
    minHeight: 500,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: neonPalette.line,
    overflow: 'hidden',
    backgroundColor: 'rgba(7, 12, 25, 0.76)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 30,
  },
  heroStageDesktop: {
    minHeight: 540,
  },
  heroStagePhone: {
    minHeight: 360,
    paddingHorizontal: 12,
    paddingVertical: 24,
  },
  heroCenter: {
    width: '100%',
    maxWidth: 680,
    alignItems: 'center',
    gap: 13,
    zIndex: 2,
  },
  heroCenterPhone: {
    gap: 11,
  },
  heroKicker: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 36, 92, 0.42)',
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
    fontSize: 54,
    lineHeight: 60,
    fontWeight: '900',
    textAlign: 'center',
  },
  heroTitlePhone: {
    fontSize: 38,
    lineHeight: 42,
  },
  heroSubtitle: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 620,
  },
  heroSubtitlePhone: {
    fontSize: 14,
    lineHeight: 21,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  heroScene: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 28,
    height: 190,
    zIndex: 1,
  },
  sceneCore: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 36,
    width: 152,
    height: 102,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.48)',
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web'
      ? {}
      : {
          shadowColor: neonPalette.violet,
          shadowOpacity: 0.26,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 5,
        }),
    transform: [{ rotate: '-8deg' }],
  },
  sceneCoreRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  sceneCoreText: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sceneTile: {
    position: 'absolute',
    width: 120,
    height: 66,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: neonPalette.line,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sceneTileLeft: {
    left: '16%',
    bottom: 86,
    transform: [{ rotate: '-12deg' }],
  },
  sceneTileRight: {
    right: '16%',
    bottom: 96,
    transform: [{ rotate: '10deg' }],
  },
  sceneTileBottom: {
    alignSelf: 'center',
    bottom: 0,
    transform: [{ rotate: '7deg' }],
  },
  sceneTileText: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  gridLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
  },
  gridLayerSubtle: {
    opacity: 0.8,
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: -80,
    right: -80,
    height: 1,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '12deg' }],
  },
  gridLineVertical: {
    position: 'absolute',
    top: -80,
    bottom: -80,
    width: 1,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '12deg' }],
  },
  logoStrip: {
    minHeight: 40,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoStripPhone: {
    justifyContent: 'flex-start',
  },
  logoPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: neonPalette.line,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  logoPillText: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  twoColumnSection: {
    gap: 10,
  },
  twoColumnDesktop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  sectionCopy: {
    gap: 6,
    flex: 1,
  },
  sectionEyebrow: {
    color: neonPalette.accent,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  sectionTitle: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    maxWidth: 560,
  },
  sectionIntro: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 440,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  featureGridPhone: {
    flexDirection: 'column',
  },
  featureCard: {
    flex: 1,
    minWidth: 220,
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    gap: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.66)',
    ...(Platform.OS === 'web'
      ? {}
      : {
          shadowColor: '#000000',
          shadowOpacity: 0.16,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
        }),
  },
  featureCardPhone: {
    minWidth: 0,
    width: '100%',
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 16.5,
    fontWeight: '900',
  },
  featureBody: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13.5,
    lineHeight: 21,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
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
  planCardActive: {
    transform: [{ translateY: -4 }],
  },
  planSelectedHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1,
    opacity: 0.8,
  },
  planCursorGlow: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
  },
  planGradientOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  planGradientOrbCyan: {
    left: -58,
    bottom: -76,
    width: 190,
    height: 190,
    backgroundColor: 'rgba(35, 213, 255, 0.08)',
  },
  planGradientOrbViolet: {
    right: -52,
    top: -62,
    width: 180,
    height: 180,
    backgroundColor: 'rgba(168, 85, 247, 0.13)',
  },
  planGradientOrbLime: {
    right: 18,
    bottom: 76,
    width: 132,
    height: 132,
    backgroundColor: 'rgba(82, 242, 167, 0.1)',
    opacity: 0.7,
  },
  planGlow: {
    position: 'absolute',
    top: -46,
    right: -22,
    width: 170,
    height: 170,
    borderRadius: 85,
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
    marginTop: -24,
  },
  planDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  planDotActive: {
    width: 20,
  },
  selectedPlanBand: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 36, 92, 0.42)',
    backgroundColor: 'rgba(255, 36, 92, 0.12)',
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web'
      ? {}
      : {
          shadowColor: neonPalette.accent,
          shadowOpacity: 0.16,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 12 },
        }),
  },
  selectedPlanBandPhone: {
    gap: 10,
  },
  bandEyebrow: {
    color: neonPalette.accent,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  bandTitle: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
  },
  bandMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  bandMetaPhone: {
    alignItems: 'flex-start',
  },
  bandPrice: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
  },
  bandCopy: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  accessHub: {
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(8, 15, 28, 0.82)',
    padding: 20,
    gap: 18,
    overflow: 'hidden',
  },
  accessHubGlow: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 360,
    height: 360,
    borderRadius: 180,
  },
  accessHubPhone: {
    padding: 16,
  },
  accessHubDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  accessCopy: {
    flex: 1,
    gap: 12,
  },
  accessEyebrow: {
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  accessTitle: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '900',
    maxWidth: 560,
  },
  accessBody: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13.5,
    lineHeight: 22,
    maxWidth: 560,
  },
  accessChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  accessChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: neonPalette.line,
    backgroundColor: 'rgba(255, 255, 255, 0.075)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  accessChipText: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
  },
  accessCard: {
    flex: 1,
    minWidth: 300,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(20, 30, 57, 0.8)',
    padding: 18,
    gap: 14,
    ...(Platform.OS === 'web'
      ? {}
      : {
          shadowColor: '#000000',
          shadowOpacity: 0.18,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 12 },
        }),
  },
  accessCardPhone: {
    minWidth: 0,
    width: '100%',
  },
  accessCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accessCardSymbol: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neonPalette.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  accessCardCopy: {
    flex: 1,
    gap: 3,
  },
  accessCardEyebrow: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  accessCardTitle: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '900',
  },
  accessCardMeta: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  accessHighlights: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  accessHighlightsPhone: {
    flexDirection: 'column',
  },
  accessHighlight: {
    flex: 1,
    minWidth: 92,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: neonPalette.line,
    backgroundColor: 'rgba(255,255,255,0.055)',
    padding: 12,
    gap: 4,
  },
  accessHighlightPhone: {
    minWidth: 0,
  },
  accessHighlightLabel: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  accessHighlightValue: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  accessButtonStack: {
    gap: 8,
  },
  accessButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  accessButtonSolid: {
    backgroundColor: neonPalette.accent,
    borderColor: neonPalette.accent,
  },
  accessButtonGhost: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: neonPalette.line,
  },
  accessButtonOutline: {
    backgroundColor: neonPalette.accentSoft,
    borderColor: 'rgba(255, 36, 92, 0.48)',
  },
  accessButtonLabel: {
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    minWidth: 0,
    textAlign: 'center',
  },
  accessButtonLabelSolid: {
    color: '#FFFFFF',
  },
  accessButtonLabelGhost: {
    color: neonPalette.text,
  },
  accessButtonLabelOutline: {
    color: neonPalette.accent,
  },
  faqSection: {
    gap: 20,
  },
  faqDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  faqList: {
    flex: 1.2,
    gap: 12,
  },
  faqItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: neonPalette.line,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    padding: 16,
    gap: 10,
    overflow: 'hidden',
  },
  faqItemOpen: {
    borderColor: 'rgba(82, 242, 167, 0.34)',
    backgroundColor: 'rgba(82, 242, 167, 0.07)',
  },
  faqItemHover: {
    borderColor: 'rgba(82, 242, 167, 0.3)',
    ...(Platform.OS === 'web'
      ? {}
      : {
          shadowColor: neonPalette.lime,
          shadowOpacity: 0.18,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
        }),
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
    color: 'rgba(207, 218, 235, 0.78)',
    fontFamily: Typography.body,
    fontSize: 13.5,
    lineHeight: 21,
    paddingTop: 2,
  },
  finalCta: {
    minHeight: 190,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 36, 92, 0.38)',
    backgroundColor: 'rgba(70, 12, 27, 0.58)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
    ...(Platform.OS === 'web'
      ? {}
      : {
          shadowColor: neonPalette.accent,
          shadowOpacity: 0.16,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 14 },
        }),
  },
  finalCtaTitle: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    textAlign: 'center',
    maxWidth: 680,
  },
  finalCtaBody: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 560,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  hoverLift: {
    transform: [{ translateY: -2 }, { scale: 1.02 }],
  },
});
