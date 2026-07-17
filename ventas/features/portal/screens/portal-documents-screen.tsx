import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, palette, Typography } from '@/constants/theme';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { EmptyState } from '@/src/components/ui/empty-state';
import { SkeletonBlock } from '@/src/components/ui/skeleton';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { resolveDocumentUrl } from '@/src/api/client';
import { useAppStore } from '@/src/store/use-app-store';
import { formatDate } from '@/src/utils/format';
import { PortalSectionCard, formatPortalStatus, getPortalStatusTone } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { portalButtonGradient, portalPalette } from '../portal-theme';
import { usePortalStore } from '../store/use-portal-store';
import type { DocumentItem as ApiDocumentItem } from '@/src/types/app';

type DocumentItem = ApiDocumentItem & {
  ownerName?: string;
  ownerCode?: string;
  organizationName?: string;
};

const REVIEW_STATUS_OPTIONS = ['pending_review', 'approved', 'rejected'] as const;

function getStatusMeta(status: string) {
  if (status === 'approved' || status === 'active') return { label: 'Aprobado', tone: 'positive' as const };
  if (status === 'rejected') return { label: 'Rechazado', tone: 'danger' as const };
  return { label: 'Pendiente', tone: 'warning' as const };
}

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
  const [uploadMode, setUploadMode] = useState(false);

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
          <View style={styles.list}>
            {filtered.map((doc) => {
              const meta = getStatusMeta(doc.reviewStatus || doc.status);
              return (
                <View key={doc.id} style={[styles.docRow, { borderColor: palette.line, backgroundColor: palette.surface }]}>
                  <View style={styles.docIcon}>
                    <MaterialCommunityIcons name="file-document-outline" size={24} color={palette.accent} />
                  </View>
                  <View style={styles.docBody}>
                    <Text style={[styles.docName, { color: palette.text }]}>{doc.name}</Text>
                    <Text style={[styles.docMeta, { color: palette.muted }]}>
                      {doc.ownerType === 'vehicle' ? 'Unidad' : 'Conductor'}: {doc.ownerName || doc.ownerId} · {doc.category}
                    </Text>
                    <Text style={[styles.docMeta, { color: palette.muted }]}>
                      Subido: {formatDate(doc.uploadedAt, { fallback: '—' })} · Vence: {formatDate(doc.expiresAt, { fallback: 'Sin vencimiento' })}
                    </Text>
                  </View>
                  <View style={styles.docActions}>
                    <StatusBadge label={meta.label} tone={meta.tone} />
                    <View style={styles.rowActions}>
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
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
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

const styles = StyleSheet.create({
  contextNotice: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: AppTheme.spacing.md,
  },
  contextIcon: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  contextCopy: {
    flex: 1,
    flexBasis: 260,
    minWidth: 0,
  },
  contextTitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  contextText: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    borderColor: portalPalette.lineStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: portalPalette.accent,
    borderColor: portalPalette.accent,
  },
  filterChipText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  list: {
    gap: 10,
    minWidth: 0,
  },
  docRow: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minWidth: 0,
    padding: 10,
  },
  docIcon: {
    alignItems: 'center',
    flexShrink: 0,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  docBody: {
    flex: 1,
    flexBasis: 200,
    gap: 2,
    minWidth: 0,
  },
  docName: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  docMeta: {
    fontFamily: Typography.body,
    fontSize: 11,
    lineHeight: 16,
  },
  docActions: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 6,
  },
  rowActions: {
    flexDirection: 'row',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: 6,
  },
  iconAction: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  reviewSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
    paddingVertical: 8,
  },
  reviewOption: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  reviewOptionText: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  reviewInput: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    minHeight: 60,
    padding: 10,
    textAlignVertical: 'top',
  },
});
