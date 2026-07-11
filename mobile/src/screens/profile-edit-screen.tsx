import { router, useLocalSearchParams } from '@/src/navigation/router';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import * as ImagePicker from '@/src/native/image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, DesignSystem, Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { PrimaryButton } from '@/src/components/primary-button';
import { StatusPill } from '@/src/components/status-pill';
import { UserAvatar } from '@/src/components/user-avatar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { getPasswordStrength, isStrongPassword, PASSWORD_MIN_LENGTH } from '@/src/utils/password-strength';
import { formatRole } from '@/src/utils/format';
import { getTextInputProps } from '@/src/utils/text-input-props';
import {
  DEFAULT_ACTIVE_DAYS,
  getOperationalScheduleState,
  normalizeOperationalSchedule,
} from '@/src/utils/operational-schedule';

type ProfileForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  avatarUrl: string | null;
  companyName: string;
  legalName: string;
  taxId: string;
  billingEmail: string;
  billingAddress: string;
  preferredMethod: 'card' | 'spei' | 'transfer';
  cardholderName: string;
  cardBrand: string;
  cardLast4: string;
  cardExpMonth: string;
  cardExpYear: string;
  customerReference: string;
  scheduleEnabled: boolean;
  scheduleStartTime: string;
  scheduleEndTime: string;
  scheduleActiveDays: number[];
  scheduleTimezone: string;
};

const DAY_OPTIONS = [
  { id: 1, label: 'Lun' },
  { id: 2, label: 'Mar' },
  { id: 3, label: 'Mie' },
  { id: 4, label: 'Jue' },
  { id: 5, label: 'Vie' },
  { id: 6, label: 'Sab' },
  { id: 0, label: 'Dom' },
];

function createProfileForm(): ProfileForm {
  return {
    name: '',
    email: '',
    phone: '',
    password: '',
    avatarUrl: null,
    companyName: '',
    legalName: '',
    taxId: '',
    billingEmail: '',
    billingAddress: '',
    preferredMethod: 'spei',
    cardholderName: '',
    cardBrand: '',
    cardLast4: '',
    cardExpMonth: '',
    cardExpYear: '',
    customerReference: '',
    scheduleEnabled: true,
    scheduleStartTime: '',
    scheduleEndTime: '',
    scheduleActiveDays: DEFAULT_ACTIVE_DAYS,
    scheduleTimezone: '',
  };
}

function isValidScheduleTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

export function ProfileEditScreen() {
  const { theme } = useAppTheme();
  const { section } = useLocalSearchParams<{ section: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const sectionsRef = useRef<Record<string, View | null>>({});

  const { isSubmitting, updateProfile, user } = useAppStore(
    useShallow((state) => ({
      isSubmitting: state.isSubmitting,
      updateProfile: state.updateProfile,
      user: state.user,
    }))
  );
  const [helperMessage, setHelperMessage] = useState<string | null>(null);
  const [helperTone, setHelperTone] = useState<'danger' | 'success'>('danger');
  const [profileForm, setProfileForm] = useState<ProfileForm>(createProfileForm);
  const passwordStrength = useMemo(
    () => getPasswordStrength(profileForm.password),
    [profileForm.password]
  );
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (!user) {
      return;
    }

    setProfileForm({
      name: user.name,
      email: user.email,
      phone: user.phone,
      password: '',
      avatarUrl: user.avatarUrl || null,
      companyName: user.companyProfile?.companyName || '',
      legalName: user.companyProfile?.legalName || '',
      taxId: user.companyProfile?.taxId || '',
      billingEmail: user.companyProfile?.billingEmail || user.email,
      billingAddress: user.companyProfile?.billingAddress || '',
      preferredMethod: user.paymentProfile?.preferredMethod || 'spei',
      cardholderName: user.paymentProfile?.cardholderName || '',
      cardBrand: user.paymentProfile?.cardBrand || '',
      cardLast4: user.paymentProfile?.cardLast4 || '',
      cardExpMonth: user.paymentProfile?.cardExpMonth || '',
      cardExpYear: user.paymentProfile?.cardExpYear || '',
      customerReference: user.paymentProfile?.customerReference || '',
      scheduleEnabled: user.operationalSchedule?.enabled ?? true,
      scheduleStartTime: user.operationalSchedule?.startTime || '',
      scheduleEndTime: user.operationalSchedule?.endTime || '',
      scheduleActiveDays: user.operationalSchedule?.activeDays?.length
        ? user.operationalSchedule.activeDays
        : DEFAULT_ACTIVE_DAYS,
      scheduleTimezone: user.operationalSchedule?.timezone || '',
    });
  }, [user]);

  useEffect(() => {
    if (section && sectionsRef.current[section]) {
      // Small delay to ensure layout is ready
      setTimeout(() => {
        sectionsRef.current[section]?.measureLayout(
          // @ts-ignore - ScrollView content internal view
          scrollRef.current?.getInnerViewNode?.() || scrollRef.current,
          (x, y) => {
            scrollRef.current?.scrollTo({ y, animated: true });
          },
          () => {}
        );
      }, 300);
    }
  }, [section]);

  const setMessage = (message: string | null, tone: 'danger' | 'success' = 'danger') => {
    setHelperMessage(message);
    setHelperTone(tone);
  };

  const updateField = (field: keyof ProfileForm, value: string | null) => {
    setProfileForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const toggleScheduleDay = (day: number) => {
    setProfileForm((current) => {
      const exists = current.scheduleActiveDays.includes(day);
      const nextDays = exists
        ? current.scheduleActiveDays.filter((entry) => entry !== day)
        : [...current.scheduleActiveDays, day];

      return {
        ...current,
        scheduleActiveDays: nextDays.length ? nextDays : [day],
      };
    });
  };

  const handlePhotoUpload = async () => {
    setMessage(null);

    if (Platform.OS === 'web') {
      const doc = globalThis.document as any;

      if (!doc?.createElement) {
        setMessage('No fue posible abrir el selector de imagen.');
        return;
      }

      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files?.[0];

        if (!file) {
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          updateField('avatarUrl', typeof reader.result === 'string' ? reader.result : null);
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      base64: true,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    updateField(
      'avatarUrl',
      asset.base64 ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` : asset.uri
    );
  };

  const handleProfileSave = async () => {
    if (!profileForm.name.trim() || !profileForm.email.trim()) {
      setMessage('Nombre y correo son obligatorios.');
      return;
    }

    if (profileForm.password.trim() && !isStrongPassword(profileForm.password.trim())) {
      setMessage(
        `La nueva contrasena debe tener minimo ${PASSWORD_MIN_LENGTH} caracteres, letras, numeros y un caracter especial.`
      );
      return;
    }

    const hasSchedule =
      profileForm.scheduleStartTime.trim() || profileForm.scheduleEndTime.trim();
    if (hasSchedule) {
      if (
        !isValidScheduleTime(profileForm.scheduleStartTime) ||
        !isValidScheduleTime(profileForm.scheduleEndTime)
      ) {
        setMessage('El horario operativo debe usar formato HH:mm.');
        return;
      }
    }

    const result = await updateProfile({
      name: profileForm.name.trim(),
      email: profileForm.email.trim(),
      phone: profileForm.phone.trim(),
      avatarUrl: profileForm.avatarUrl,
      companyProfile: {
        companyName: profileForm.companyName.trim(),
        legalName: profileForm.legalName.trim(),
        taxId: profileForm.taxId.trim().toUpperCase(),
        billingEmail: profileForm.billingEmail.trim(),
        billingAddress: profileForm.billingAddress.trim(),
      },
      paymentProfile: {
        preferredMethod: profileForm.preferredMethod,
        cardholderName: profileForm.cardholderName.trim(),
        cardBrand: profileForm.cardBrand.trim(),
        cardLast4: profileForm.cardLast4.replace(/[^\d]/g, '').slice(-4),
        cardExpMonth: profileForm.cardExpMonth.replace(/[^\d]/g, '').slice(0, 2),
        cardExpYear: profileForm.cardExpYear.replace(/[^\d]/g, '').slice(-2),
        customerReference: profileForm.customerReference.trim(),
      },
      operationalSchedule: hasSchedule
        ? {
            activeDays: profileForm.scheduleActiveDays,
            enabled: profileForm.scheduleEnabled,
            endTime: profileForm.scheduleEndTime.trim(),
            startTime: profileForm.scheduleStartTime.trim(),
            timezone: profileForm.scheduleTimezone.trim() || null,
          }
        : null,
      ...(profileForm.password.trim() ? { password: profileForm.password.trim() } : {}),
    });

    if (!result.ok) {
      setMessage(result.message || 'No se pudo actualizar la cuenta.');
      return;
    }

    setProfileForm((current) => ({
      ...current,
      password: '',
    }));
    setMessage('Informacion actualizada correctamente.', 'success');
  };

  if (!user) {
    return (
      <AppShell sectionKey="perfil">
        <AppCard>
          <Text style={styles.title}>Perfil no disponible</Text>
          <Text style={styles.subtitle}>Inicia sesion para editar tu cuenta.</Text>
        </AppCard>
      </AppShell>
    );
  }

  const scheduleState = getOperationalScheduleState(
    normalizeOperationalSchedule({
      activeDays: profileForm.scheduleActiveDays,
      enabled: profileForm.scheduleEnabled,
      endTime: profileForm.scheduleEndTime,
      startTime: profileForm.scheduleStartTime,
      timezone: profileForm.scheduleTimezone || null,
    })
  );

  return (
    <AppShell
      sectionKey="perfil"
      mobileTitle="Editar perfil"
      mobileSubtitle="Datos, acceso, facturacion y cobro mejor separados."
      mobileBadges={[
        { label: formatRole(user.role), tone: 'info' },
        { label: 'Cuenta activa', tone: 'positive' },
      ]}
      scroll={true}
      // @ts-ignore - We need to access the ScrollView ref
      scrollProps={{ ref: scrollRef }}
      header={
        <View style={styles.header}>
          <Pressable
            onPress={() => router.push('/perfil')}
            style={[
              styles.backButton,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderColor: theme.colors.line,
              },
            ]}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={theme.colors.text} />
            <Text style={styles.backButtonText}>Volver a perfil</Text>
          </Pressable>
          <Text style={styles.title}>Editar perfil</Text>
          <Text style={styles.subtitle}>
            Ajusta foto, contacto y acceso desde una vista dedicada para que el perfil principal se mantenga limpio.
          </Text>
        </View>
      }>
      <AppCard style={styles.editorCard}>
        <View style={styles.topRow}>
          <View style={styles.avatarColumn}>
            <UserAvatar
              user={{
                avatar: user.avatar,
                avatarUrl: profileForm.avatarUrl || user.avatarUrl || null,
                name: profileForm.name || user.name,
              }}
              size={104}
            />
            <PrimaryButton label="Cambiar foto" variant="ghost" onPress={() => { handlePhotoUpload(); }} />
          </View>

          <View style={styles.identityBlock}>
            <Text style={styles.userName}>{profileForm.name || user.name}</Text>
            <Text style={styles.userMeta}>{formatRole(user.role)}</Text>
            <Text style={styles.identityText}>
              Los cambios se reflejan en tu cuenta, chat, perfil y vistas operativas sin tocar el login.
            </Text>
            <View style={styles.identityPills}>
              <StatusPill label="Cuenta activa" tone="info" />
              <StatusPill label="Vista dedicada" tone="positive" />
            </View>
          </View>
        </View>

        <View
          style={styles.formGrid}
          onLayout={(e) => {
            // @ts-ignore
            sectionsRef.current.access = e.target;
          }}>
          <Text style={styles.sectionHeading}>Acceso base</Text>
          <Field
            label="Nombre completo"
            value={profileForm.name}
            onChangeText={(value) => updateField('name', value)}
            placeholder="Nombre del usuario"
          />
          <Field
            label="Correo"
            value={profileForm.email}
            onChangeText={(value) => updateField('email', value)}
            placeholder="usuario@empresa.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Numero"
            value={profileForm.phone}
            onChangeText={(value) => updateField('phone', value)}
            placeholder="+52 55 0000 0000"
            keyboardType="phone-pad"
          />
          <Field
            label="Nueva contrasena"
            value={profileForm.password}
            onChangeText={(value) => updateField('password', value)}
            placeholder="Deja vacio para conservar la actual"
            secureTextEntry
          />
          {profileForm.password.trim() ? (
            <View style={styles.passwordHelperCard}>
              <Text style={styles.passwordHelperTitle}>Seguridad de contrasena</Text>
              <Text
                style={[
                  styles.passwordHelperValue,
                  passwordStrength.tone === 'positive'
                    ? styles.passwordHelperValueStrong
                    : passwordStrength.tone === 'warning'
                      ? styles.passwordHelperValueMedium
                      : styles.passwordHelperValueWeak,
                ]}>
                {passwordStrength.label}
              </Text>
              <Text style={styles.passwordHelperText}>
                Usa letras, numeros y un caracter especial para proteger el acceso.
              </Text>
            </View>
          ) : null}
        </View>

        <View
          style={styles.formGrid}
          onLayout={(e) => {
            // @ts-ignore
            sectionsRef.current.billing = e.target;
          }}>
          <Text style={styles.sectionHeading}>Empresa y facturacion</Text>
          <Field
            label="Empresa"
            value={profileForm.companyName}
            onChangeText={(value) => updateField('companyName', value)}
            placeholder="Nombre comercial"
          />
          <Field
            label="Razon social"
            value={profileForm.legalName}
            onChangeText={(value) => updateField('legalName', value)}
            placeholder="Nombre legal o fiscal"
          />
          <Field
            label="RFC o identificador fiscal"
            value={profileForm.taxId}
            onChangeText={(value) => updateField('taxId', value)}
            placeholder="ABC010203XYZ"
            autoCapitalize="characters"
          />
          <Field
            label="Correo de facturacion"
            value={profileForm.billingEmail}
            onChangeText={(value) => updateField('billingEmail', value)}
            placeholder="facturacion@empresa.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Domicilio fiscal"
            value={profileForm.billingAddress}
            onChangeText={(value) => updateField('billingAddress', value)}
            placeholder="Calle, numero, colonia y ciudad"
          />
        </View>

        <View
          style={styles.formGrid}
          onLayout={(e) => {
            // @ts-ignore
            sectionsRef.current.payment = e.target;
          }}>
          <Text style={styles.sectionHeading}>Metodo de pago</Text>
          <Text style={styles.sectionCaption}>
            Guardamos solo una referencia de cobro. El pago real se completa desde el portal web.
          </Text>
          <View style={styles.methodRow}>
            {[
              { id: 'spei', label: 'SPEI' },
              { id: 'transfer', label: 'Transferencia' },
              { id: 'card', label: 'Tarjeta' },
            ].map((option) => (
              <Pressable
                key={option.id}
                onPress={() =>
                  updateField(
                    'preferredMethod',
                    option.id as ProfileForm['preferredMethod']
                  )
                }
                style={[
                  styles.methodChip,
                  profileForm.preferredMethod === option.id ? styles.methodChipActive : undefined,
                ]}>
                <Text
                  style={[
                    styles.methodChipText,
                    profileForm.preferredMethod === option.id
                      ? styles.methodChipTextActive
                      : undefined,
                  ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Field
            label="Titular"
            value={profileForm.cardholderName}
            onChangeText={(value) => updateField('cardholderName', value)}
            placeholder="Nombre del titular"
          />
          <Field
            label="Marca"
            value={profileForm.cardBrand}
            onChangeText={(value) => updateField('cardBrand', value)}
            placeholder="Visa, Mastercard, Amex"
          />
          <View style={styles.inlineGrid}>
            <Field
              label="Ultimos 4"
              value={profileForm.cardLast4}
              onChangeText={(value) => updateField('cardLast4', value.replace(/[^\d]/g, '').slice(-4))}
              placeholder="4242"
              keyboardType="phone-pad"
            />
            <Field
              label="Mes"
              value={profileForm.cardExpMonth}
              onChangeText={(value) =>
                updateField('cardExpMonth', value.replace(/[^\d]/g, '').slice(0, 2))
              }
              placeholder="08"
              keyboardType="phone-pad"
            />
            <Field
              label="Ano"
              value={profileForm.cardExpYear}
              onChangeText={(value) =>
                updateField('cardExpYear', value.replace(/[^\d]/g, '').slice(-2))
              }
              placeholder="28"
              keyboardType="phone-pad"
            />
          </View>
          <Field
            label="Referencia cliente/pasarela"
            value={profileForm.customerReference}
            onChangeText={(value) => updateField('customerReference', value)}
            placeholder="Ej. cus_001 o convenio interno"
          />
        </View>

        <View
          style={styles.formGrid}
          onLayout={(e) => {
            // @ts-ignore
            sectionsRef.current.schedule = e.target;
          }}>
          <Text style={styles.sectionHeading}>Horario operativo</Text>
          <Text style={styles.sectionCaption}>
            Controla cuando la app puede operar GPS y radio. Si lo dejas vacio, se conserva el comportamiento actual.
          </Text>
          <View style={styles.identityPills}>
            <StatusPill
              label={scheduleState.label}
              tone={scheduleState.isWithinSchedule ? 'positive' : 'warning'}
            />
            <StatusPill
              label={profileForm.scheduleEnabled ? 'Activo' : 'Pausado'}
              tone={profileForm.scheduleEnabled ? 'info' : 'neutral'}
            />
          </View>
          <View style={styles.inlineGrid}>
            <Field
              label="Hora inicio"
              value={profileForm.scheduleStartTime}
              onChangeText={(value) => updateField('scheduleStartTime', value)}
              placeholder="08:00"
              keyboardType="phone-pad"
            />
            <Field
              label="Hora fin"
              value={profileForm.scheduleEndTime}
              onChangeText={(value) => updateField('scheduleEndTime', value)}
              placeholder="18:00"
              keyboardType="phone-pad"
            />
            <Field
              label="Zona horaria"
              value={profileForm.scheduleTimezone}
              onChangeText={(value) => updateField('scheduleTimezone', value)}
              placeholder="Local del dispositivo"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.methodRow}>
            {DAY_OPTIONS.map((day) => {
              const selected = profileForm.scheduleActiveDays.includes(day.id);

              return (
                <Pressable
                  key={day.id}
                  onPress={() => toggleScheduleDay(day.id)}
                  style={[styles.methodChip, selected ? styles.methodChipActive : undefined]}>
                  <Text
                    style={[
                      styles.methodChipText,
                      selected ? styles.methodChipTextActive : undefined,
                    ]}>
                    {day.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() =>
              setProfileForm((current) => ({
                ...current,
                scheduleEnabled: !current.scheduleEnabled,
              }))
            }
            style={[styles.methodChip, profileForm.scheduleEnabled ? styles.methodChipActive : undefined]}>
            <Text
              style={[
                styles.methodChipText,
                profileForm.scheduleEnabled ? styles.methodChipTextActive : undefined,
              ]}>
              {profileForm.scheduleEnabled ? 'Horario habilitado' : 'Horario pausado'}
            </Text>
          </Pressable>
        </View>

        {helperMessage ? (
          <View
            style={[
              styles.messageBox,
              helperTone === 'success' ? styles.successBox : styles.errorBox,
            ]}>
            <Text
              style={[
                styles.messageText,
                helperTone === 'success' ? styles.successText : styles.errorText,
              ]}>
              {helperMessage}
            </Text>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <PrimaryButton
            label={isSubmitting ? 'Guardando...' : 'Guardar cambios'}
            onPress={() => { handleProfileSave(); }}
            disabled={isSubmitting}
          />
        </View>
      </AppCard>
    </AppShell>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  secureTextEntry = false,
}: FieldProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...getTextInputProps(theme, {
          autoComplete: secureTextEntry ? 'current-password' : 'off',
          returnKeyType: 'done',
          submitBehavior: 'blurAndSubmit',
        })}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        style={styles.input}
      />
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
  return StyleSheet.create({
    header: {
      gap: AppTheme.spacing.md,
      paddingTop: AppTheme.spacing.md,
    },
    backButton: {
      alignSelf: 'flex-start',
      minHeight: 42,
      borderRadius: AppTheme.radius.pill,
      borderWidth: 1,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    backButtonText: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '700',
    },
    title: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 34,
    },
    subtitle: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 15,
      lineHeight: 24,
      maxWidth: 760,
    },
    editorCard: {
      backgroundColor: theme.colors.surface,
      gap: AppTheme.spacing.lg,
    },
    topRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: AppTheme.spacing.lg,
      alignItems: 'center',
      padding: AppTheme.spacing.md,
      borderRadius: AppTheme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
    },
    avatarColumn: {
      gap: AppTheme.spacing.sm,
      alignItems: 'center',
    },
    identityBlock: {
      flex: 1,
      gap: 8,
    },
    userName: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 30,
    },
    userMeta: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 14,
    },
    identityText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 14,
      lineHeight: 22,
      maxWidth: 520,
    },
    identityPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    passwordHelperCard: {
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: AppTheme.spacing.md,
      paddingVertical: 12,
      gap: 6,
    },
    passwordHelperTitle: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '800',
    },
    passwordHelperValue: {
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '800',
    },
    passwordHelperValueWeak: {
      color: theme.colors.accent,
    },
    passwordHelperValueMedium: {
      color: theme.colors.warning,
    },
    passwordHelperValueStrong: {
      color: theme.colors.success,
    },
    passwordHelperText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 13,
      lineHeight: 20,
    },
    formGrid: {
      gap: 12,
      padding: AppTheme.spacing.md,
      borderRadius: AppTheme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
    },
    inlineGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    sectionHeading: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 22,
      fontWeight: '800',
      marginTop: 4,
    },
    sectionCaption: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 13,
      lineHeight: 21,
    },
    field: {
      gap: 8,
      flex: 1,
      minWidth: 170,
    },
    fieldLabel: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    input: {
      minHeight: DesignSystem.control.md,
      borderRadius: DesignSystem.radius.input,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.input,
      paddingHorizontal: AppTheme.spacing.md,
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 15,
    },
    methodRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    methodChip: {
      minHeight: 42,
      borderRadius: AppTheme.radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    methodChipActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    methodChipText: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '700',
    },
    methodChipTextActive: {
      color: theme.colors.accent,
    },
    messageBox: {
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      paddingHorizontal: AppTheme.spacing.md,
      paddingVertical: 12,
    },
    successBox: {
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.success,
    },
    errorBox: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    },
    messageText: {
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '700',
    },
    successText: {
      color: theme.colors.success,
    },
    errorText: {
      color: theme.colors.accent,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      justifyContent: 'flex-end',
      paddingTop: 8,
    },
  });
}
