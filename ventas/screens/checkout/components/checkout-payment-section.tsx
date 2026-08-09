import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { CommercialPlan } from '@/src/types/app';
import type { TestCardInput } from '@/features/commercial';
import type { PaymentMethod } from '../checkout.types';
import { palette } from '../checkout.constants';
import { formatCurrency } from '../checkout.utils';
import { styles as s } from '../checkout.styles';

type SavedCardProfile = {
  cardholderName?: string;
  cardBrand?: string;
  cardLast4?: string;
  cardExpMonth?: string;
  cardExpYear?: string;
  customerReference?: string;
};

type Props = {
  isTwoColumn: boolean;
  isTestPaymentMode: boolean;
  requestTrial: boolean;
  selectedMethod: PaymentMethod;
  onSelectMethod: (method: PaymentMethod) => void;
  testCard: TestCardInput;
  savedCard?: SavedCardProfile | null;
  onTestCardChange: (updates: Partial<TestCardInput>) => void;
  includeRadioAddon: boolean;
  onToggleRadioAddon: () => void;
  selectedPlan: CommercialPlan;
  buttonAmount: string;
  canSubmit: boolean;
  processing: boolean;
  checkoutMessage: string | null;
  providerMode: string;
  onSubmitPayment: () => void;
};

function MethodTab({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[s.methodTab, active ? s.methodTabActive : undefined]}>
      <MaterialCommunityIcons name={icon} size={23} color={active ? palette.violet : palette.text} />
      <Text style={[s.methodLabel, active ? s.methodLabelActive : undefined]}>{label}</Text>
    </Pressable>
  );
}

function TestPaymentInput({
  icon,
  keyboardType,
  label,
  onChangeText,
  placeholder,
  secureTextEntry,
  value,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  keyboardType?: 'default' | 'number-pad';
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  value: string;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.inputShell}>
        <MaterialCommunityIcons name={icon} size={20} color={palette.violet} />
        <TextInput
          autoCapitalize="none"
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(168, 177, 194, 0.52)"
          secureTextEntry={secureTextEntry}
          style={s.input}
          value={value}
        />
      </View>
    </View>
  );
}

function CardTestForm({
  testCard,
  onTestCardChange,
  productionDemo = false,
}: {
  testCard: TestCardInput;
  onTestCardChange: (updates: Partial<TestCardInput>) => void;
  productionDemo?: boolean;
}) {
  return (
    <View style={s.testPaymentPanel}>
      <View style={s.testModeHeader}>
        <View style={s.testModeBadge}>
          <MaterialCommunityIcons name={productionDemo ? 'flask-outline' : 'shield-key-outline'} size={18} color={palette.lime} />
          <Text style={s.testModeBadgeText}>{productionDemo ? 'Demostración temporal' : 'Modo de pruebas'}</Text>
        </View>
        <Text style={s.testModeText}>
          {productionDemo
            ? 'Sin cargo real. La tarjeta se valida como demostración y activa la misma prueba de 7 días autorizada por el backend.'
            : 'Pago simulado sin cargo real. Este formulario solo se usa en el proveedor técnico de pruebas.'}
        </Text>
      </View>

      <View style={s.formGrid}>
        <TestPaymentInput
          icon="account-outline"
          label="Nombre del titular"
          onChangeText={(value) => onTestCardChange({ cardholderName: value })}
          placeholder="Nombre como aparece en la tarjeta"
          value={testCard.cardholderName}
        />
        <TestPaymentInput
          icon="credit-card-outline"
          keyboardType="number-pad"
          label="Número de tarjeta de prueba"
          onChangeText={(value) => onTestCardChange({ cardNumber: value })}
          placeholder="4111 1111 1111 1111"
          value={testCard.cardNumber}
        />
        <View style={s.inlineFields}>
          <TestPaymentInput
            icon="calendar-outline"
            label="Expiración"
            onChangeText={(value) => onTestCardChange({ expiry: value })}
            placeholder="MM/AA"
            value={testCard.expiry}
          />
          <TestPaymentInput
            icon="lock-outline"
            keyboardType="number-pad"
            label="CVV"
            onChangeText={(value) => onTestCardChange({ cvv: value })}
            placeholder="123"
            secureTextEntry
            value={testCard.cvv}
          />
        </View>
        <TestPaymentInput
          icon="map-marker-outline"
          label="Código postal"
          onChangeText={(value) => onTestCardChange({ postalCode: value })}
          placeholder="Opcional"
          value={testCard.postalCode}
        />
      </View>
    </View>
  );
}

export function CheckoutPaymentSection({
  isTwoColumn,
  isTestPaymentMode,
  requestTrial,
  selectedMethod,
  onSelectMethod,
  testCard,
  savedCard,
  onTestCardChange,
  includeRadioAddon,
  onToggleRadioAddon,
  selectedPlan,
  buttonAmount,
  canSubmit,
  processing,
  checkoutMessage,
  providerMode,
  onSubmitPayment,
}: Props) {
  const isManualPaymentMode = providerMode === 'manual';
  const demoCardAvailable = Boolean(
    isManualPaymentMode
      && selectedPlan.trialEligible
      && Number(selectedPlan.units) === 2
      && Number(selectedPlan.trialDays) === 7
  );
  const effectiveMethod: PaymentMethod = isManualPaymentMode && !demoCardAvailable ? 'spei' : selectedMethod;
  const manualDemoSelected = !requestTrial && demoCardAvailable && effectiveMethod === 'card';
  const legacyCardLabel = savedCard?.cardLast4
    ? `${savedCard.cardBrand || 'Tarjeta'} •••• ${savedCard.cardLast4}`
    : null;

  useEffect(() => {
    if (!requestTrial && isManualPaymentMode && !demoCardAvailable && selectedMethod !== 'spei') {
      onSelectMethod('spei');
    }
  }, [demoCardAvailable, isManualPaymentMode, onSelectMethod, requestTrial, selectedMethod]);

  const renderManualSpei = () => (
    <View style={s.speiPanel}>
      <MaterialCommunityIcons name="bank-transfer" size={32} color={palette.cyan} />
      <View style={s.speiCopy}>
        <Text style={s.speiTitle}>Transferencia directa a ManeComb</Text>
        <Text style={s.speiText}>
          Al continuar se creará una orden pendiente y se mostrarán banco, titular, CLABE, importe y referencia exacta. El plan se activa únicamente después de validar el depósito.
        </Text>
        {legacyCardLabel ? (
          <Text style={s.speiText}>
            {legacyCardLabel} permanece como referencia histórica, pero no será utilizada ni reemplaza el pago SPEI.
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={[s.leftPanel, isTwoColumn ? undefined : s.fullPanel]}>
      <View style={s.panelTitleRow}>
        <View style={s.panelTitleIcon}>
          <MaterialCommunityIcons
            name={requestTrial || manualDemoSelected ? 'flask-outline' : isManualPaymentMode ? 'bank-transfer' : 'credit-card-check-outline'}
            size={24}
            color={palette.violet}
          />
        </View>
        <View style={s.panelTitleCopy}>
          <Text style={s.panelTitle}>
            {requestTrial
              ? 'Prueba ManeComb'
              : manualDemoSelected
                ? 'Tarjeta demo'
                : isManualPaymentMode
                  ? 'Transferencia SPEI'
                  : 'Información de pago'}
          </Text>
          <Text style={s.panelSubtitle}>
            {requestTrial
              ? `Activa ${selectedPlan.trialDays || 7} días del plan de ${selectedPlan.units} combis sin realizar un cobro.`
              : manualDemoSelected
                ? `Demostración sin cargo: valida una tarjeta de prueba y activa ${selectedPlan.trialDays || 7} días con la autoridad de trial del backend.`
                : isManualPaymentMode
                  ? 'Genera una orden con importe y referencia únicos para tu cuenta.'
                  : 'Elige tu método y completa la transacción con el proveedor disponible.'}
          </Text>
        </View>
      </View>

      {requestTrial ? (
        <View style={s.speiPanel}>
          <MaterialCommunityIcons name="shield-check-outline" size={32} color={palette.cyan} />
          <View style={s.speiCopy}>
            <Text style={s.speiTitle}>Acceso de prueba sin pago</Text>
            <Text style={s.speiText}>
              La activación de prueba se valida directamente con ManeComb. No depende de Mercado Pago, tarjeta ni SPEI y no genera un cargo al activarla.
            </Text>
          </View>
        </View>
      ) : isTestPaymentMode ? (
        <CardTestForm testCard={testCard} onTestCardChange={onTestCardChange} />
      ) : isManualPaymentMode ? (
        demoCardAvailable ? (
          <>
            <View style={s.methodTabs}>
              <MethodTab
                active={effectiveMethod === 'card'}
                icon="credit-card-outline"
                label="Tarjeta demo"
                onPress={() => onSelectMethod('card')}
              />
              <MethodTab
                active={effectiveMethod === 'spei'}
                icon="bank-outline"
                label="Transferencia SPEI"
                onPress={() => onSelectMethod('spei')}
              />
            </View>
            {effectiveMethod === 'card' ? (
              <CardTestForm testCard={testCard} onTestCardChange={onTestCardChange} productionDemo />
            ) : renderManualSpei()}
          </>
        ) : renderManualSpei()
      ) : (
        <>
          <View style={s.methodTabs}>
            <MethodTab
              active={effectiveMethod === 'card'}
              icon="credit-card-outline"
              label="Tarjeta crédito/débito"
              onPress={() => onSelectMethod('card')}
            />
            <MethodTab
              active={effectiveMethod === 'spei'}
              icon="bank-outline"
              label="Transferencia SPEI"
              onPress={() => onSelectMethod('spei')}
            />
          </View>

          {effectiveMethod === 'card' ? (
            <View style={s.speiPanel}>
              <MaterialCommunityIcons name="shield-lock-outline" size={32} color={palette.cyan} />
              <View style={s.speiCopy}>
                <Text style={s.speiTitle}>Checkout seguro</Text>
                <Text style={s.speiText}>
                  Al continuar te llevaremos al proveedor disponible. ManeComb no captura ni guarda el número completo ni el CVV.
                </Text>
              </View>
            </View>
          ) : (
            <View style={s.speiPanel}>
              <MaterialCommunityIcons name="bank-transfer" size={32} color={palette.cyan} />
              <View style={s.speiCopy}>
                <Text style={s.speiTitle}>Pago SPEI por proveedor externo</Text>
                <Text style={s.speiText}>
                  El plan se activa cuando el proveedor confirma el pago. Conserva la referencia mostrada durante el checkout.
                </Text>
              </View>
            </View>
          )}
        </>
      )}

      {selectedPlan.radioAddonEligible && !requestTrial && !manualDemoSelected ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: includeRadioAddon }}
          onPress={onToggleRadioAddon}
          style={s.addonOption}>
          <MaterialCommunityIcons
            name={includeRadioAddon ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
            size={24}
            color={includeRadioAddon ? palette.violet : palette.muted}
          />
          <View style={s.addonCopy}>
            <Text style={s.addonTitle}>Radio operativo</Text>
            <Text style={s.addonText}>
              Agregar por {formatCurrency(selectedPlan.radioAddonPrice || 0)} MXN al mes.
            </Text>
          </View>
        </Pressable>
      ) : null}

      <View style={s.securityNote}>
        <MaterialCommunityIcons name="lock-outline" size={18} color={palette.violet} />
        <Text style={s.securityText}>
          {requestTrial
            ? 'La prueba se activa en tu cuenta sin cobro y sin depender del proveedor de pagos.'
            : manualDemoSelected
              ? 'Demo temporal: no se cobra la tarjeta. ManeComb descarta el número completo y el CVV y el backend aplica las mismas reglas de una prueba de 7 días.'
              : isTestPaymentMode
                ? 'Entorno de pruebas: no se realizan cargos y no se almacenan CVV ni números completos.'
                : isManualPaymentMode
                  ? 'La orden permanecerá pendiente hasta que ManeComb confirme la transferencia recibida.'
                  : 'Pago procesado por el proveedor disponible y estado confirmado por backend.'}
        </Text>
      </View>

      {checkoutMessage ? (
        <View style={s.messageBox}>
          <Text style={s.messageText}>{checkoutMessage}</Text>
        </View>
      ) : null}

      {providerMode === 'unavailable' && !requestTrial ? (
        <View style={s.messageBox}>
          <Text style={s.messageText}>
            El servicio de pago no está disponible en este momento. Tu selección permanece guardada.
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          requestTrial || manualDemoSelected
            ? 'Activar prueba de demostración'
            : isManualPaymentMode
              ? 'Generar instrucciones de transferencia'
              : 'Continuar al pago seguro'
        }
        disabled={!canSubmit}
        onPress={onSubmitPayment}
        style={({ pressed }: { pressed: boolean }) => [
          s.payButton,
          pressed && canSubmit ? s.pressed : undefined,
          !canSubmit ? s.disabledButton : undefined,
        ]}>
        {processing ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <MaterialCommunityIcons
              name={requestTrial || manualDemoSelected ? 'flask-outline' : isManualPaymentMode ? 'bank-transfer' : 'lock-check-outline'}
              size={24}
              color="#FFFFFF"
            />
            <Text style={s.payButtonText}>
              {requestTrial || manualDemoSelected
                ? `Activar demo ${selectedPlan.trialDays || 7} días · sin cargo`
                : isTestPaymentMode
                  ? `Pagar en modo de pruebas ${buttonAmount}`
                  : isManualPaymentMode
                    ? `Generar transferencia ${buttonAmount}`
                    : effectiveMethod === 'card'
                      ? 'Continuar al pago seguro'
                      : `Continuar pago SPEI ${buttonAmount}`}
            </Text>
            <MaterialCommunityIcons name="arrow-right" size={22} color="#FFFFFF" />
          </>
        )}
      </Pressable>
    </View>
  );
}
