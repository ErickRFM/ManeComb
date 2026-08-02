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
import { PortalLayout } from '../components/portal-layout';
import { PortalDataList, PortalDataRow } from '../components/portal-data-list';
import { styles } from './documents.styles';
import { getDocumentSummary, getStatusMeta, isDocumentExpired, matchesDocumentFilter } from './documents.utils';

type HydratedDocument = DocumentItem & { ownerLabel: string; vehicleLabel: string };
type Dialog = 'review' | 'edit' | 'delete' | 'detail' | 'history' | null;

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
  const canManage = Boolean(user && ['owner', 'admin', 'supervisor'].includes(user.role));

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

  const openDialog = (next: Dialog, document: HydratedDocument) => {
    setTarget(document);
    setDialog(next);
    setNotes(document.reviewNotes || '');
    setReviewStatus(document.reviewStatus === 'rejected' ? 'rejected' : 'approved');
    setName(document.name);
    setExpiresAt(document.expiresAt.slice(0, 10));
    setMessage(null);
  };

  const closeDialog = () => { if (!submitting) { setDialog(null); setTarget(null); setHistory([]); } };

  const submit = async () => {
    if (!target || !dialog) return;
    if (dialog === 'detail' || dialog === 'history') return closeDialog();
    if (dialog === 'review' && reviewStatus === 'rejected' && !notes.trim()) {
      setMessage('Las notas son obligatorias al rechazar un documento.');
      return;
    }
    if (dialog === 'delete' && !notes.trim()) {
      setMessage('Escribe el motivo de eliminación.');
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
    try { setHistory(await getDocumentHistoryRequest(document.id)); }
    catch { setMessage('No fue posible cargar el historial.'); }
  };

  const toggleDeleted = async () => {
    const next = !includeDeleted;
    setIncludeDeleted(next);
    setFilter(next ? 'deleted' : '');
    await refresh(next);
  };

  const filters = ['', 'pending_review', 'approved', 'rejected', 'expired'];

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
          <TextInput value={search} onChangeText={setSearch} placeholder="Buscar conductor, unidad o documento" placeholderTextColor={palette.muted} style={styles.searchInput} />
          {filters.map((status) => <Pressable key={status} onPress={() => setFilter(status)} style={[styles.filterChip, filter === status ? styles.filterChipActive : undefined]}>
            <Text style={[styles.filterChipText, filter === status ? styles.filterChipTextActive : undefined]}>{status ? getStatusMeta(status).label : 'Todos'}</Text>
          </Pressable>)}
          {canManage ? <Pressable onPress={() => void toggleDeleted()} style={[styles.filterChip, includeDeleted ? styles.filterChipActive : undefined]}>
            <Text style={[styles.filterChipText, includeDeleted ? styles.filterChipTextActive : undefined]}>Eliminados</Text>
          </Pressable> : null}
        </View>

        {loading ? <Text style={styles.docMeta}>Cargando documentos…</Text> : filtered.length ? <PortalDataList>
          {filtered.map((document) => {
            const state = document.deletedAt ? 'deleted' : isDocumentExpired(document.expiresAt) ? 'expired' : document.reviewStatus || document.status;
            const meta = getStatusMeta(state);
            return <PortalDataRow key={document.id} leading={<View style={styles.docIcon}><MaterialCommunityIcons name="file-document-outline" size={24} color={palette.accent} /></View>}
              body={<><Text style={styles.docName}>{document.name}</Text><Text style={styles.docMeta}>{document.ownerLabel} · {document.vehicleLabel}</Text><Text style={styles.docMeta}>Versión {document.version || 1} · Vence {formatDate(document.expiresAt, { fallback: 'Sin vigencia' })}</Text></>}
              meta={<StatusBadge label={meta.label} tone={meta.tone} />}
              actions={<View style={styles.rowActions}>
                {!document.deletedAt && document.storageKey ? <Pressable accessibilityLabel="Descargar documento" onPress={() => void downloadDocumentRequest(document.storageKey!, document.originalFileName || document.name)} style={styles.iconAction}><MaterialCommunityIcons name="download" size={16} color={palette.info} /></Pressable> : null}
                <Pressable accessibilityLabel="Ver detalle" onPress={() => openDialog('detail', document)} style={styles.iconAction}><MaterialCommunityIcons name="information-outline" size={16} color={palette.info} /></Pressable>
                <Pressable accessibilityLabel="Ver historial" onPress={() => void showHistory(document)} style={styles.iconAction}><MaterialCommunityIcons name="history" size={16} color={palette.info} /></Pressable>
                {canManage && !document.deletedAt ? <><Pressable accessibilityLabel="Editar documento" onPress={() => openDialog('edit', document)} style={styles.iconAction}><MaterialCommunityIcons name="pencil-outline" size={16} color={palette.accent} /></Pressable><Pressable accessibilityLabel="Revisar documento" onPress={() => openDialog('review', document)} style={styles.iconAction}><MaterialCommunityIcons name="check-circle-outline" size={16} color={palette.accent} /></Pressable><Pressable accessibilityLabel="Eliminar documento" onPress={() => openDialog('delete', document)} style={styles.iconAction}><MaterialCommunityIcons name="delete-outline" size={16} color={palette.danger} /></Pressable></> : null}
              </View>} />;
          })}
        </PortalDataList> : <EmptyState icon="file-document-outline" title="Sin documentos" description="No hay documentos para los filtros seleccionados." />}
      </PortalSectionCard>

      <ConfirmModal visible={Boolean(dialog && target)} title={dialog === 'review' ? 'Revisar documento' : dialog === 'edit' ? 'Editar documento' : dialog === 'delete' ? 'Eliminar documento' : dialog === 'history' ? 'Historial de versiones' : 'Detalle documental'} description={target ? `${target.ownerLabel} · ${target.vehicleLabel}` : ''} confirmLabel={dialog === 'delete' ? 'Eliminar' : dialog === 'detail' || dialog === 'history' ? 'Cerrar' : 'Guardar'} destructive={dialog === 'delete'} processing={submitting} onCancel={closeDialog} onConfirm={() => void submit()}>
        {dialog === 'review' ? <><View style={styles.reviewSelector}>{(['approved', 'rejected'] as const).map((status) => <Pressable key={status} onPress={() => setReviewStatus(status)} style={[styles.reviewOption, { borderColor: reviewStatus === status ? palette.info : palette.line }]}><Text style={styles.reviewOptionText}>{status === 'approved' ? 'Aprobar' : 'Rechazar'}</Text></Pressable>)}</View><TextInput value={notes} onChangeText={setNotes} multiline placeholder={reviewStatus === 'rejected' ? 'Motivo obligatorio del rechazo' : 'Notas de revisión'} placeholderTextColor={palette.muted} style={styles.reviewInput} /></> : null}
        {dialog === 'edit' ? <View style={styles.modalList}><TextInput value={name} onChangeText={setName} placeholder="Nombre" placeholderTextColor={palette.muted} style={styles.searchInput} /><TextInput value={expiresAt} onChangeText={setExpiresAt} placeholder="Vigencia AAAA-MM-DD" placeholderTextColor={palette.muted} style={styles.searchInput} /></View> : null}
        {dialog === 'delete' ? <TextInput value={notes} onChangeText={setNotes} multiline placeholder="Motivo obligatorio" placeholderTextColor={palette.muted} style={styles.reviewInput} /> : null}
        {dialog === 'detail' && target ? <View style={styles.detailBox}><Text style={styles.docName}>{target.name}</Text><Text style={styles.docMeta}>Archivo: {target.originalFileName || 'No disponible'}</Text><Text style={styles.docMeta}>Tipo: {target.mimeType || 'No registrado'} · Tamaño: {target.fileSize ? `${Math.ceil(target.fileSize / 1024)} KB` : 'No registrado'}</Text><Text style={styles.docMeta}>Subido: {formatDate(target.uploadedAt, { fallback: '—' })}</Text>{target.reviewNotes ? <Text style={styles.docMeta}>Notas: {target.reviewNotes}</Text> : null}</View> : null}
        {dialog === 'history' ? <View style={styles.modalList}>{history.length ? history.map((entry) => <View key={entry.id} style={styles.detailBox}><Text style={styles.docName}>Versión {entry.version || 1}</Text><Text style={styles.docMeta}>{entry.originalFileName || entry.name} · {entry.deletedAt ? 'Eliminada' : getStatusMeta(entry.reviewStatus || entry.status).label}</Text></View>) : <Text style={styles.docMeta}>Cargando historial…</Text>}</View> : null}
        {message ? <Text style={styles.docMeta}>{message}</Text> : null}
      </ConfirmModal>
    </PortalLayout>
  );
}
