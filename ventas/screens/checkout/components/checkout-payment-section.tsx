import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { CommercialPlan } from '@/src/types/app';
import type { TestCardInput } from '@/features/commercial';
import type { PaymentMethod } from '../checkout.types';
import { palette } from '../checkout.constants';
import { formatCurrency } from '../checkout.utils';
import { styles as s } from '../checkout.styles';

type Props = {
  isTwoColumn: boolean;
  isTestPaymentMode: boolean;
  requestTrial: boolean;
  selectedMethod: PaymentMethod;
  onSelectMethod: (method: PaymentMethod) => void;
  testCard: TestCardInput;
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

export function CheckoutPaymentSection({
  isTwoColumn,
  isTestPaymentMode,
  requestTrial,
  selectedMethod,
  onSelectMethod,
  testCard,
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
  return (
    <View style={[s.leftPanel, isTwoColumn ? undefined : s.fullPanel]}>
      <View style={s.panelTitleRow}>
        <View style={s.panelTitleIcon}>
          <MaterialCommunityIcons name="credit-card-check-outline" size={24} color={palette.violet} />
        </View>
        <View style={s.panelTitleCopy}>
          <Text style={s.panelTitle}>Información de pago</Text>
          <Text style={s.panelSubtitle}>Elige tu método y completa la transacción.</Text>
        </View>
      </View>

      {isTestPaymentMode && !requestTrial ? (
        <View style={s.testPaymentPanel}>
          <View style={s.testModeHeader}>
            <View style={s.testModeBadge}>
              <MaterialCommunityIcons name="flask-outline" size={18} color={palette.lime} />
              <Text style={s.testModeBadgeText}>Modo de pruebas</Text>
            </View>
            <Text style={s.testModeText}>Pago simulado sin cargo real.</Text>
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
              label="Numero de tarjeta"
              onChangeText={(value) => onTestCardChange({ cardNumber: value })}
              placeholder="4111 1111 1111 1111"
              value={testCard.cardNumber}
            />
            <View style={s.inlineFields}>
              <TestPaymentInput
                icon="calendar-outline"
                label="Expiracion"
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
              label="Codigo postal"
              onChangeText={(value) => onTestCardChange({ postalCode: value })}
              placeholder="Opcional"
              value={testCard.postalCode}
            />
          </View>
        </View>
      ) : (
        <>
          <View style={s.methodTabs}>
            <MethodTab
              active={selectedMethod === 'card'}
              icon="credit-card-outline"
              label="Tarjeta credito/debito"
              onPress={() => onSelectMethod('card')}
            />
            <MethodTab
              active={selectedMethod === 'spei'}
              icon="bank-outline"
              label="Transferencia SPEI"
              onPress={() => onSelectMethod('spei')}
            />
          </View>

          {selectedMethod === 'card' ? (
            <View style={s.speiPanel}>
              <MaterialCommunityIcons name="shield-lock-outline" size={32} color={palette.cyan} />
              <View style={s.speiCopy}>
                <Text style={s.speiTitle}>Checkout seguro</Text>
                <Text style={s.speiText}>
                  Al continuar te llevaremos al proveedor disponible para completar el pago. ManeComb no captura ni guarda datos de tarjeta.
                </Text>
              </View>
            </View>
          ) : (
            <View style={s.speiPanel}>
              <MaterialCommunityIcons name="bank-transfer" size={32} color={palette.cyan} />
              <View style={s.speiCopy}>
                <Text style={s.speiTitle}>Pago SPEI por proveedor externo</Text>
                <Text style={s.speiText}>
                  Al continuar abriremos el checkout disponible para completar o registrar el cobro. El plan se activa cuando el pago sea validado.
                </Text>
              </View>
            </View>
          )}
        </>
      )}

      {selectedPlan.radioAddonEligible ? (
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
          {isTestPaymentMode && !requestTrial
            ? 'Pago simulado para desarrollo. No se guardan el CVV ni el número completo de la tarjeta.'
            : 'Pago seguro por proveedor externo y estado del plan confirmado por backend.'}
        </Text>
      </View>

      {checkoutMessage ? (
        <View style={s.messageBox}>
          <Text style={s.messageText}>{checkoutMessage}</Text>
        </View>
      ) : null}

      {providerMode === 'unavailable' ? (
        <View style={s.messageBox}>
          <Text style={s.messageText}>
            El servicio de pago no está disponible en este momento. Tu selección permanece guardada.
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={requestTrial ? 'Activar prueba' : 'Continuar al pago seguro'}
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
            <MaterialCommunityIcons name={requestTrial ? 'flask-outline' : 'lock-check-outline'} size={24} color="#FFFFFF" />
            <Text style={s.payButtonText}>
              {requestTrial
                ? `Activar prueba ${selectedPlan.trialDays || 7} dias`
                : isTestPaymentMode
                  ? `Pagar en modo de pruebas ${buttonAmount}`
                  : selectedMethod === 'card'
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
