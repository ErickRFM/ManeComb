import { isAxiosError } from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StatusBadge, type StatusBadgeTone } from '@/src/components/ui/status-badge';
import { EmptyState } from '@/src/components/ui/empty-state';
import { getApiErrorMessage } from '@/src/api/client';
import { getSavedRoutesRequest } from '@/src/lib/api';
import type { SavedRoute, GeoPoint } from '@/src/types/app';
import { PortalButton } from '../../components/portal-button';
import { portalPalette } from '../../portal-theme';
import { styles } from '../routes.styles';
import {
  activateRouteAssignment,
  createRouteAssignment,
  listRouteAssignments,
  type RouteAssignmentStatus,
  type VehicleRouteAssignment,
} from '../route-assignments.api';

type AssignmentVehicle = {
  id: string;
  code: string;
  routeId?: string | null;
  assignedRoute?: unknown;
  routeColor?: string;
};

const statusCopy: Record<RouteAssignmentStatus, { label: string; tone: StatusBadgeTone }> = {
  AVAILABLE: { label: 'Disponible', tone: 'info' },
  SCHEDULED: { label: 'Programada', tone: 'warning' },
  ACTIVE: { label: 'Activa', tone: 'positive' },
  COMPLETED: { label: 'Completada', tone: 'neutral' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
  EXPIRED: { label: 'Vencida', tone: 'negative' },
};

function toIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export function RouteAssignedPanel({
  selectedVehicle,
  selectedSavedRoute,
  routeLabel,
  routeGeometry,
  onEdit,
  onClear: legacyOnClear,
}: {
  selectedVehicle: AssignmentVehicle | null;
  selectedSavedRoute: SavedRoute | null;
  routeLabel: string;
  routeGeometry: GeoPoint[];
  onEdit: () => void;
  onClear: () => void;
}) {
  void routeLabel;
  void routeGeometry;
  void legacyOnClear;

  const [assignments, setAssignments] = useState<VehicleRouteAssignment[]>([]);
  const [catalog, setCatalog] = useState<SavedRoute[]>([]);
  const [priority, setPriority] = useState('0');
  const [selectableByDriver, setSelectableByDriver] = useState(true);
  const [scheduledFrom, setScheduledFrom] = useState('');
  const [scheduledUntil, setScheduledUntil] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const routeById = useMemo(
    () => new Map(catalog.map((route) => [route.id, route])),
    [catalog]
  );
  const activeCount = assignments.filter((assignment) => assignment.status === 'ACTIVE').length;

  const reload = async () => {
    if (!selectedVehicle?.id) {
      setAssignments([]);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const [nextAssignments, routes] = await Promise.all([
        listRouteAssignments(selectedVehicle.id),
        catalog.length ? Promise.resolve(catalog) : getSavedRoutesRequest(),
      ]);
      setAssignments(nextAssignments);
      setCatalog(routes);
    } catch (error) {
      setMessage(
        isAxiosError(error)
          ? getApiErrorMessage(error, 'No fue posible cargar las asignaciones de la unidad.')
          : 'No fue posible cargar las asignaciones de la unidad.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [selectedVehicle?.id]);

  const addAssignment = async () => {
    if (!selectedVehicle || !selectedSavedRoute || busyId) return;
    const numericPriority = Number(priority);
    if (!Number.isInteger(numericPriority) || numericPriority < 0 || numericPriority > 999) {
      setMessage('La prioridad debe ser un entero entre 0 y 999. Menor número significa mayor prioridad.');
      return;
    }
    const from = toIso(scheduledFrom);
    const until = toIso(scheduledUntil);
    if (from === undefined || until === undefined) {
      setMessage('La fecha programada no tiene un formato válido. Usa fecha y hora completas.');
      return;
    }
    if (from && until && new Date(until).getTime() <= new Date(from).getTime()) {
      setMessage('La vigencia final debe ser posterior al inicio.');
      return;
    }

    setBusyId('create');
    setMessage(null);
    try {
      await createRouteAssignment({
        vehicleId: selectedVehicle.id,
        routeId: selectedSavedRoute.id,
        priority: numericPriority,
        selectableByDriver,
        scheduledFrom: from,
        scheduledUntil: until,
      });
      setMessage(`Asignación creada para ${selectedSavedRoute.name}. Actívala cuando deba convertirse en la ruta operativa.`);
      await reload();
    } catch (error) {
      setMessage(
        isAxiosError(error)
          ? getApiErrorMessage(error, 'No fue posible crear la asignación.')
          : 'No fue posible crear la asignación.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const activate = async (assignment: VehicleRouteAssignment) => {
    if (busyId) return;
    setBusyId(assignment.id);
    setMessage(null);
    try {
      const result = await activateRouteAssignment(assignment);
      setMessage(
        result.outcome === 'IDEMPOTENT'
          ? 'La asignación ya estaba activa.'
          : 'Asignación activada y proyectada en la unidad.'
      );
      await reload();
    } catch (error) {
      setMessage(
        isAxiosError(error)
          ? getApiErrorMessage(error, 'No fue posible activar la asignación.')
          : 'No fue posible activar la asignación.'
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={[styles.assignedPanel, { gap: 12 }]}>
      <View style={styles.panelHeading}>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={styles.panelTitle}>Asignaciones de {selectedVehicle?.code || '—'}</Text>
          <Text style={styles.assignedDate}>Catálogo, prioridad, programación y ruta activa.</Text>
        </View>
        <Text style={styles.panelCount}>{assignments.length}</Text>
      </View>

      {message ? (
        <View style={{ alignItems: 'flex-start', backgroundColor: portalPalette.infoSoft, borderColor: portalPalette.line, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 10 }}>
          <MaterialCommunityIcons name="information-outline" size={17} color={portalPalette.info} />
          <Text style={[styles.assignedDate, { flex: 1 }]}>{message}</Text>
        </View>
      ) : null}

      {selectedVehicle && selectedSavedRoute ? (
        <View style={{ backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: 12, borderWidth: 1, gap: 10, padding: 12 }}>
          <View style={styles.assignedHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.assignedName}>Preparar: {selectedSavedRoute.name}</Text>
              <Text style={styles.assignedDate}>{selectedSavedRoute.originLabel || 'Origen'} → {selectedSavedRoute.destinationLabel || 'Destino'}</Text>
            </View>
            <PortalButton onPress={onEdit} size="sm" variant="secondary">Editar catálogo</PortalButton>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ flex: 1, flexBasis: 120, gap: 5 }}>
              <Text style={styles.assignedDate}>Prioridad</Text>
              <TextInput
                accessibilityLabel="Prioridad de asignación"
                keyboardType="number-pad"
                onChangeText={setPriority}
                placeholder="0"
                placeholderTextColor={portalPalette.mutedSoft}
                style={{ backgroundColor: portalPalette.surface, borderColor: portalPalette.lineStrong, borderRadius: 9, borderWidth: 1, color: portalPalette.text, minHeight: 42, paddingHorizontal: 11 }}
                value={priority}
              />
            </View>
            <View style={{ flex: 1, flexBasis: 190, gap: 5 }}>
              <Text style={styles.assignedDate}>Disponible desde (opcional)</Text>
              <TextInput
                accessibilityLabel="Inicio programado"
                onChangeText={setScheduledFrom}
                placeholder="2026-08-06T06:00"
                placeholderTextColor={portalPalette.mutedSoft}
                style={{ backgroundColor: portalPalette.surface, borderColor: portalPalette.lineStrong, borderRadius: 9, borderWidth: 1, color: portalPalette.text, minHeight: 42, paddingHorizontal: 11 }}
                value={scheduledFrom}
              />
            </View>
            <View style={{ flex: 1, flexBasis: 190, gap: 5 }}>
              <Text style={styles.assignedDate}>Disponible hasta (opcional)</Text>
              <TextInput
                accessibilityLabel="Fin programado"
                onChangeText={setScheduledUntil}
                placeholder="2026-08-06T22:00"
                placeholderTextColor={portalPalette.mutedSoft}
                style={{ backgroundColor: portalPalette.surface, borderColor: portalPalette.lineStrong, borderRadius: 9, borderWidth: 1, color: portalPalette.text, minHeight: 42, paddingHorizontal: 11 }}
                value={scheduledUntil}
              />
            </View>
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selectableByDriver }}
            onPress={() => setSelectableByDriver((current) => !current)}
            style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
            <MaterialCommunityIcons
              name={selectableByDriver ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
              size={21}
              color={selectableByDriver ? portalPalette.success : portalPalette.muted}
            />
            <Text style={styles.assignedDate}>Permitir que el conductor seleccione esta ruta</Text>
          </Pressable>

          <View style={{ alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
            <Text style={styles.assignedDate}>Prioridad menor = se muestra primero. Crear no cambia la ruta activa.</Text>
            <PortalButton
              disabled={Boolean(busyId)}
              icon="plus"
              loading={busyId === 'create'}
              onPress={() => void addAssignment()}
              size="sm">
              Crear asignación
            </PortalButton>
          </View>
        </View>
      ) : (
        <EmptyState
          icon="routes"
          title={selectedVehicle ? 'Selecciona una ruta del catálogo' : 'Selecciona una unidad'}
          description="La asignación se crea aquí sin sobrescribir automáticamente la ruta operativa."
        />
      )}

      {loading ? (
        <Text style={styles.assignedDate}>Cargando asignaciones...</Text>
      ) : assignments.length ? (
        <View style={{ gap: 9 }}>
          <View style={styles.panelHeading}>
            <Text style={styles.panelTitle}>Historial y disponibilidad</Text>
            <StatusBadge label={`${activeCount} activa`} tone={activeCount ? 'positive' : 'neutral'} />
          </View>
          {assignments.map((assignment) => {
            const route = routeById.get(assignment.routeId);
            const copy = statusCopy[assignment.status] || { label: assignment.status, tone: 'neutral' as StatusBadgeTone };
            const canActivate = ['AVAILABLE', 'SCHEDULED'].includes(assignment.status) && activeCount === 0;
            const from = formatDateTime(assignment.scheduledFrom);
            const until = formatDateTime(assignment.scheduledUntil);

            return (
              <View key={assignment.id} style={{ backgroundColor: assignment.status === 'ACTIVE' ? portalPalette.successSoft : portalPalette.surfaceSoft, borderColor: assignment.status === 'ACTIVE' ? portalPalette.success : portalPalette.line, borderRadius: 11, borderWidth: 1, gap: 8, padding: 11 }}>
                <View style={styles.assignedHeader}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={styles.assignedName}>{route?.name || `Ruta ${assignment.routeId.slice(0, 8)}`}</Text>
                    <Text style={styles.assignedDate}>
                      Prioridad {assignment.priority} · {assignment.selectableByDriver ? 'Seleccionable por conductor' : 'Solo administración'}
                    </Text>
                    {from || until ? (
                      <Text style={styles.assignedDate}>{from ? `Desde ${from}` : 'Sin inicio'} · {until ? `Hasta ${until}` : 'Sin vencimiento'}</Text>
                    ) : null}
                  </View>
                  <StatusBadge label={copy.label} tone={copy.tone} />
                </View>
                {canActivate ? (
                  <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <PortalButton
                      disabled={Boolean(busyId)}
                      icon="play-circle-outline"
                      loading={busyId === assignment.id}
                      onPress={() => void activate(assignment)}
                      size="sm">
                      Activar ruta
                    </PortalButton>
                  </View>
                ) : assignment.status !== 'ACTIVE' && activeCount > 0 ? (
                  <Text style={styles.assignedDate}>Existe otra ruta activa. Finaliza la jornada y cambia la asignación de forma controlada.</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : selectedVehicle ? (
        <EmptyState
          icon="playlist-plus"
          title="Sin asignaciones registradas"
          description="Selecciona una ruta y crea la primera asignación oficial para esta unidad."
        />
      ) : null}
    </View>
  );
}
