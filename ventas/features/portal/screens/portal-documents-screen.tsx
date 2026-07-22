import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { palette } from '@/constants/theme';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { resolveDocumentUrl } from '@/src/api/client';
import { useAppStore } from '@/src/store/use-app-store';
import { formatDate } from '@/src/utils/format';
import { PortalSectionCard } from '../cards';
import { PortalLayout } from '../components/portal-layout';
import { PortalDataList, PortalDataRow } from '../components/portal-data-list';
import { usePortalStore } from '../store/use-portal-store';
import { styles } from '../documents/documents.styles';
import { getStatusMeta } from '../documents/documents.utils';
import type { DocumentItem as ApiDocumentItem } from '@/src/types/app';

type DocumentItem = ApiDocumentItem & {
  ownerName?: string;
  ownerCode?: string;
  organizationName?: string;
};

const REVIEW_STATUS_OPTIONS = ['pending_review', 'approved', 'rejected'] as const;

export function PortalDocumentsScreen() {
  const { user, vehicles } = useAppStore(
    useShallow((state) => ({
      user: state.user,
      vehicles: state.vehicles,
    }))
  );
  const { documents, isSubmitting, loadDocuments, reviewDocument } = usePortalStore(
    useShallow((state) => ({
      documents: state.documents,
      isSubmitting: state.isSubmitting,
      loadDocuments: state.loadDocuments,
      reviewDocument: state.reviewDocument,
    }))
  );
  const canManageDocuments = Boolean(user && ['owner', 'admin', 'supervisor'].includes(user.role));
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [reviewTarget, setReviewTarget] = useState<DocumentItem | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string>('pending_review');
  const [reviewNotes, setReviewNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const hydratedDocuments = useMemo(() => {
    return documents.map((doc) => {
      const owner = doc.ownerType === 'vehicle'
        ? vehicles.find((v) => v.id === doc.ownerId)
        : null;
      return { ...doc, ownerName: owner?.code, ownerCode: owner?.code } as DocumentItem;
    });
  }, [documents, vehicles]);

  const filtered = useMemo(() => {
    if (!filterStatus) return hydratedDocuments;
    return hydratedDocuments.filter((d) => d.reviewStatus === filterStatus || d.status === filterStatus);
  }, [hydratedDocuments, filterStatus]);

  const handleReview = async () => {
    if (!reviewTarget) return;
    const result = await reviewDocument(reviewTarget.id, { reviewStatus: reviewStatus as string, reviewNotes });
    setMessage(result.ok ? 'Documento actualizado.' : result.message || 'No fue posible actualizar.');
    if (result.ok) setReviewTarget(null);
  };

  return (
    <PortalLayout title="Documentos" subtitle="Administración de documentos de conductores y unidades.">
      {canManageDocuments ? (
        <View style={[styles.contextNotice, { backgroundColor: palette.infoSoft, borderColor: palette.line }]}>
          <View style={[styles.contextIcon, { backgroundColor: palette.surfaceAlt }]}>
            <MaterialCommunityIcons name="file-document-outline" size={20} color={palette.info} />
          </View>
          <View style={styles.contextCopy}>
            <Text style={[styles.contextTitle, { color: palette.text }]}>Gestión de documentos</Text>
            <Text style={[styles.contextText, { color: palette.muted }]}>
              Revisa, aprueba o rechaza los documentos subidos por conductores y unidades.
            </Text>
          </View>
        </View>
      ) : null}

      <PortalSectionCard title="Documentos" subtitle={message || `${filtered.length} registro${filtered.length === 1 ? '' : 's'}`}>
        <View style={styles.filterRow}>
          {['', 'pending_review', 'approved', 'rejected'].map((status) => (
            <Pressable
              key={status}
              accessibilityRole="button"
              onPress={() => setFilterStatus(status)}
              style={[styles.filterChip, filterStatus === status ? styles.filterChipActive : undefined]}>
              <Text style={[styles.filterChipText, filterStatus === status ? styles.filterChipTextActive : undefined]}>
                {status ? getStatusMeta(status).label : 'Todos'}
              </Text>
            </Pressable>
          ))}
        </View>

        {filtered.length ? (
          <PortalDataList>
            {filtered.map((doc) => {
              const meta = getStatusMeta(doc.reviewStatus || doc.status);
              return (
                <PortalDataRow key={doc.id} leading={<View style={styles.docIcon}>
                    <MaterialCommunityIcons name="file-document-outline" size={24} color={palette.accent} />
                  </View>} body={<>
                    <Text style={[styles.docName, { color: palette.text }]}>{doc.name}</Text>
                    <Text style={[styles.docMeta, { color: palette.muted }]}>
                      {doc.ownerType === 'vehicle' ? 'Unidad' : 'Conductor'}: {doc.ownerName || doc.ownerId} · {doc.category}
                    </Text>
                    <Text style={[styles.docMeta, { color: palette.muted }]}>
                      Subido: {formatDate(doc.uploadedAt, { fallback: '—' })} · Vence: {formatDate(doc.expiresAt, { fallback: 'Sin vencimiento' })}
                    </Text>
                  </>} meta={<StatusBadge label={meta.label} tone={meta.tone} />} actions={<View style={styles.rowActions}>
                      {doc.fileUrl || doc.storageKey ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Descargar documento"
                          onPress={() => {
                            const url = doc.fileUrl || (doc.storageKey ? resolveDocumentUrl(doc.storageKey) : null);
                            if (url) Linking.openURL(url).catch(() => {});
                          }}
                          style={[styles.iconAction, { backgroundColor: palette.infoSoft }]}>
                          <MaterialCommunityIcons name="download" size={16} color={palette.info} />
                        </Pressable>
                      ) : null}
                      {canManageDocuments ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Revisar documento"
                          onPress={() => { setReviewTarget(doc); setReviewStatus(doc.reviewStatus || 'pending_review'); setReviewNotes(''); }}
                          style={[styles.iconAction, { backgroundColor: palette.accentSoft }]}>
                          <MaterialCommunityIcons name="check-circle-outline" size={16} color={palette.accent} />
                        </Pressable>
                      ) : null}
                    </View>} />
              );
            })}
          </PortalDataList>
        ) : (
          <EmptyState icon="file-document-outline" title="Sin documentos" description="No hay documentos disponibles para revisión." />
        )}
      </PortalSectionCard>

      <ConfirmModal
        visible={Boolean(reviewTarget)}
        title="Revisar documento"
        description={reviewTarget ? `${reviewTarget.name} — ${reviewTarget.ownerName || reviewTarget.ownerId}` : ''}
        confirmLabel="Guardar"
        processing={isSubmitting}
        onCancel={() => setReviewTarget(null)}
        onConfirm={handleReview}>
        <View style={styles.reviewSelector}>
          {REVIEW_STATUS_OPTIONS.map((status) => (
            <Pressable
              key={status}
              accessibilityRole="button"
              onPress={() => setReviewStatus(status)}
              style={[
                styles.reviewOption,
                { borderColor: reviewStatus === status ? palette.info : palette.line },
                reviewStatus === status ? { backgroundColor: palette.infoSoft } : { backgroundColor: palette.surface },
              ]}>
              <Text style={[styles.reviewOptionText, { color: reviewStatus === status ? palette.info : palette.text }]}>
                {status === 'approved' ? 'Aprobar' : status === 'rejected' ? 'Rechazar' : 'Pendiente'}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={reviewNotes}
          onChangeText={setReviewNotes}
          placeholder="Notas de revisión (opcional)"
          placeholderTextColor={palette.muted}
          multiline
          style={[styles.reviewInput, { borderColor: palette.lineStrong, color: palette.text }]}
        />
      </ConfirmModal>
    </PortalLayout>
  );
}
