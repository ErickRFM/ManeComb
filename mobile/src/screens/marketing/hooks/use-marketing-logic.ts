import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router } from 'expo-router';
import { useShallow } from 'zustand/react/shallow';
import { FALLBACK_COMMERCIAL_PLANS } from '@/src/constants/commercial';
import { createCommercialCheckoutRequest, getCommercialPlansRequest } from '@/src/api/client';
import { useAppStore } from '@/src/store/use-app-store';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { CommercialCheckoutPayload, CommercialPlan } from '@/src/types/app';
import { isStrongPassword } from '@/src/utils/password-strength';
import { initialCheckoutState } from '../constants';
import { marketingPalettes, createStyles } from '../styles';

export function useMarketingLogic() {
  const { setThemeMode, themeMode } = useAppTheme();
  const { register, signIn, user } = useAppStore(useShallow((s) => ({ register: s.register, signIn: s.signIn, user: s.user })));
  const { width } = useWindowDimensions();

  const isPhone = width < 760;
  const isCompact = width < 1120;
  const palette = themeMode === 'dark' ? marketingPalettes.dark : marketingPalettes.light;
  const styles = useMemo(() => createStyles(palette, isCompact, isPhone, width), [palette, isCompact, isPhone, width]);

  const scrollRef = useRef<ScrollView>(null);
  const plansCarouselRef = useRef<ScrollView>(null);
  const [sectionOffsets, setSectionOffsets] = useState({ plans: 0, checkout: 0 });
  const [plans, setPlans] = useState<CommercialPlan[]>(FALLBACK_COMMERCIAL_PLANS);
  const [checkout, setCheckout] = useState<CommercialCheckoutPayload>(initialCheckoutState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accessMode, setAccessMode] = useState<'login' | 'register'>('register');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [helperMessage, setHelperMessage] = useState<string | null>(null);

  useEffect(() => {
    void getCommercialPlansRequest().then(res => {
      if (res.length) {
        setPlans(res);
        setCheckout(c => ({ ...c, planId: res[1]?.id || res[0].id }));
      }
    });
  }, []);

  const selectedPlan = plans.find(p => p.id === checkout.planId) || plans[0];
  const selectedPlanIndex = Math.max(plans.findIndex(p => p.id === selectedPlan.id), 0);
  const planCardWidth = isPhone ? Math.max(280, Math.min(width - 60, 360)) : 320;
  const planCardStep = planCardWidth + 24;

  const jumpTo = (y: number) => scrollRef.current?.scrollTo({ y: y - 20, animated: true });

  const handlePlansScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.max(0, Math.min(plans.length - 1, Math.round(event.nativeEvent.contentOffset.x / planCardStep)));
    const nextPlan = plans[nextIndex];
    if (nextPlan && nextPlan.id !== checkout.planId) setCheckout(c => ({ ...c, planId: nextPlan.id }));
  };

  const handleSubmit = async () => {
    setHelperMessage(null);
    if (!checkout.companyName.trim() || !checkout.email.trim() || !checkout.contactName.trim()) {
      setHelperMessage('Por favor completa los datos básicos de contacto.');
      return;
    }

    if (!user) {
      if (!password.trim()) { setHelperMessage('Crea una contraseña para tu acceso.'); return; }
      if (accessMode === 'register' && password !== passwordConfirm) { setHelperMessage('Las contraseñas no coinciden.'); return; }
      if (accessMode === 'register' && !isStrongPassword(password)) { setHelperMessage('Contraseña débil. Intenta con algo más complejo.'); return; }
    }

    setIsSubmitting(true);
    try {
      if (!user) {
        const authRes = accessMode === 'login'
          ? await signIn(checkout.email.trim(), password.trim(), true)
          : await register({ name: checkout.contactName.trim(), email: checkout.email.trim(), phone: checkout.phone.trim(), password: password.trim(), companyName: checkout.companyName.trim(), accountType: 'company_owner' }, true);
        if (!authRes.ok) throw new Error(authRes.message);
      }
      const order = await createCommercialCheckoutRequest(checkout);
      router.push('/perfil-comprador');
      if (order.checkoutUrl) await Linking.openURL(order.checkoutUrl);
    } catch (e: any) {
      setHelperMessage(e.message || 'Error al procesar la solicitud.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    themeMode,
    setThemeMode,
    palette,
    styles,
    width,
    isPhone,
    isCompact,
    scrollRef,
    plansCarouselRef,
    sectionOffsets,
    setSectionOffsets,
    plans,
    checkout,
    setCheckout,
    isSubmitting,
    accessMode,
    setAccessMode,
    password,
    setPassword,
    passwordConfirm,
    setPasswordConfirm,
    helperMessage,
    selectedPlan,
    selectedPlanIndex,
    planCardWidth,
    planCardStep,
    jumpTo,
    handlePlansScrollEnd,
    handleSubmit,
    user,
  };
}
