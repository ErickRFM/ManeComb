import { router, useLocalSearchParams } from '@/src/navigation/router';
import { DesignSystem } from '@/constants/theme';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, type ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { PrimaryButton } from '@/src/components/primary-button';
import { UserAvatar } from '@/src/components/user-avatar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { formatRole } from '@/src/utils/format';
import { pickProfileAvatarDataUrl } from '@/src/utils/profile-avatar';
import { Field } from './profile-edit/components/field';
import { PasswordChangeSection } from './profile-edit/components/password-change-section';
import { createStyles } from './profile-edit/profile-edit-screen.styles';

type ProfileForm = {
  name: string;
  email: string;
  phone: string;
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
};

function createProfileForm(): ProfileForm {
  return {
    name: '',
    email: '',
    phone: '',
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
  };
}

export function ProfileEditScreen() {
  const { theme } = useAppTheme();
  const { section } = useLocalSearchParams<{ section: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const sectionsRef = useRef<Record<string, View | null>>({});
  const initializedUserIdRef = useRef<string | null>(null);

  const { isSubmitting, updateProfile, user } = useAppStore(
    useShallow((state) => ({
      isSubmitting: state.isSubmitting,
      updateProfile: state.updateProfile,
      user: state.user,
    }))
  );
  const [helperMessage, setHelperMessage] = useState<string | null>(null);
  const [helperTone, setHelperTone] = useState<'danger' | 'success'>('danger');
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [photoTone, setPhotoTone] = useState<'danger' | 'success'>('success');
  const [isPhotoSaving, setIsPhotoSaving] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm>(createProfileForm);
  const { width } = useWindowDimensions();
  const isPhone = width < DesignSystem.breakpoints.phone;
  const styles = useMemo(() => createStyles(theme, isPhone), [theme, isPhone]);

  useEffect(() => {
    if (!user) {
      initializedUserIdRef.current = null;
      return;
    }
    if (initializedUserIdRef.current === user.id) return;

    initializedUserIdRef.current = user.id;
    setProfileForm({
      name: user.name,
      email: user.email,
      phone: user.phone,
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
    });
  }, [user]);

  useEffect(() => {
    if (section && sectionsRef.current[section]) {
      const timer = setTimeout(() => {
        sectionsRef.current[section]?.measureLayout(
          // @ts-ignore - ScrollView content internal view
          scrollRef.current?.getInnerViewNode?.() || scrollRef.current,
          (x, y) => {
            scrollRef.current?.scrollTo({ y, animated: true });
          },
          () => {}
        );
      }, 300);

      return () => clearTimeout(timer);
    }

    return undefined;
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

  const handlePhotoUpload = async () => {
    if (!user || isPhotoSaving || isSubmitting) return;

    const previousAvatarUrl = profileForm.avatarUrl || user.avatarUrl || null;
    setPhotoMessage(null);
    setIsPhotoSaving(true);

    try {
      const avatarUrl = await pickProfileAvatarDataUrl();
      if (!avatarUrl) return;

      updateField('avatarUrl', avatarUrl);
      const result = await updateProfile({ avatarUrl });
      if (!result.ok) {
        updateField('avatarUrl', previousAvatarUrl);
        setPhotoTone('danger');
        setPhotoMessage(result.message || 'No se pudo guardar la foto.');
        return;
      }

      setPhotoTone('success');
      setPhotoMessage('Foto guardada y sincronizada.');
    } catch (error) {
      updateField('avatarUrl', previousAvatarUrl);
      setPhotoTone('danger');
      setPhotoMessage(error instanceof Error ? error.message : 'No se pudo preparar la foto.');
    } finally {
      setIsPhotoSaving(false);
    }
  };

  const handleProfileSave = async () => {
    if (!profileForm.name.trim() || !profileForm.email.trim()) {
      setMessage('Nombre y correo son obligatorios.');
      return;
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
    });

    if (!result.ok) {
      setMessage(result.message || 'No se pudo actualizar la cuenta.');
      return;
    }

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

  return (
    <AppShell
      sectionKey="perfil"
      mobileTitle="Editar perfil"
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
            onPress={() => router.replace('/perfil')}
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
            <PrimaryButton
              label={isPhotoSaving ? 'Guardando foto...' : 'Cambiar foto'}
              variant="ghost"
              disabled={isPhotoSaving || isSubmitting}
              onPress={() => void handlePhotoUpload()}
            />
            {photoMessage ? (
              <Text
                style={[
                  styles.userMeta,
                  { color: photoTone === 'success' ? theme.colors.success : theme.colors.danger },
                ]}>
                {photoMessage}
              </Text>
            ) : null}
          </View>

          <View style={styles.identityBlock}>
            <Text style={styles.userName}>{profileForm.name || user.name}</Text>
            <Text style={styles.userMeta}>{formatRole(user.role)}</Text>
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

          <View style={styles.methodRow}>
            {[
              { id: 'spei', label: 'SPEI' },
              { id: 'transfer', label: 'Transferencia' },
              { id: 'card', label: 'Tarjeta' },
            ].map((option) => (
              <Pressable
                key={option.id}
                onPress={() =>
                  updateField('preferredMethod', option.id as ProfileForm['preferredMethod'])
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
              onChangeText={(value) => updateField('cardExpMonth', value.replace(/[^\d]/g, '').slice(0, 2))}
              placeholder="08"
              keyboardType="phone-pad"
            />
            <Field
              label="Ano"
              value={profileForm.cardExpYear}
              onChangeText={(value) => updateField('cardExpYear', value.replace(/[^\d]/g, '').slice(-2))}
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
            onPress={() => { void handleProfileSave(); }}
            disabled={isSubmitting || isPhotoSaving}
          />
        </View>
      </AppCard>
      <PasswordChangeSection disabled={isSubmitting || isPhotoSaving} />
    </AppShell>
  );
}
