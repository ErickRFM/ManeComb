import { isAxiosError } from 'axios';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { apiClient, getApiErrorMessage } from '@/src/api/client';
import { useAppStore } from '@/src/store/use-app-store';
import { PortalLayout } from '../components/portal-layout';
import { PortalProfileCompanySection } from '../profile/components/portal-profile-company-section';
import { PortalAccountCenter } from '../profile/components/portal-account-center';
import { PortalProfilePasswordSection } from '../profile/components/portal-profile-password-section';
import { PortalProfilePersonalSection } from '../profile/components/portal-profile-personal-section';
import { PortalProfileSessionsSection } from '../profile/components/portal-profile-sessions-section';
import { PortalProfileSupportSection } from '../profile/components/portal-profile-support-section';
import { styles } from '../profile/profile.styles';
import type { ProfileForm } from '../profile/profile.types';
import { getProfileSection } from '../profile/profile.utils';
import { usePortalStore } from '../store/use-portal-store';
import { hasPortalPermission } from '../utils/access';

export function PortalProfileScreen() {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const requestedSection = getProfileSection(params.section);
  const { isSubmitting: isProfileSubmitting, updateProfile, user } = useAppStore(
    useShallow((state) => ({
      isSubmitting: state.isSubmitting,
      updateProfile: state.updateProfile,
      user: state.user,
    }))
  );
  const {
    isSubmitting: isSessionSubmitting,
    loadAll,
    revokeSession,
    sessions,
    subscription,
  } = usePortalStore(
    useShallow((state) => ({
      isSubmitting: state.isSubmitting,
      loadAll: state.loadAll,
      revokeSession: state.revokeSession,
      sessions: state.sessions,
      subscription: state.subscription,
    }))
  );
  const canManageCompany = hasPortalPermission(user, 'users');
  const activeSection = requestedSection === 'empresa' && !canManageCompany ? 'resumen' : requestedSection;
  const [form, setForm] = useState<ProfileForm>({
    name: '',
    email: '',
    phone: '',
    companyName: '',
    legalName: '',
    taxId: '',
    billingEmail: '',
    billingAddress: '',
  });
  const [personalMessage, setPersonalMessage] = useState<string | null>(null);
  const [companyMessage, setCompanyMessage] = useState<string | null>(null);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [sessionToRevoke, setSessionToRevoke] = useState<{ id: string; deviceName: string } | null>(null);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);

  useEffect(() => {
    if (!user) return;

    setForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      companyName: user.companyProfile?.companyName || '',
      legalName: user.companyProfile?.legalName || '',
      taxId: user.companyProfile?.taxId || '',
      billingEmail: user.companyProfile?.billingEmail || user.email || '',
      billingAddress: user.companyProfile?.billingAddress || '',
    });
  }, [user]);

  const setField = (field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const savePersonalProfile = async () => {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    setPersonalMessage(null);

    if (!name) {
      setPersonalMessage('El nombre es obligatorio.');
      return;
    }
    if (name.length > 100) {
      setPersonalMessage('El nombre no puede exceder 100 caracteres.');
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setPersonalMessage('El correo electrónico no tiene un formato válido.');
      return;
    }

    const result = await updateProfile({ name, email, phone });
    setPersonalMessage(result.ok ? 'Perfil personal actualizado correctamente.' : result.message || 'No fue posible actualizar el perfil.');
  };

  const saveCompanyProfile = async () => {
    setCompanyMessage(null);
    if (!canManageCompany) {
      setCompanyMessage('No tienes permiso para modificar los datos de empresa.');
      return;
    }

    const companyName = form.companyName.trim();
    const legalName = form.legalName.trim();
    const taxId = form.taxId.trim().toUpperCase();
    const billingEmail = form.billingEmail.trim().toLowerCase();
    const billingAddress = form.billingAddress.trim();

    if (billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
      setCompanyMessage('El correo fiscal no tiene un formato válido.');
      return;
    }
    if (taxId && !/^[A-Z0-9&Ñ]{12,13}$/.test(taxId)) {
      setCompanyMessage('El RFC debe tener 12 o 13 caracteres alfanuméricos.');
      return;
    }
    if (companyName.length > 200) {
      setCompanyMessage('El nombre de la empresa no puede exceder 200 caracteres.');
      return;
    }

    const result = await updateProfile({
      companyName,
      legalName,
      taxId,
      billingEmail,
      billingAddress,
    });
    setCompanyMessage(result.ok ? 'Empresa y facturación actualizadas correctamente.' : result.message || 'No fue posible actualizar los datos de empresa.');
  };

  const revokeAllOtherSessions = async () => {
    if (revokingAll) return;
    setRevokingAll(true);
    setSessionMessage(null);
    try {
      const response = await apiClient.delete<{ ok: boolean; message?: string }>('/users/me/sessions/others');
      setSessionMessage(response.data.message || 'Las demás sesiones fueron cerradas.');
      setRevokeAllOpen(false);
      await loadAll();
    } catch (error) {
      setSessionMessage(
        isAxiosError(error)
          ? getApiErrorMessage(error, 'No fue posible cerrar las demás sesiones.')
          : 'No fue posible cerrar las demás sesiones.'
      );
    } finally {
      setRevokingAll(false);
    }
  };

  const personalSection = (
    <PortalProfilePersonalSection
      form={form}
      isSubmitting={isProfileSubmitting}
      message={personalMessage}
      onFieldChange={setField}
      onSave={() => void savePersonalProfile()}
    />
  );

  const companySection = canManageCompany ? (
    <PortalProfileCompanySection
      form={form}
      isSubmitting={isProfileSubmitting}
      message={companyMessage}
      onFieldChange={setField}
      onSave={() => void saveCompanyProfile()}
    />
  ) : null;

  const passwordSection = <PortalProfilePasswordSection onChanged={() => void loadAll()} />;

  const sessionsSection = (
    <PortalProfileSessionsSection
      isSubmitting={isSessionSubmitting || revokingAll}
      message={sessionMessage}
      sessions={sessions}
      onRevoke={(session) => {
        setSessionMessage(null);
        setSessionToRevoke({ id: session.id, deviceName: session.deviceName });
      }}
      onRevokeAllOthers={() => setRevokeAllOpen(true)}
    />
  );

  return (
    <PortalLayout
      title={
        activeSection === 'empresa'
          ? 'Empresa'
          : activeSection === 'seguridad'
            ? 'Seguridad'
            : activeSection === 'soporte'
              ? 'Soporte'
              : 'Perfil'
      }
      subtitle={activeSection === 'empresa'
        ? 'Información comercial y fiscal de la empresa.'
        : activeSection === 'seguridad'
          ? 'Sesiones y seguridad de tu cuenta.'
          : activeSection === 'soporte'
            ? 'Canales de ayuda y soporte ManeComb.'
            : 'Cuenta, empresa, facturación y seguridad en un solo lugar.'}>
      {activeSection === 'resumen' ? (
        <>
          {user ? <PortalAccountCenter subscription={subscription} user={user} /> : null}
          <View style={styles.profileWorkspace}>
            <View style={styles.profileMainColumn}>
              {personalSection}
              {companySection}
            </View>
            <View style={styles.profileSideColumn}>
              {passwordSection}
              {sessionsSection}
            </View>
          </View>
        </>
      ) : null}

      {activeSection === 'empresa' ? companySection : null}

      {activeSection === 'seguridad' ? (
        <View style={styles.profileWorkspace}>
          <View style={styles.profileMainColumn}>{passwordSection}</View>
          <View style={styles.profileSideColumn}>{sessionsSection}</View>
        </View>
      ) : null}

      {activeSection === 'soporte' ? (
        <PortalProfileSupportSection
          onOpenCommercialSupport={() => void Linking.openURL('mailto:soporte@manecomb.com')}
          onOpenOperationalSupport={() => router.push('/portal' as never)}
        />
      ) : null}

      <ConfirmModal
        visible={Boolean(sessionToRevoke)}
        title="Cerrar sesión remota"
        description={`Se cerrará la sesión en ${sessionToRevoke?.deviceName || 'el dispositivo seleccionado'}. La persona deberá iniciar sesión de nuevo.`}
        confirmLabel="Cerrar sesión"
        destructive
        processing={isSessionSubmitting}
        onCancel={() => setSessionToRevoke(null)}
        onConfirm={() => {
          if (!sessionToRevoke) return;
          void revokeSession(sessionToRevoke.id).then((result) => {
            setSessionMessage(result.ok ? 'La sesión remota fue cerrada.' : result.message || 'No fue posible cerrar la sesión.');
            if (result.ok) setSessionToRevoke(null);
          });
        }}
      />

      <ConfirmModal
        visible={revokeAllOpen}
        title="Cerrar todas las demás sesiones"
        description="Tu sesión actual permanecerá abierta. Los demás dispositivos tendrán que iniciar sesión de nuevo."
        confirmLabel="Cerrar las demás"
        destructive
        processing={revokingAll}
        onCancel={() => setRevokeAllOpen(false)}
        onConfirm={() => void revokeAllOtherSessions()}
      />
    </PortalLayout>
  );
}
