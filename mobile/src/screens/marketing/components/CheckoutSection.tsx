import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COMMERCIAL_PAYMENT_METHODS, COMMERCIAL_STEPS } from '@/src/constants/commercial';
import { AnimatedSection, MarketingField } from './MarketingPrimitives';
import type { MarketingPalette } from '../styles';
import type { CommercialCheckoutPayload, CommercialPlan, User } from '@/src/types/app';

const summaryBoxStyles = StyleSheet.create({
  summaryBox: { gap: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 14, fontWeight: '600' },
  summaryVal: { fontSize: 15, fontWeight: '800' },
  summaryDivider: { height: 1, marginVertical: 10 },
  summaryTotal: { fontSize: 24, fontWeight: '900' },
});

interface CheckoutSectionProps {
  palette: MarketingPalette;
  styles: any;
  checkout: CommercialCheckoutPayload;
  setCheckout: (c: any) => void;
  selectedPlan: CommercialPlan;
  accessMode: 'login' | 'register';
  setAccessMode: (m: 'login' | 'register') => void;
  password: string;
  setPassword: (p: string) => void;
  passwordConfirm: string;
  setPasswordConfirm: (p: string) => void;
  helperMessage: string | null;
  isSubmitting: boolean;
  onSubmit: () => void;
  onLayout: (event: any) => void;
  formatCurrency: (val: number) => string;
  user: User | null;
  width: number;
}

export function CheckoutSection({
  palette, styles, checkout, setCheckout, selectedPlan, accessMode, setAccessMode,
  password, setPassword, passwordConfirm, setPasswordConfirm, helperMessage,
  isSubmitting, onSubmit, onLayout, formatCurrency, user, width
}: CheckoutSectionProps) {
  const isWebLarge = width > 900;

  return (
    <AnimatedSection index={4} style={[styles.checkoutWrap, { backgroundColor: palette.backgroundAlt, borderColor: palette.line }]} onLayout={onLayout}>
       <View style={[styles.checkoutGrid, { flexDirection: isWebLarge ? 'row' : 'column' }]}>
          <View style={styles.checkoutFormSide}>
             <Text style={[styles.checkoutTitle, { color: palette.ink }]}>Información Comercial</Text>
             <Text style={[styles.checkoutSubtitle, { color: palette.muted }]}>Define el perfil de tu empresa y el tipo de arranque operativo.</Text>

             <View style={[styles.authToggle, { backgroundColor: palette.panel }]}>
                <Pressable onPress={() => setAccessMode('register')} style={[styles.authTab, accessMode === 'register' && { backgroundColor: palette.card }]}><Text style={[styles.authTabText, accessMode === 'register' && { color: palette.accent }]}>Registro</Text></Pressable>
                <Pressable onPress={() => setAccessMode('login')} style={[styles.authTab, accessMode === 'login' && { backgroundColor: palette.card }]}><Text style={[styles.authTabText, accessMode === 'login' && { color: palette.accent }]}>Login</Text></Pressable>
             </View>

             <View style={styles.inputGrid}>
                {accessMode === 'register' && (
                  <>
                    <MarketingField label="Empresa" value={checkout.companyName} onChange={(v: any) => setCheckout((c: any) => ({ ...c, companyName: v }))} placeholder="Nombre Comercial" palette={palette} styles={styles} />
                    <MarketingField label="Responsable" value={checkout.contactName} onChange={(v: any) => setCheckout((c: any) => ({ ...c, contactName: v }))} placeholder="Nombre y Apellido" palette={palette} styles={styles} />
                  </>
                )}
                <MarketingField label="Correo" value={checkout.email} onChange={(v: any) => setCheckout((c: any) => ({ ...c, email: v }))} placeholder="tu@empresa.com" palette={palette} styles={styles} keyboard="email-address" />
                {!user && <MarketingField label="Contraseña" value={password} onChange={setPassword} placeholder="••••••••" palette={palette} styles={styles} secure />}
                {!user && accessMode === 'register' && <MarketingField label="Confirmar" value={passwordConfirm} onChange={setPasswordConfirm} placeholder="••••••••" palette={palette} styles={styles} secure />}
             </View>

             {accessMode === 'register' && (
               <View style={styles.paymentMethods}>
                  <Text style={[styles.inputLabel, { color: palette.ink, marginBottom: 12 }]}>Método de Pago</Text>
                  {COMMERCIAL_PAYMENT_METHODS.map(m => (
                    <Pressable key={m.id} onPress={() => setCheckout((c: any) => ({ ...c, paymentMethod: m.id as any }))}
                      style={[styles.paymentCard, { backgroundColor: palette.card, borderColor: checkout.paymentMethod === m.id ? palette.accent : palette.line }]}>
                       <MaterialCommunityIcons name={m.icon as any} size={24} color={checkout.paymentMethod === m.id ? palette.accent : palette.muted} />
                       <View style={{ flex: 1 }}>
                          <Text style={[styles.paymentLabel, { color: palette.ink }]}>{m.label}</Text>
                          <Text style={[styles.paymentHelper, { color: palette.muted }]}>{m.helper}</Text>
                       </View>
                       {checkout.paymentMethod === m.id && <MaterialCommunityIcons name="check-circle" size={20} color={palette.accent} />}
                    </Pressable>
                  ))}
               </View>
             )}

             {helperMessage && <View style={[styles.msg, { backgroundColor: palette.blueSoft, borderColor: palette.blue }]}><Text style={{ color: palette.blue, fontWeight: '700' }}>{helperMessage}</Text></View>}

             <Pressable onPress={onSubmit} disabled={isSubmitting} style={[styles.submitBtn, { backgroundColor: palette.accent }, isSubmitting && { opacity: 0.7 }]}>
                {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>{accessMode === 'login' ? 'ENTRAR AHORA' : (checkout.requestTrial ? 'Activar Prueba de 7 días' : 'Finalizar Registro')}</Text>}
             </Pressable>
          </View>

          <View style={[styles.checkoutSummarySide, { backgroundColor: palette.card, borderColor: palette.line }]}>
             <Text style={[styles.summaryTitle, { color: palette.ink }]}>Resumen de Orden</Text>
             <View style={summaryBoxStyles.summaryBox}>
                <View style={summaryBoxStyles.summaryRow}><Text style={[summaryBoxStyles.summaryLabel, { color: palette.muted }]}>Paquete</Text><Text style={[summaryBoxStyles.summaryVal, { color: palette.ink }]}>{selectedPlan.name}</Text></View>
                <View style={summaryBoxStyles.summaryRow}><Text style={[summaryBoxStyles.summaryLabel, { color: palette.muted }]}>Unidades</Text><Text style={[summaryBoxStyles.summaryVal, { color: palette.ink }]}>{selectedPlan.units}</Text></View>
                <View style={summaryBoxStyles.summaryRow}><Text style={[summaryBoxStyles.summaryLabel, { color: palette.muted }]}>Costo Mensual</Text><Text style={[summaryBoxStyles.summaryVal, { color: palette.ink }]}>{formatCurrency(selectedPlan.price)}</Text></View>
                <View style={[summaryBoxStyles.summaryDivider, { backgroundColor: palette.line }]} />
                <View style={summaryBoxStyles.summaryRow}><Text style={[summaryBoxStyles.summaryLabel, { color: palette.ink, fontWeight: '800' }]}>Total Hoy</Text><Text style={[summaryBoxStyles.summaryTotal, { color: palette.accent }]}>{checkout.requestTrial ? '$0.00' : formatCurrency(selectedPlan.price)}</Text></View>
             </View>

             <View style={styles.summarySteps}>
                <Text style={[styles.stepsTitle, { color: palette.ink }]}>Proceso de Activación</Text>
                {COMMERCIAL_STEPS.map(s => (
                  <View key={s.title} style={styles.stepItem}>
                     <View style={[styles.stepDot, { backgroundColor: palette.accent }]} />
                     <View><Text style={[styles.stepText, { color: palette.ink }]}>{s.title}</Text><Text style={[styles.stepDesc, { color: palette.muted }]}>{s.body}</Text></View>
                  </View>
                ))}
             </View>
          </View>
       </View>
    </AnimatedSection>
  );
}
