import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import {
  deleteDriverDocumentRequest,
  getApiErrorMessage,
  getDocumentHistoryRequest,
  getDocumentsRequest,
  replaceDriverDocumentRequest,
  updateDriverDocumentRequest,
  uploadDriverDocumentRequest,
  type DocumentUploadFile,
} from '@/src/api/client';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { StatusPill } from '@/src/components/status-pill';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { openAuthenticatedDocument } from '@/src/native/document-files';
import { pickSupportedDocument } from '@/src/native/document-picker';
import { useAppStore } from '@/src/store/use-app-store';
import type { DocumentItem } from '@/src/types/app';
import { createDocumentStyles } from './documents-screen.styles';
import {
  DRIVER_DOCUMENT_CATEGORY,
  DRIVER_DOCUMENT_NAME,
  canDeleteDocument,
  canEditDocument,
  canReplaceDocument,
  getDocumentStatus,
  normalizeDocumentDate,
} from './documents.utils';

type EditorMode = 'create' | 'edit' | 'replace';

export function DriverDocumentsScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createDocumentStyles(theme), [theme]);
  const { documents, networkStatus, token, user } = useAppStore(useShallow((state) => ({ documents: state.documents, networkStatus: state.networkStatus, token: state.token, user: state.user })));
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode | null>(null);
  const [target, setTarget] = useState<DocumentItem | null>(null);
  const [name, setName] = useState(DRIVER_DOCUMENT_NAME);
  const [expiresAt, setExpiresAt] = useState('');
  const [file, setFile] = useState<(DocumentUploadFile & { size?: number | null }) | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<DocumentItem | null>(null);
  const [history, setHistory] = useState<DocumentItem[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await getDocumentsRequest();
      useAppStore.setState({ documents: next });
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible cargar tus documentos.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const openEditor = (nextMode: EditorMode, document?: DocumentItem) => {
    setMode(nextMode);
    setTarget(document || null);
    setName(document?.name || DRIVER_DOCUMENT_NAME);
    setExpiresAt(document?.expiresAt ? document.expiresAt.slice(0, 10) : '');
    setFile(null);
    setMessage(null);
  };

  const pickFile = async () => {
    if (!name.trim()) return setMessage('Escribe el nombre del documento antes de seleccionar el archivo.');
    if (!normalizeDocumentDate(expiresAt)) return setMessage('Ingresa una vigencia futura válida antes de seleccionar el archivo.');
    try {
      const selected = await pickSupportedDocument();
      if (!selected) return;
      setFile(selected);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible seleccionar el archivo.');
    }
  };

  const save = async () => {
    const normalizedDate = normalizeDocumentDate(expiresAt);
    if (!normalizedDate) return setMessage('Ingresa una vigencia válida con formato AAAA-MM-DD.');
    if ((mode === 'create' || mode === 'replace') && !file) return setMessage('Selecciona el archivo que deseas enviar.');
    if (!name.trim()) return setMessage('Escribe el nombre del documento.');
    if (mode === 'replace' && !replaceConfirm) return setReplaceConfirm(true);

    setSubmitting(true);
    try {
      if (mode === 'create' && file) {
        await uploadDriverDocumentRequest({ category: DRIVER_DOCUMENT_CATEGORY, expiresAt: normalizedDate, file, name: name.trim() });
      } else if (mode === 'replace' && target && file) {
        await replaceDriverDocumentRequest(target.id, { expiresAt: normalizedDate, file, name: name.trim() });
      } else if (mode === 'edit' && target) {
        await updateDriverDocumentRequest(target.id, { expiresAt: normalizedDate, name: name.trim() });
      }
      setMode(null);
      setReplaceConfirm(false);
      setMessage('Documento actualizado y enviado a revisión.');
      await refresh();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible guardar el documento.'));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await deleteDriverDocumentRequest(deleteTarget.id, 'Eliminado por el conductor');
      setDeleteTarget(null);
      setMessage('Documento eliminado.');
      await refresh();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible eliminar el documento.'));
    } finally {
      setSubmitting(false);
    }
  };

  const showHistory = async (document: DocumentItem) => {
    setHistoryTarget(document);
    setHistory([]);
    try {
      setHistory(await getDocumentHistoryRequest(document.id));
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible cargar el historial.'));
    }
  };

  const openFile = async (document: DocumentItem) => {
    if (!token || !document.storageKey) return setMessage('El archivo no está disponible.');
    try {
      setOpeningId(document.id);
      await openAuthenticatedDocument({
        storageKey: document.storageKey,
        token,
        fileName: document.originalFileName || document.name,
        mimeType: document.mimeType || 'application/octet-stream',
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible abrir el archivo.');
    } finally {
      setOpeningId(null);
    }
  };

  if (!user) return null;

  return (
    <AppShell scroll sectionKey="perfil" mobileTitle="Mis documentos" header={
      <View style={styles.header}>
        <Text style={styles.title}>Mis documentos</Text>
        <Text style={styles.subtitle}>Carga, consulta y conserva el historial de tu licencia.</Text>
      </View>
    }>
      <View style={styles.toolbar}>
        <Text style={styles.subtitle}>{networkStatus === 'offline' ? 'Sin conexión · mostrando la última información disponible' : message || `${documents.length} documento${documents.length === 1 ? '' : 's'} activo${documents.length === 1 ? '' : 's'}`}</Text>
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => void refresh()} style={styles.secondaryButton}><Text style={styles.secondaryText}>Reintentar / actualizar</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => openEditor('create')} style={styles.primaryButton}>
          <MaterialCommunityIcons name="file-plus-outline" size={20} color="#FFFFFF" />
          <Text style={styles.primaryText}>Subir documento</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={theme.colors.accent} /> : null}
      <View style={styles.list}>
        {!loading && !documents.length ? <AppCard><Text style={styles.empty}>Aún no has cargado documentos.</Text></AppCard> : null}
        {documents.map((document) => {
          const status = getDocumentStatus(document);
          return (
            <AppCard key={document.id}>
              <View style={styles.cardHeader}>
                <View style={styles.copy}>
                  <Text style={styles.name}>{document.name}</Text>
                  <Text style={styles.meta}>Versión {document.version || 1} · Vence {new Date(document.expiresAt).toLocaleDateString('es-MX')}</Text>
                  <Text style={styles.meta}>{document.originalFileName || 'Archivo protegido'}</Text>
                </View>
                <StatusPill label={status.label} tone={status.tone} />
              </View>
              {document.reviewStatus === 'rejected' && document.reviewNotes ? <Text style={styles.note}>{document.reviewNotes}</Text> : null}
              <View style={styles.actions}>
                <Pressable disabled={openingId === document.id} onPress={() => void openFile(document)} style={styles.action}>{openingId === document.id ? <ActivityIndicator color={theme.colors.accent} /> : <Text style={styles.actionText}>Abrir / descargar</Text>}</Pressable>
                {canEditDocument(document) ? <Pressable onPress={() => openEditor('edit', document)} style={styles.action}><Text style={styles.actionText}>Editar datos</Text></Pressable> : null}
                {canReplaceDocument(document) ? <Pressable onPress={() => openEditor('replace', document)} style={styles.action}><Text style={styles.actionText}>Reemplazar</Text></Pressable> : null}
                <Pressable onPress={() => void showHistory(document)} style={styles.action}><Text style={styles.actionText}>Historial</Text></Pressable>
                {canDeleteDocument(document) ? <Pressable onPress={() => setDeleteTarget(document)} style={styles.action}><Text style={[styles.actionText, styles.dangerText]}>Eliminar</Text></Pressable> : null}
              </View>
            </AppCard>
          );
        })}
      </View>

      <Modal visible={Boolean(mode)} transparent animationType="fade" onRequestClose={() => !submitting && setMode(null)}>
        <View style={styles.overlay}><View style={styles.modal}>
          <Text style={styles.modalTitle}>{mode === 'create' ? 'Subir documento' : mode === 'replace' ? 'Reemplazar documento' : 'Editar documento'}</Text>
          <Text style={styles.label}>Nombre</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor={theme.colors.muted} />
          <Text style={styles.label}>Vigencia</Text>
          <TextInput value={expiresAt} onChangeText={setExpiresAt} style={styles.input} placeholder="AAAA-MM-DD" placeholderTextColor={theme.colors.muted} />
          <Text style={styles.meta}>Tipo autorizado: Licencia tipo C</Text>
          {mode !== 'edit' ? <View style={styles.fileBox}>
            <Text style={styles.label}>{file && 'name' in file ? file.name : 'PDF, JPG, PNG o WEBP · máximo 15 MB'}</Text>
            <Pressable onPress={() => void pickFile()} style={styles.secondaryButton}><Text style={styles.secondaryText}>Seleccionar archivo</Text></Pressable>
          </View> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.modalActions}>
            <Pressable disabled={submitting} onPress={() => setMode(null)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancelar</Text></Pressable>
            <Pressable disabled={submitting} onPress={() => void save()} style={styles.primaryButton}>{submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Guardar</Text>}</Pressable>
          </View>
        </View></View>
      </Modal>

      <Modal visible={Boolean(historyTarget)} transparent animationType="fade" onRequestClose={() => setHistoryTarget(null)}>
        <View style={styles.overlay}><View style={styles.modal}>
          <Text style={styles.modalTitle}>Historial de versiones</Text>
          {history.length ? history.map((entry) => <View key={entry.id} style={styles.historyRow}>
            <Text style={styles.name}>Versión {entry.version || 1}</Text>
            <Text style={styles.meta}>{entry.originalFileName || entry.name} · {getDocumentStatus(entry).label}</Text>
          </View>) : <ActivityIndicator color={theme.colors.accent} />}
          <Pressable onPress={() => setHistoryTarget(null)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cerrar</Text></Pressable>
        </View></View>
      </Modal>

      <ConfirmModal visible={Boolean(deleteTarget)} title="Eliminar documento" description="Se retirará el registro activo y su archivo protegido. Esta acción no afecta versiones distintas." confirmLabel="Eliminar" danger processing={submitting} onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} />
      <ConfirmModal visible={replaceConfirm} title="Confirmar reemplazo" description="La versión actual quedará en el historial y el nuevo archivo volverá a revisión." confirmLabel="Reemplazar" processing={submitting} onCancel={() => setReplaceConfirm(false)} onConfirm={() => void save()} />
    </AppShell>
  );
}
