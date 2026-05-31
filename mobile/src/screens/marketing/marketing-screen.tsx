import React from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useMarketingLogic } from './hooks/use-marketing-logic';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { FeaturesSection, PlansCarousel } from './components/PlansCarousel';
import { CheckoutSection } from './components/CheckoutSection';
import { FAQSection, FooterSection } from './components/FooterSection';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value);
}

export function MarketingScreen() {
  const {
    themeMode, setThemeMode, palette, styles, width, isCompact,
    scrollRef, plansCarouselRef, sectionOffsets, setSectionOffsets,
    plans, checkout, setCheckout, isSubmitting, accessMode, setAccessMode,
    password, setPassword, passwordConfirm, setPasswordConfirm, helperMessage,
    selectedPlan, selectedPlanIndex, planCardWidth, planCardStep,
    jumpTo, handlePlansScrollEnd, handleSubmit, user
  } = useMarketingLogic();

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <StatusBar style={palette.mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={Platform.OS === 'web'}>

        <Navbar
          palette={palette}
          styles={styles}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          onJumpToCheckout={() => jumpTo(sectionOffsets.checkout)}
        />

        <HeroSection
          palette={palette}
          styles={styles}
          isCompact={isCompact}
          selectedPlan={selectedPlan}
          onJumpToCheckout={() => jumpTo(sectionOffsets.checkout)}
          onJumpToPlans={() => jumpTo(sectionOffsets.plans)}
          formatCurrency={formatCurrency}
        />

        <FeaturesSection palette={palette} styles={styles} />

        <PlansCarousel
          palette={palette}
          styles={styles}
          plans={plans}
          selectedPlanId={checkout.planId}
          selectedPlanIndex={selectedPlanIndex}
          planCardStep={planCardStep}
          planCardWidth={planCardWidth}
          carouselRef={plansCarouselRef}
          onSelectPlan={(id) => setCheckout(c => ({ ...c, planId: id }))}
          onScrollEnd={handlePlansScrollEnd}
          onLayout={e => setSectionOffsets(s => ({ ...s, plans: e.nativeEvent.layout.y }))}
          formatCurrency={formatCurrency}
        />

        <CheckoutSection
          palette={palette}
          styles={styles}
          checkout={checkout}
          setCheckout={setCheckout}
          selectedPlan={selectedPlan}
          accessMode={accessMode}
          setAccessMode={setAccessMode}
          password={password}
          setPassword={setPassword}
          passwordConfirm={passwordConfirm}
          setPasswordConfirm={setPasswordConfirm}
          helperMessage={helperMessage}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onLayout={e => setSectionOffsets(s => ({ ...s, checkout: e.nativeEvent.layout.y }))}
          formatCurrency={formatCurrency}
          user={user}
          width={width}
        />

        <FAQSection palette={palette} styles={styles} />

        <FooterSection
          palette={palette}
          styles={styles}
          onJumpToCheckout={() => jumpTo(sectionOffsets.checkout)}
        />

      </ScrollView>
    </View>
  );
}
