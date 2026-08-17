import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { palette } from '@/constants/theme';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { useAppStore } from '@/src/store/use-app-store';
import { formatDate } from '@/src/utils/format';
import type { DocumentItem } from '@/src/types/app';
import {
  deleteDocumentRequest,
  downloadDocumentRequest,
  getDocumentHistoryRequest,
  getDocumentsRequest,
  reviewDocumentRequest,
  updateDocumentRequest,
} from '../api';
import { PortalSectionCard } from '../cards';
import { PortalContentModal } from '../components/portal-content-modal';
import { PortalLayout } from '../components/portal-layout';
import { PortalDataList, PortalDataRow } from '../components/portal-data-list';
import { PortalPagination } from '../components/portal-pagination';
import { hasPortalPermission } from '../utils/access';
import { styles } from './documents.styles';
import { getDocumentSummary, getStatusMeta, isDocumentExpired, matchesDocumentFilter } from './documents.utils';

type HydratedDocument = DocumentItem & { ownerLabel: string; vehicleLabel: string };
type Dialog = 'review' | 'edit' | 'delete' | 'detail' | 'history' | null;

const PAGE_SIZE = 8;

export function DocumentsAdminScreen() {
  const { loadUsers, loadVehicles, user, users, vehicles } = useAppStore(useShallow((state) => ({
    loadUsers: state.loadUsers,
    loadVehicles: state.loadVehicles,
    user: state.user,
    users: state.users,
    vehicles: state.vehicles,
  })));
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [target, setTarget] = useState<HydratedDocument | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected'>('approved');
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [history, setHistory] = useState<DocumentItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [page, setPage] = useState(1);
  const canManage = hasPortalPermission(user, 'documents');
  const editDateValid = !expiresAt.trim() || /^\d{4}-\d{2}-\d{2}$/.test(expiresAt.trim());
  const dialogConfirmDisabled =
    (dialog === 'review' && reviewStatus === 'rejected' && !notes.trim()) ||
    (dialog === 'delete' && notes.trim().length < 3) ||
    (dialog === 'edit' && (!name.trim() || !editDateValid));

  const refresh = async (showDeleted = includeDeleted) => {
    setLoading(true);
    try {
      setDocuments(await getDocumentsRequest(showDeleted));
      setMessage(null);
    } catch {
      setMessage('No fue posible cargar los documentos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadUsers(), loadVehicles(), refresh()]);
  }, []);

  const hydrated = useMemo<HydratedDocument[]>(() => documents.map((document) => {
    const owner = document.ownerType === 'driver' ? users.find((entry) => entry.id === document.ownerId) : null;
    const vehicle = document.ownerType === 'vehicle'
      ? vehicles.find((entry) => entry.id === document.ownerId)
      : vehicles.find((entry) => entry.id === owner?.vehicleId);
    return {
      ...document,
      ownerLabel: document.ownerType === 'vehicle' ? 'Documento de unidad' : owner?.name || 'Conductor no disponible',
      vehicleLabel: vehicle?.code || 'Sin unidad asignada',
    };
  }), [documents, users, vehicles]);

  const missingDrivers = useMemo(() => users.filter((entry) => entry.role === 'driver' && !documents.some((document) =>
    !document.deletedAt && document.ownerType === 'driver' && document.ownerId === entry.id
  )), [documents, users]);
  const summary = useMemo(() => getDocumentSummary(documents, missingDrivers.length), [documents, missingDrivers.length]);
  const filtered = useMemo(() => hydrated.filter((document) => matchesDocumentFilter(document, filter, search)), [hydrated, filter, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleDocuments = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [filter, includeDeleted, search]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const openDialog = (next: Dialog, document: HydratedDocument) => {
    setTarget(document);
    setDialog(next);
    setNotes(document.reviewNotes || '');
    setReviewStatus(document.reviewStatus === 'rejected' ? 'rejected' : 'approved');
    setName(document.name);
    setExpiresAt(document.expiresAt.slice(0, 10));
    setMessage(null);
  };

  const closeDialog = () => {
    if (!submitting) {
      setDialog(null);
      setTarget(null);
      setHistory([]);
      setHistoryLoading(false);
    }
  };

  const submit = async () => {
    if (!target || !dialog || dialogConfirmDisabled) return;
    if (dialog === 'detail' || dialog === 'history') return closeDialog();
    if (!canManage) {
      setMessage('No tienes permiso para modificar documentos.');
      return;
    }
    setSubmitting(true);
    try {
      if (dialog === 'review') await reviewDocumentRequest(target.id, { reviewStatus, reviewNotes: notes.trim() });
      if (dialog === 'edit') await updateDocumentRequest(target.id, { name: name.trim(), expiresAt });
      if (dialog === 'delete') await deleteDocumentRequest(target.id, notes.trim());
      setDialog(null);
      setTarget(null);
      await refresh();
      setMessage('Operación documental completada.');
    } catch {
      setMessage('No fue posible completar la operación documental.');
    } finally {
      setSubmitting(false);
    }
  };

  const showHistory = async (document: HydratedDocument) => {
    openDialog('history', document);
    setHistoryLoading(true);
    setHistory([]);
    try {
      setHistory(await getDocumentHistoryRequest(document.id));
    } catch {
      setMessage('No fue posible cargar el historial.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const downloadDocument = async (document: HydratedDocument) => {
    if (!document.storageKey) return;
    setMessage(null);
    try {
      await downloadDocumentRequest(document.storageKey, document.originalFileName || document.name);
    } catch {
      setMessage('No fue posible descargar el documento. Revisa tu conexión e inténtalo de nuevo.');
    }
  };

  const toggleDeleted = async () => {
    if (!canManage) return;
    const next = !includeDeleted;
    setIncludeDeleted(next);
    setFilter(next ? 'deleted' : '');
    await refresh(next);
  };

  const filters = ['', 'pending_review', 'approved', 'rejected', 'expired'];
  const mutationDialogOpen = Boolean(target && (dialog === 'review' || dialog === 'edit' || dialog === 'delete'));

  return (
    <PortalLayout title="Documentos" subtitle="Control de vigencias, revisiones y versiones por conductor y unidad.">
      <View style={styles.summaryGrid}>
        {[
          ['Activos', summary.total], ['Pendientes', summary.pending], ['Rechazados', summary.rejected],
          ['Vencidos', summary.expired], ['Faltantes', summary.missing],
        ].map(([label, value]) => <View key={String(label)} style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text>
        </View>)}
      </View>

      <PortalSectionCard title="Expediente documental" subtitle={message || `${filtered.length} resultados`}>
        <View style={styles.filterRow}>
          <TextInput accessibilityLabel="Buscar documentos" value={search} onChangeText={setSearch} placeholder="Buscar conductor, unidad o documento" placeholderTextColor={palette.muted} style={styles.searchInput} />
          {filters.map((status) => <Pressable accessibilityRole="button" accessibilityState={{ selected: filter === status }} key={status} onPress={() => setFilter(status)} style={[styles.filterChip, filter === status ? styles.filterChipActive : undefined]}>
            <Text style={[styles.filterChipText, filter === status ? styles.filterChipTextActive : undefined]}>{status ? getStatusMeta(status).label : 'Todos'}</Text>
          </Pressable>)}
          {canManage ? <Pressable accessibilityRole="button" accessibilityState={{ selected: includeDeleted }} onPress={() => void toggleDeleted()} style={[styles.filterChip, includeDeleted ? styles.filterChipActive : undefined]}>
            <Text style={[styles.filterChipText, includeDeleted ? styles.filterChipTextActive : undefined]}>Eliminados</Text>
          </Pressable> : null}
        </View>

        {loading ? <Text style={styles.docMeta}>Cargando documentos…</Text> : filtered.length ? <>
          <PortalDataList>
            {visibleDocuments.map((document) => {
              const state = document.deletedAt ? 'deleted' : isDocumentExpired(document.expiresAt) ? 'expired' : document.reviewStatus || document.status;
              const meta = getStatusMeta(state);
              return <PortalDataRow key={document.id} leading={<View style={styles.docIcon}><MaterialCommunityIcons name="file-document-outline" size={24} color={palette.accent} /></View>}
                body={<><Text style={styles.docName}>{document.name}</Text><Text style={styles.docMeta}>{document.ownerLabel} · {document.vehicleLabel}</Text><Text style={styles.docMeta}>Versión {document.version || 1} · Vence {formatDate(document.expiresAt, { fallback: 'Sin vigencia' })}</Text></>}
                meta={<StatusBadge label={meta.label} tone={meta.tone} />}
                actions={<View style={styles.rowActions}>
                  {!document.deletedAt && document.storageKey ? <Pressable accessibilityRole="button" accessibilityLabel="Descargar documento" onPress={() => void downloadDocument(document)} style={styles.iconAction}><MaterialCommunityIcons name="download" size={16} color={palette.info} /></Pressable> : null}
                  <Pressable accessibilityRole="button" accessibilityLabel="Ver detalle" onPress={() => openDialog('detail', document)} style={styles.iconAction}><MaterialCommunityIcons name="information-outline" size={16} color={palette.info} /></Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Ver historial" onPress={() => void showHistory(document)} style={styles.iconAction}><MaterialCommunityIcons name="history" size={16} color={palette.info} /></Pressable>
                  {canManage && !document.deletedAt ? <><Pressable accessibilityRole="button" accessibilityLabel="Editar documento" onPress={() => openDialog('edit', document)} style={styles.iconAction}><MaterialCommunityIcons name="pencil-outline" size={16} color={palette.accent} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Revisar documento" onPress={() => openDialog('review', document)} style={styles.iconAction}><MaterialCommunityIcons name="check-circle-outline" size={16} color={palette.accent} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Eliminar documento" onPress={() => openDialog('delete', document)} style={styles.iconAction}><MaterialCommunityIcons name="delete-outline" size={16} color={palette.danger} /></Pressable></> : null}
                </View>} />;
            })}
          </PortalDataList>
          <PortalPagination
            itemLabel="documentos"
            onPageChange={setPage}
            page={safePage}
            pageSize={PAGE_SIZE}
            totalItems={filtered.length}
          />
        </> : <EmptyState icon="file-document-outline" title="Sin documentos" description="No hay documentos para los filtros seleccionados." />}
      </PortalSectionCard>

      <ConfirmModal
        visible={mutationDialogOpen}
        title={dialog === 'review' ? 'Revisar documento' : dialog === 'edit' ? 'Editar documento' : 'Eliminar documento'}
        description={target ? `${target.ownerLabel} · ${target.vehicleLabel}` : ''}
        confirmLabel={dialog === 'delete' ? 'Eliminar' : 'Guardar'}
        destructive={dialog === 'delete'}
        processing={submitting}
        confirmDisabled={dialogConfirmDisabled}
        onCancel={closeDialog}
        onConfirm={() => void submit()}>
        {dialog === 'review' ? <><View style={styles.reviewSelector}>{(['approved', 'rejected'] as const).map((status) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: reviewStatus === status }} key={status} onPress={() => setReviewStatus(status)} style={[styles.reviewOption, { borderColor: reviewStatus === status ? palette.info : palette.line }]}><Text style={styles.reviewOptionText}>{status === 'approved' ? 'Aprobar' : 'Rechazar'}</Text></Pressable>)}</View><TextInput accessibilityLabel="Notas de revisión" value={notes} onChangeText={setNotes} multiline placeholder={reviewStatus === 'rejected' ? 'Motivo obligatorio del rechazo' : 'Notas de revisión'} placeholderTextColor={palette.muted} style={styles.reviewInput} /></> : null}
        {dialog === 'edit' ? <View style={styles.modalList}><TextInput accessibilityLabel="Nombre del documento" value={name} onChangeText={setName} placeholder="Nombre" placeholderTextColor={palette.muted} style={styles.searchInput} /><TextInput accessibilityLabel="Vigencia del documento" value={expiresAt} onChangeText={setExpiresAt} placeholder="Vigencia AAAA-MM-DD" placeholderTextColor={palette.muted} style={styles.searchInput} /></View> : null}
        {dialog === 'delete' ? <TextInput accessibilityLabel="Motivo de eliminación" value={notes} onChangeText={setNotes} multiline placeholder="Motivo obligatorio" placeholderTextColor={palette.muted} style={styles.reviewInput} /> : null}
        {message ? <Text style={styles.docMeta}>{message}</Text> : null}
      </ConfirmModal>

      <PortalContentModal
        visible={Boolean(dialog === 'detail' && target)}
        onClose={closeDialog}
        title={target?.name || 'Detalle documental'}
        subtitle={target ? `${target.ownerLabel} · ${target.vehicleLabel}` : undefined}>
        {target ? <View style={styles.detailBox}>
          <Text style={styles.docName}>{target.name}</Text>
          <Text style={styles.docMeta}>Archivo: {target.originalFileName || 'No disponible'}</Text>
          <Text style={styles.docMeta}>Tipo: {target.mimeType || 'No registrado'} · Tamaño: {target.fileSize ? `${Math.ceil(target.fileSize / 1024)} KB` : 'No registrado'}</Text>
          <Text style={styles.docMeta}>Subido: {formatDate(target.uploadedAt, { fallback: '—' })}</Text>
          <Text style={styles.docMeta}>Vigencia: {formatDate(target.expiresAt, { fallback: 'Sin vigencia' })}</Text>
          {target.reviewNotes ? <Text style={styles.docMeta}>Notas: {target.reviewNotes}</Text> : null}
        </View> : null}
      </PortalContentModal>

      <PortalContentModal
        visible={Boolean(dialog === 'history' && target)}
        onClose={closeDialog}
        title="Historial de versiones"
        subtitle={target ? `${target.name} · ${target.ownerLabel}` : undefined}
        width="lg">
        {historyLoading ? (
          <Text style={styles.docMeta}>Cargando historial…</Text>
        ) : history.length ? (
          <View style={styles.modalList}>
            {history.map((entry) => <View key={entry.id} style={styles.detailBox}>
              <Text style={styles.docName}>Versión {entry.version || 1}</Text>
              <Text style={styles.docMeta}>{entry.originalFileName || entry.name} · {entry.deletedAt ? 'Eliminada' : getStatusMeta(entry.reviewStatus || entry.status).label}</Text>
              <Text style={styles.docMeta}>{formatDate(entry.uploadedAt, { fallback: 'Sin fecha' })}</Text>
            </View>)}
          </View>
        ) : (
          <EmptyState icon="history" title="Sin versiones anteriores" description="Este documento todavía no tiene historial de versiones adicional." />
        )}
        {message ? <Text style={styles.docMeta}>{message}</Text> : null}
      </PortalContentModal>
    </PortalLayout>
  );
}
